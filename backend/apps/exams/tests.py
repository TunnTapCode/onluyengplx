from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.exams.models import ExamConfiguration, ExamResult, ExamSession
from apps.exams.services import create_session, finalize_session
from apps.exams.management.commands.expire_exam_sessions import Command as ExpireSessionsCommand
from apps.question_bank.models import (
    AnswerOption,
    LicenseClass,
    Question,
    QuestionAttempt,
    QuestionCategory,
    QuestionReport,
)


User = get_user_model()


class ExamFlowTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="learner", email="learner@example.test", password="SafePass!123")
        self.other = User.objects.create_user(username="other", email="other@example.test", password="SafePass!123")
        self.license_class = LicenseClass.objects.create(code="B", name="B")
        self.category = QuestionCategory.objects.create(name="Source chapter", slug="source-chapter")
        self.q1 = self.make_question(1, critical=True)
        self.q2 = self.make_question(2, critical=None)
        self.configuration = ExamConfiguration.objects.create(
            license_class=self.license_class,
            name="Curated test",
            question_count=2,
            duration_seconds=60,
            passing_score=1,
        )

    def make_question(self, number, critical=None):
        question = Question.objects.create(
            question_number=number, category=self.category, content=f"Question {number}",
            is_critical=critical,
        )
        question.license_classes.add(self.license_class)
        AnswerOption.objects.create(question=question, label="1", content="Right", is_correct=True, order=0)
        AnswerOption.objects.create(question=question, label="2", content="Wrong", is_correct=False, order=1)
        return question

    def test_server_grading_and_critical_failure(self):
        session = create_session(self.user, self.configuration)
        for question in session.question_snapshot:
            answer = "2" if question["question_id"] == self.q1.pk else "1"
            session.answers[str(question["question_id"])] = answer
        session.save(update_fields=["answers"])

        completed, result = finalize_session(session.pk, self.user.pk)
        self.assertEqual(completed.score, 1)
        self.assertEqual(completed.correct_count, 1)
        self.assertEqual(completed.wrong_count, 1)
        self.assertTrue(completed.critical_failure)
        self.assertFalse(completed.passed)
        self.assertEqual(ExamResult.objects.filter(session=completed).count(), 1)

    def test_submit_is_idempotent_and_answer_key_is_withheld_until_submission(self):
        session = create_session(self.user, self.configuration)
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get(reverse("exam-session-detail", args=[session.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["questions"]), 2)
        for question in response.data["questions"]:
            self.assertNotIn("correct_keys", question)
            self.assertNotIn("is_correct", question)
        question = response.data["questions"][0]
        answer_response = client.put(
            reverse("exam-session-answers", args=[session.pk]),
            {"answers": {str(question["question_id"]): "1"}},
            format="json",
        )
        self.assertEqual(answer_response.status_code, 200)
        first = client.post(reverse("exam-session-submit", args=[session.pk]), {"score": 0}, format="json")
        second = client.post(reverse("exam-session-submit", args=[session.pk]), {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["attempt_id"], second.data["attempt_id"])
        stored = ExamSession.objects.get(pk=session.pk)
        self.assertNotEqual(stored.score, 0)
        self.assertIn("correct_keys", first.data["questions"][0])

    def test_expired_session_is_finalized_from_server_clock(self):
        session = create_session(self.user, self.configuration)
        expected_now = session.expires_at + timedelta(seconds=1)
        with patch("apps.exams.services.timezone.now", return_value=expected_now):
            completed, result = finalize_session(session.pk, self.user.pk)
        self.assertEqual(completed.status, ExamSession.Status.EXPIRED)
        self.assertIsNotNone(completed.submitted_at)
        self.assertEqual(result.session_id, completed.pk)

    def test_session_and_result_are_owner_scoped(self):
        session = create_session(self.user, self.configuration)
        client = APIClient()
        client.force_authenticate(self.other)
        response = client.get(reverse("exam-session-detail", args=[session.pk]))
        self.assertEqual(response.status_code, 404)
        completed, result = finalize_session(session.pk, self.user.pk)
        response = client.get(reverse("exam-result", args=[result.pk]))
        self.assertEqual(response.status_code, 404)

    def test_expiry_is_enforced_on_session_read(self):
        session = create_session(self.user, self.configuration)
        ExamSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get(reverse("exam-session-detail", args=[session.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], ExamSession.Status.EXPIRED)
        self.assertIsNotNone(response.data["result"]["attempt_id"])

    def test_question_endpoint_never_serializes_correctness(self):
        client = APIClient()
        response = client.get(reverse("question-detail", args=[self.q1.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("correct_keys", response.data)
        self.assertNotIn("is_correct", response.data["answers"][0])

    def test_question_number_search_is_exact_and_database_safe(self):
        question = Question.objects.create(
            question_number=839, category=self.category, content="Wording without the identifier",
        )
        client = APIClient()
        response = client.get("/api/v1/questions/", {"search": "839"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["results"]], [question.pk])

    def test_question_page_size_is_supported_and_bounded(self):
        response = APIClient().get("/api/v1/questions/", {"page_size": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)

    def test_public_configuration_list_and_personal_dashboard_metrics(self):
        public_response = APIClient().get("/api/v1/exams/configurations/")
        self.assertEqual(public_response.status_code, 200)
        self.assertEqual(public_response.data["results"][0]["id"], self.configuration.pk)

        QuestionAttempt.objects.create(
            user=self.user, question=self.q1, selected_options=["1"], is_correct=True
        )
        session = create_session(self.user, self.configuration)
        session.answers[str(self.q1.pk)] = "1"
        session.save(update_fields=["answers"])
        finalize_session(session.pk, self.user.pk)

        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get("/api/v1/study/progress/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["answered_questions"], 1)
        self.assertEqual(response.data["accuracy_percentage"], 100)
        self.assertEqual(response.data["exam_count"], 1)
        self.assertEqual(response.data["average_exam_score"], 1.0)
        self.assertEqual(response.data["category_progress"][0]["studied"], 1)
        self.assertEqual(response.data["category_progress"][0]["total"], 2)
        self.assertEqual(response.data["exam_scores"][0]["score"], 1)

    def test_report_and_bookmark_routes_are_functional_and_user_scoped(self):
        client = APIClient()
        client.force_authenticate(self.user)
        report = client.post(
            f"/api/v1/questions/{self.q1.pk}/report/",
            {"reason": "wrong_answer", "description": "Please verify this item."},
            format="json",
        )
        self.assertEqual(report.status_code, 201)
        self.assertEqual(QuestionReport.objects.get(pk=report.data["id"]).user, self.user)
        created = client.post("/api/v1/bookmarks/", {"question_id": self.q1.pk}, format="json")
        self.assertEqual(created.status_code, 201)
        client.force_authenticate(self.other)
        self.assertEqual(client.delete(f"/api/v1/bookmarks/{self.q1.pk}/").status_code, 404)
        client.force_authenticate(self.user)
        self.assertEqual(client.delete(f"/api/v1/bookmarks/{self.q1.pk}/").status_code, 204)

    def test_expiry_command_auto_submits_past_deadline_sessions(self):
        session = create_session(self.user, self.configuration)
        ExamSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        ExpireSessionsCommand().handle()
        session.refresh_from_db()
        self.assertEqual(session.status, ExamSession.Status.EXPIRED)
        self.assertTrue(ExamResult.objects.filter(session=session).exists())

    def test_study_recent_endpoint_works_with_sqlite_and_is_user_scoped(self):
        QuestionAttempt.objects.create(
            user=self.user, question=self.q1, selected_options=["1"], is_correct=True
        )
        QuestionAttempt.objects.create(
            user=self.other, question=self.q2, selected_options=["2"], is_correct=False
        )
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get(reverse("study-recent"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["results"]], [self.q1.pk])
