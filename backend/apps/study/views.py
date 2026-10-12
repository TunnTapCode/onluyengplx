from django.db.models import Count, Max, OuterRef, Q, Subquery
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

from config.pagination import StandardPagination
from apps.exams.models import ExamResult
from apps.question_bank.models import (
    AnswerOption,
    Question,
    QuestionAttempt,
    QuestionBookmark,
    QuestionCategory,
)
from apps.question_bank.serializers import QuestionSerializer
from .serializers import (
    BookmarkCreateSerializer,
    BookmarkStatusSerializer,
    StudyAnswerResponseSerializer,
    StudyAnswerSerializer,
    StudyProgressSerializer,
)


class BookmarkViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuestionSerializer
    queryset = QuestionBookmark.objects.none()

    @extend_schema(responses=QuestionSerializer(many=True))
    def list(self, request):
        queryset = Question.objects.filter(bookmarks__user=request.user, is_active=True).select_related(
            "category"
        ).prefetch_related("answers").order_by("-bookmarks__created_at")
        page = self.paginator.paginate_queryset(queryset, request, view=self)
        return self.paginator.get_paginated_response(QuestionSerializer(page, many=True, context={"request": request}).data)

    @property
    def paginator(self):
        if not hasattr(self, "_paginator"):
            self._paginator = StandardPagination()
        return self._paginator

    @extend_schema(request=BookmarkCreateSerializer, responses={201: BookmarkStatusSerializer, 200: BookmarkStatusSerializer})
    def create(self, request):
        serializer = BookmarkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = get_object_or_404(Question, pk=serializer.validated_data["question_id"], is_active=True)
        bookmark, created = QuestionBookmark.objects.get_or_create(user=request.user, question=question)
        return Response({"question_id": question.pk, "bookmarked": True}, status=201 if created else 200)

    def destroy(self, request, pk=None):
        deleted, _ = QuestionBookmark.objects.filter(user=request.user, question_id=pk).delete()
        return Response(status=204 if deleted else 404)


class StudyViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuestionSerializer

    @extend_schema(request=StudyAnswerSerializer, responses=StudyAnswerResponseSerializer)
    @action(detail=False, methods=["post"])
    def answer(self, request):
        serializer = StudyAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        question = get_object_or_404(
            Question.objects.prefetch_related("answers"), pk=values["question_id"], is_active=True
        )
        valid_keys = set(question.answers.values_list("label", flat=True))
        selected = set(values["selected_options"])
        if not selected.issubset(valid_keys):
            return Response({"selected_options": "Contains an answer key not belonging to this question."}, status=400)
        correct_keys = set(question.answers.filter(is_correct=True).values_list("label", flat=True))
        is_correct = selected == correct_keys
        QuestionAttempt.objects.create(
            user=request.user,
            question=question,
            selected_options=sorted(selected),
            is_correct=is_correct,
            attempt_mode=values["attempt_mode"],
        )
        return Response({
            "question_id": question.pk,
            "is_correct": is_correct,
            "correct_options": sorted(correct_keys),
            "explanation": question.explanation,
        })

    @extend_schema(responses=StudyProgressSerializer)
    @action(detail=False, methods=["get"])
    def progress(self, request):
        attempts = QuestionAttempt.objects.filter(user=request.user)
        answered = attempts.values("question_id").distinct().count()
        stats = attempts.aggregate(
            attempt_count=Count("id"),
            correct=Count("id", filter=Q(is_correct=True)),
            incorrect=Count("id", filter=Q(is_correct=False)),
            last_answered=Max("answered_at"),
        )
        exam_results = list(
            ExamResult.objects.filter(session__user=request.user)
            .select_related("session")
            .order_by("created_at")
        )
        categories = QuestionCategory.objects.annotate(
            total=Count("questions", filter=Q(questions__is_active=True), distinct=True),
            studied=Count(
                "questions__attempts__question_id",
                filter=Q(questions__attempts__user=request.user),
                distinct=True,
            ),
        ).order_by("order", "id")
        correct_count = stats["correct"]
        attempt_count = stats["attempt_count"]
        return Response({
            "answered_questions": answered,
            "correct_answers": correct_count,
            "incorrect_answers": stats["incorrect"],
            "last_answered_at": stats["last_answered"],
            "answer_count": attempt_count,
            "accuracy_percentage": round(correct_count * 100 / attempt_count) if attempt_count else 0,
            "exam_count": len(exam_results),
            "average_exam_score": round(
                sum(result.session.score or 0 for result in exam_results) / len(exam_results), 1
            ) if exam_results else 0,
            "exam_scores": [
                {
                    "date": timezone.localtime(result.created_at).strftime("%d/%m"),
                    "score": result.session.score,
                }
                for result in exam_results
            ],
            "category_progress": [
                {
                    "category_id": category.pk,
                    "category_name": category.name,
                    "studied": category.studied,
                    "total": category.total,
                }
                for category in categories
            ],
        })

    @extend_schema(responses=QuestionSerializer(many=True))
    @action(detail=False, methods=["get"])
    def recent(self, request):
        latest_attempt = QuestionAttempt.objects.filter(
            user=request.user, question_id=OuterRef("question_id")
        ).order_by("-answered_at").values("pk")[:1]
        latest_ids = QuestionAttempt.objects.filter(user=request.user).annotate(
            latest_id=Subquery(latest_attempt)
        ).filter(pk=Subquery(latest_attempt)).values("question_id")
        questions = Question.objects.filter(pk__in=latest_ids).select_related(
            "category"
        ).prefetch_related("answers").order_by("question_number")
        page = self.paginate_queryset(questions)
        return self.get_paginated_response(QuestionSerializer(page, many=True, context={"request": request}).data)

    @extend_schema(responses=QuestionSerializer(many=True))
    @action(detail=False, methods=["get"])
    def mistakes(self, request):
        wrong_ids = QuestionAttempt.objects.filter(user=request.user, is_correct=False).values("question_id")
        questions = Question.objects.filter(pk__in=wrong_ids, is_active=True).distinct().select_related(
            "category"
        ).prefetch_related("answers")
        page = self.paginate_queryset(questions)
        return self.get_paginated_response(QuestionSerializer(page, many=True, context={"request": request}).data)

    def paginate_queryset(self, queryset):
        self._paginator = getattr(self, "_paginator", StandardPagination())
        return self._paginator.paginate_queryset(queryset, self.request, view=self)

    def get_paginated_response(self, data):
        return self._paginator.get_paginated_response(data)
