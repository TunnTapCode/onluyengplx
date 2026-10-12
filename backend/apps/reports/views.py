from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from drf_spectacular.utils import extend_schema

from apps.question_bank.models import Question
from .serializers import QuestionReportSerializer


class ReportThrottle(UserRateThrottle):
    scope = "reports"


class QuestionReportViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ReportThrottle]
    serializer_class = QuestionReportSerializer
    queryset = Question.objects.none()

    @extend_schema(request=QuestionReportSerializer, responses={201: QuestionReportSerializer})
    @action(detail=True, methods=["post"], url_path="report")
    def report(self, request, pk=None):
        question = get_object_or_404(Question, pk=pk, is_active=True)
        serializer = QuestionReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = serializer.save(user=request.user, question=question)
        return Response(QuestionReportSerializer(report).data, status=status.HTTP_201_CREATED)
