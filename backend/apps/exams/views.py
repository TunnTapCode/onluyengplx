from django.core import signing
from django.db import transaction
from django.db.models import Count, F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.question_bank.models import LicenseClass, Question
from .models import ExamConfiguration, ExamResult, ExamSession
from .serializers import (
    ExamAnswersSerializer,
    ExamConfigurationSerializer,
    ExamResultSerializer,
    ExamSessionCreateSerializer,
    ExamSessionResponseSerializer,
)
from .services import (
    InvalidDistribution,
    NotEnoughQuestions,
    create_session,
    finalize_session,
    public_questions,
    result_payload,
)


class ExamConfigurationViewSet(viewsets.ModelViewSet):
    serializer_class = ExamConfigurationSerializer
    queryset = ExamConfiguration.objects.select_related("license_class")
    permission_classes = [permissions.AllowAny]
    filterset_fields = ("license_class__code",)

    def get_queryset(self):
        queryset = super().get_queryset().order_by(
            "license_class__code", "name", "-version"
        )
        if self.request.user.is_staff:
            return queryset
        return queryset.filter(
            is_active=True,
            license_class__is_active=True,
        ).annotate(
            eligible_question_count=Count(
                "license_class__questions",
                filter=Q(license_class__questions__is_active=True),
                distinct=True,
            ),
            eligible_critical_question_count=Count(
                "license_class__questions",
                filter=Q(
                    license_class__questions__is_active=True,
                    license_class__questions__is_critical=True,
                ),
                distinct=True,
            ),
        ).filter(
            eligible_question_count__gte=F("question_count"),
            eligible_critical_question_count__gte=3,
        )

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

    def perform_destroy(self, instance):
        if instance.sessions.exists():
            raise ValidationError({
                "detail": "Không thể xóa cấu hình đã có phiên thi; hãy tắt hoạt động thay thế."
            })
        instance.delete()


class ExamConfigurationOptionsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        license_classes = list(
            LicenseClass.objects.filter(is_active=True)
            .annotate(
                eligible_question_count=Count(
                    "questions",
                    filter=Q(questions__is_active=True),
                    distinct=True,
                ),
                eligible_critical_question_count=Count(
                    "questions",
                    filter=Q(questions__is_active=True, questions__is_critical=True),
                    distinct=True,
                ),
            )
            .order_by("code")
            .values("id", "code", "name", "eligible_question_count", "eligible_critical_question_count")
        )
        categories = []
        selected_license_class = request.query_params.get("license_class")
        if selected_license_class:
            try:
                license_class_id = int(selected_license_class)
            except (TypeError, ValueError) as exc:
                raise ValidationError({"license_class": "Hạng GPLX không hợp lệ."}) from exc
            categories = list(
                Question.objects.filter(
                    is_active=True,
                    license_classes=license_class_id,
                )
                .values("category_id", "category__slug", "category__name")
                .annotate(
                    eligible_question_count=Count("id"),
                    eligible_critical_question_count=Count(
                        "id",
                        filter=Q(is_critical=True),
                    ),
                )
                .order_by("category__order", "category__name")
            )
        return Response({
            "license_classes": license_classes,
            "categories": [
                {
                    "id": item["category_id"],
                    "slug": item["category__slug"],
                    "name": item["category__name"] or "Chưa phân chương",
                    "eligible_question_count": item["eligible_question_count"],
                    "eligible_critical_question_count": item["eligible_critical_question_count"],
                }
                for item in categories
            ],
        })

class ExamSessionViewSet(viewsets.ViewSet):
    permission_classes = [permissions.AllowAny]
    serializer_class = ExamSessionResponseSerializer
    queryset = ExamSession.objects.none()

    @staticmethod
    def session_scope(request):
        if request.user.is_authenticated:
            return {"user": request.user}
        return {"user__isnull": True}

    @staticmethod
    def guest_result_payload(session):
        payload = result_payload(session)
        for field in ("started_at", "submitted_at", "expires_at"):
            if payload[field] is not None:
                payload[field] = payload[field].isoformat()
        payload["attempt_id"] = signing.dumps(
            payload,
            salt="guest-exam-result",
            compress=True,
        )
        return payload

    @extend_schema(request=ExamSessionCreateSerializer, responses={201: ExamSessionResponseSerializer})
    def create(self, request):
        serializer = ExamSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        configuration_id = serializer.validated_data["configuration_id"]
        configuration = get_object_or_404(
            ExamConfiguration.objects.select_related("license_class"),
            pk=configuration_id,
            is_active=True,
            license_class__is_active=True,
        )
        try:
            session = create_session(
                request.user if request.user.is_authenticated else None,
                configuration,
            )
        except NotEnoughQuestions as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except InvalidDistribution as exc:
            return Response({"question_distribution": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.session_payload(session), status=status.HTTP_201_CREATED)

    @extend_schema(responses=ExamSessionResponseSerializer)
    def retrieve(self, request, pk=None):
        session = get_object_or_404(
            ExamSession.objects.select_related("configuration"),
            pk=pk,
            **self.session_scope(request),
        )
        if session.status == ExamSession.Status.IN_PROGRESS and timezone.now() >= session.expires_at:
            session, _ = finalize_session(session.pk, session.user_id, expired=True)
            payload = self.session_payload(session)
            if session.user_id is None:
                session.delete()
                return Response(payload)
        payload = self.session_payload(session)
        if session.user_id is None and session.status != ExamSession.Status.IN_PROGRESS:
            session.delete()
        return Response(payload)

    @extend_schema(request=ExamAnswersSerializer, responses={
        200: ExamSessionResponseSerializer, 409: ExamResultSerializer,
    })
    @action(detail=True, methods=["put"])
    def answers(self, request, pk=None):
        serializer = ExamAnswersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data["answers"]
        with transaction.atomic():
            session = get_object_or_404(
                ExamSession.objects.select_for_update(),
                pk=pk,
                **self.session_scope(request),
            )
            if session.status != ExamSession.Status.IN_PROGRESS:
                return Response({"detail": "This exam session is already complete."}, status=409)
            if timezone.now() >= session.expires_at:
                session, _ = finalize_session(session.pk, session.user_id, expired=True)
                payload = (
                    self.guest_result_payload(session)
                    if session.user_id is None
                    else result_payload(session)
                )
                return Response(payload, status=409)
            question_map = {str(item["question_id"]): item for item in session.question_snapshot}
            for question_id, key in values.items():
                question = question_map.get(str(question_id))
                if question is None:
                    return Response({"answers": f"Question {question_id} is not in this exam."}, status=400)
                if key not in {answer["key"] for answer in question["answers"]}:
                    return Response({"answers": f"Invalid answer key for question {question_id}."}, status=400)
            session.answers = {**session.answers, **values}
            session.save(update_fields=["answers"])
        return Response(self.session_payload(session))

    @extend_schema(request=None, responses=ExamResultSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        with transaction.atomic():
            session = get_object_or_404(
                ExamSession.objects.select_for_update(),
                pk=pk,
                **self.session_scope(request),
            )
            session, _ = finalize_session(session.pk, session.user_id)
            if session.user_id is None:
                payload = self.guest_result_payload(session)
                session.delete()
                return Response(payload)
            return Response(result_payload(session))

    @staticmethod
    def session_payload(session):
        result = None
        if session.status != ExamSession.Status.IN_PROGRESS:
            result = (
                ExamSessionViewSet.guest_result_payload(session)
                if session.user_id is None
                else result_payload(session)
            )
        return {
            "id": str(session.pk),
            "status": session.status,
            "started_at": session.started_at,
            "expires_at": session.expires_at,
            "submitted_at": session.submitted_at,
            "configuration": session.config_snapshot,
            "answers": session.answers,
            "questions": public_questions(session) if session.status == ExamSession.Status.IN_PROGRESS else [],
            "result": result,
        }
