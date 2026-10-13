from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response

from apps.study.models import QuestionAttempt
from .models import LicenseClass, Question, QuestionCategory
from .serializers import CategorySerializer, LicenseClassSerializer, QuestionSerializer


class LicenseClassViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LicenseClassSerializer
    permission_classes = [permissions.AllowAny]
    queryset = LicenseClass.objects.filter(is_active=True).order_by("code")


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]
    queryset = QuestionCategory.objects.annotate(
        question_count=Count("questions", filter=Q(questions__is_active=True))
    ).order_by("order", "id")


class QuestionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = QuestionSerializer
    permission_classes = [permissions.AllowAny]
    queryset = Question.objects.filter(is_active=True).select_related("category").prefetch_related("answers")
    filterset_fields = ("category", "is_critical", "license_classes")
    search_fields = ("content", "category__name")
    ordering_fields = ("question_number", "created_at")
    ordering = ("question_number",)

    def get_permissions(self):
        if self.action == "review" or (
            self.action == "list"
            and self.request.query_params.get("status") in {"unanswered", "incorrect", "bookmarked"}
        ):
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter and self.request.user.is_authenticated:
            attempts = QuestionAttempt.objects.filter(user=self.request.user)
            if status_filter == "unanswered":
                queryset = queryset.exclude(pk__in=attempts.values("question_id"))
            elif status_filter == "incorrect":
                queryset = queryset.filter(pk__in=attempts.filter(is_correct=False).values("question_id"))
            elif status_filter == "bookmarked":
                queryset = queryset.filter(bookmarks__user=self.request.user)
        license_code = self.request.query_params.get("license_class")
        if license_code:
            queryset = queryset.filter(license_classes__code=license_code)
        return queryset.distinct()

    def filter_queryset(self, queryset):
        search_term = self.request.query_params.get("search", "").strip()
        for backend_class in self.filter_backends:
            backend = backend_class()
            if isinstance(backend, SearchFilter):
                text_matches = backend.filter_queryset(self.request, queryset, self)
                if search_term.isdecimal():
                    exact_number = queryset.filter(question_number=int(search_term))
                    queryset = (text_matches | exact_number).distinct()
                else:
                    queryset = text_matches
            else:
                queryset = backend.filter_queryset(self.request, queryset, self)
        return queryset

    @action(detail=False, methods=["get"])
    def random(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        question = queryset.order_by("?").first()
        if not question:
            return Response({"detail": "No matching questions."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(question).data)

    @action(detail=False, methods=["get"])
    def review(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=401)
        ids = QuestionAttempt.objects.filter(user=request.user, is_correct=False).values("question_id")
        queryset = self.filter_queryset(self.get_queryset().filter(pk__in=ids).distinct())
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self.get_serializer(page, many=True).data) if page is not None else Response(
            self.get_serializer(queryset, many=True).data
        )
