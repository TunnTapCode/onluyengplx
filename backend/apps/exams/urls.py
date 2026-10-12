from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from config.pagination import StandardPagination
from .models import ExamResult
from .serializers import ExamHistoryItemSerializer, ExamResultSerializer
from .services import result_payload


@extend_schema(responses=ExamResultSerializer)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def result_detail(request, attempt_id):
    result = ExamResult.objects.select_related("session", "session__configuration").filter(
        pk=attempt_id, session__user=request.user
    ).first()
    if result is None:
        from rest_framework.exceptions import NotFound
        raise NotFound()
    return Response(result_payload(result.session))


@extend_schema(responses=ExamHistoryItemSerializer(many=True))
@api_view(["GET"])
@permission_classes([IsAuthenticated])
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


urlpatterns = [
    path("results/<uuid:attempt_id>/", result_detail, name="exam-result"),
    path("history/", exam_history, name="exam-history"),
]
