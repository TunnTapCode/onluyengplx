from uuid import UUID

from django.core import signing
from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from config.pagination import StandardPagination
from .models import ExamResult
from .serializers import (
    ExamConfigurationProgressSerializer,
    ExamHistoryItemSerializer,
    ExamResultSerializer,
)
from .services import result_payload
from .views import ExamConfigurationOptionsView


@extend_schema(responses=ExamResultSerializer)
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def result_detail(request, attempt_id):
    try:
        attempt_uuid = UUID(attempt_id)
    except ValueError:
        try:
            payload = signing.loads(
                attempt_id,
                salt="guest-exam-result",
                max_age=24 * 60 * 60,
            )
        except signing.BadSignature as exc:
            raise NotFound() from exc
        if not isinstance(payload, dict):
            raise NotFound()
        return Response(payload)

    if not request.user.is_authenticated:
        raise NotFound()
    result = ExamResult.objects.select_related("session", "session__configuration").filter(
        pk=attempt_uuid, session__user=request.user
    ).first()
    if result is None:
        raise NotFound()
    return Response(result_payload(result.session))


@extend_schema(responses=ExamHistoryItemSerializer(many=True))
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def exam_history(request):
    results = ExamResult.objects.filter(session__user=request.user).select_related(
        "session", "session__configuration", "session__configuration__license_class"
    ).order_by("-created_at")
    license_code = request.query_params.get("license_class")
    if license_code:
        results = results.filter(session__configuration__license_class__code=license_code)
    paginator = StandardPagination()
    page = paginator.paginate_queryset(results, request)
    return paginator.get_paginated_response([{
        "attempt_id": str(result.pk),
        "session_id": str(result.session_id),
        "license_class": result.session.config_snapshot.get("license_class"),
        "score": result.session.score,
        "passed": result.session.passed,
        "critical_failure": result.session.critical_failure,
        "started_at": result.session.started_at,
        "submitted_at": result.session.submitted_at,
    } for result in page])


@extend_schema(responses=ExamConfigurationProgressSerializer(many=True))
@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def exam_configuration_progress(request):
    attempts = ExamResult.objects.filter(
        session__user=request.user,
    ).order_by(
        "-created_at", "-pk",
    ).values(
        "pk",
        "session__configuration_id",
        "session__passed",
        "session__score",
        "session__started_at",
    )
    latest_by_configuration = {}
    for attempt in attempts.iterator():
        configuration_id = attempt["session__configuration_id"]
        if configuration_id in latest_by_configuration:
            continue
        latest_by_configuration[configuration_id] = {
            "configuration_id": configuration_id,
            "attempt_id": attempt["pk"],
            "passed": attempt["session__passed"],
            "score": attempt["session__score"],
            "started_at": attempt["session__started_at"],
        }
    return Response(ExamConfigurationProgressSerializer(
        latest_by_configuration.values(),
        many=True,
    ).data)


urlpatterns = [
    path("admin-options/", ExamConfigurationOptionsView.as_view(), name="exam-configuration-options"),
    path("progress/", exam_configuration_progress, name="exam-configuration-progress"),
    path("results/<str:attempt_id>/", result_detail, name="exam-result"),
    path("history/", exam_history, name="exam-history"),
]
