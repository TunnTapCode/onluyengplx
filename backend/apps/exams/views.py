from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

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


class ExamConfigurationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ExamConfigurationSerializer
    queryset = ExamConfiguration.objects.filter(
        is_active=True, license_class__is_active=True
    ).select_related("license_class")
    permission_classes = [permissions.AllowAny]
    filterset_fields = ("license_class__code",)


class ExamSessionViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExamSessionResponseSerializer
    queryset = ExamSession.objects.none()

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
            session = create_session(request.user, configuration)
        except NotEnoughQuestions as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except InvalidDistribution as exc:
            return Response({"question_distribution": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.session_payload(session), status=status.HTTP_201_CREATED)

    @extend_schema(responses=ExamSessionResponseSerializer)
    def retrieve(self, request, pk=None):
        session = get_object_or_404(
            ExamSession.objects.select_related("configuration"), pk=pk, user=request.user
        )
        if session.status == ExamSession.Status.IN_PROGRESS and timezone.now() >= session.expires_at:
            session, _ = finalize_session(session.pk, request.user.pk, expired=True)
        return Response(self.session_payload(session))

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
                ExamSession.objects.select_for_update(), pk=pk, user=request.user
            )
            if session.status != ExamSession.Status.IN_PROGRESS:
                return Response({"detail": "This exam session is already complete."}, status=409)
            if timezone.now() >= session.expires_at:
                session, _ = finalize_session(session.pk, request.user.pk, expired=True)
                return Response(result_payload(session), status=409)
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
        session = get_object_or_404(ExamSession, pk=pk, user=request.user)
        session, _ = finalize_session(session.pk, request.user.pk)
        return Response(result_payload(session))

    @staticmethod
    def session_payload(session):
        return {
            "id": str(session.pk),
            "status": session.status,
            "started_at": session.started_at,
            "expires_at": session.expires_at,
            "submitted_at": session.submitted_at,
            "configuration": session.config_snapshot,
            "answers": session.answers,
            "questions": public_questions(session) if session.status == ExamSession.Status.IN_PROGRESS else [],
            "result": result_payload(session) if session.status != ExamSession.Status.IN_PROGRESS else None,
        }
