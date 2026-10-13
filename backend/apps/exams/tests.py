from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.exams.admin import ExamConfigurationAdminForm
from apps.exams.models import ExamConfiguration, ExamResult, ExamSession
from apps.exams.serializers import ExamConfigurationSerializer
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
        self.license_class, _ = LicenseClass.objects.get_or_create(
            code="B",
            defaults={"name": "Hạng B"},
        )
        self.category = QuestionCategory.objects.create(name="Source chapter", slug="source-chapter")
        self.q1 = self.make_question(1, critical=True)
        self.q2 = self.make_question(2, critical=None)
        self.q3 = self.make_question(3, critical=True)
        self.q4 = self.make_question(4, critical=True)
        self.q5 = self.make_question(5, critical=None)
        self.configuration = ExamConfiguration.objects.create(
            license_class=self.license_class,
            name="Curated test",
            question_count=5,
            duration_seconds=60,
            passing_score=5,
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
        self.assertEqual(completed.score, 4)
        self.assertEqual(completed.correct_count, 4)
        self.assertEqual(completed.wrong_count, 1)
        self.assertTrue(completed.critical_failure)
        self.assertFalse(completed.passed)
        self.assertEqual(ExamResult.objects.filter(session=completed).count(), 1)

    def test_exam_contains_exactly_three_critical_questions_and_any_wrong_one_fails(self):
        self.configuration.critical_question_policy = "ignore"
        self.configuration.save(update_fields=["critical_question_policy"])
        session = create_session(self.user, self.configuration)
        critical_questions = [
            question for question in session.question_snapshot
            if question["is_critical"] is True
        ]
        self.assertEqual(len(critical_questions), 3)
        failed_question = critical_questions[-1]
        session.answers = {
            str(question["question_id"]): (
                "2" if question["question_id"] == failed_question["question_id"] else "1"
            )
            for question in session.question_snapshot
        }
        session.save(update_fields=["answers"])

        completed, _ = finalize_session(session.pk, self.user.pk)
        self.assertTrue(completed.critical_failure)
        self.assertFalse(completed.passed)

    def test_fixed_question_set_preserves_order_and_exact_critical_count(self):
        self.configuration.fixed_question_ids = [
            self.q5.pk,
            self.q3.pk,
            self.q2.pk,
            self.q1.pk,
            self.q4.pk,
        ]
        self.configuration.save(update_fields=["fixed_question_ids"])

        session = create_session(self.user, self.configuration)

        self.assertEqual(
            [item["question_id"] for item in session.question_snapshot],
            self.configuration.fixed_question_ids,
        )
        self.assertEqual(
            sum(item["is_critical"] is True for item in session.question_snapshot),
            3,
        )

    def test_active_fixed_configuration_rejects_wrong_critical_question_count(self):
        q6 = self.make_question(6, critical=False)
        serializer = ExamConfigurationSerializer(data={
            "license_class": self.license_class.pk,
            "name": "Invalid fixed set",
            "question_count": 5,
            "duration_seconds": 60,
            "passing_score": 4,
            "question_distribution": {},
            "fixed_question_ids": [self.q1.pk, self.q2.pk, self.q3.pk, self.q5.pk, q6.pk],
            "is_active": True,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("fixed_question_ids", serializer.errors)

    def test_inactive_fixed_configuration_can_wait_for_duration_and_passing_score(self):
        serializer = ExamConfigurationSerializer(data={
            "license_class": self.license_class.pk,
            "name": "Draft fixed set",
            "question_count": 5,
            "fixed_question_ids": [
                self.q5.pk,
                self.q3.pk,
                self.q2.pk,
                self.q1.pk,
                self.q4.pk,
            ],
            "is_active": False,
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_submit_is_idempotent_and_answer_key_is_withheld_until_submission(self):
        session = create_session(self.user, self.configuration)
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get(reverse("exam-session-detail", args=[session.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["questions"]), 5)
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

    def test_guest_can_answer_practice_question_without_saving_attempt(self):
        client = APIClient()
        empty_response = client.post(
            "/api/v1/study/answer/",
            {
                "question_id": self.q1.pk,
                "selected_options": [],
                "attempt_mode": "practice",
            },
            format="json",
        )
        self.assertEqual(empty_response.status_code, 400)
        response = client.post(
            "/api/v1/study/answer/",
            {
                "question_id": self.q1.pk,
                "selected_options": ["1"],
                "attempt_mode": "practice",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_correct"])
        self.assertEqual(response.data["correct_options"], ["1"])
        self.assertFalse(QuestionAttempt.objects.exists())

    def test_study_reset_clears_only_the_current_critical_practice_for_the_user(self):
        QuestionAttempt.objects.create(
            user=self.user, question=self.q1, selected_options=["1"], is_correct=True
        )
        QuestionAttempt.objects.create(
            user=self.user, question=self.q2, selected_options=["2"], is_correct=False
        )
        QuestionAttempt.objects.create(
            user=self.user, question=self.q3, selected_options=["1"], is_correct=True
        )
        QuestionAttempt.objects.create(
            user=self.other, question=self.q1, selected_options=["2"], is_correct=False
        )
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.post("/api/v1/study/reset/", {"mode": "critical"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["deleted_attempts"], 2)
        self.assertEqual(
            list(QuestionAttempt.objects.filter(user=self.user).values_list("question_id", flat=True)),
            [self.q2.pk],
        )
        self.assertEqual(QuestionAttempt.objects.filter(user=self.other).count(), 1)

    def test_study_reset_chapter_and_full_modes_are_scoped_to_the_user_and_active_questions(self):
        other_category = QuestionCategory.objects.create(name="Other chapter", slug="other-chapter")
        other_question = self.make_question(6, critical=False)
        other_question.category = other_category
        other_question.save(update_fields=["category"])
        QuestionAttempt.objects.create(
            user=self.user, question=self.q1, selected_options=["1"], is_correct=True
        )
        QuestionAttempt.objects.create(
            user=self.user, question=other_question, selected_options=["1"], is_correct=True
        )
        QuestionAttempt.objects.create(
            user=self.other, question=self.q2, selected_options=["1"], is_correct=True
        )
        client = APIClient()
        client.force_authenticate(self.user)

        chapter_response = client.post(
            "/api/v1/study/reset/",
            {"mode": "chapter", "category": self.category.pk},
            format="json",
        )

        self.assertEqual(chapter_response.status_code, 200)
        self.assertEqual(chapter_response.data["deleted_attempts"], 1)
        self.assertEqual(
            list(QuestionAttempt.objects.filter(user=self.user).values_list("question_id", flat=True)),
            [other_question.pk],
        )
        full_response = client.post("/api/v1/study/reset/", {"mode": "full"}, format="json")
        self.assertEqual(full_response.status_code, 200)
        self.assertEqual(full_response.data["deleted_attempts"], 1)
        self.assertEqual(QuestionAttempt.objects.filter(user=self.user).count(), 0)
        self.assertEqual(QuestionAttempt.objects.filter(user=self.other).count(), 1)

    def test_study_reset_requires_authentication_and_chapter_selection(self):
        client = APIClient()

        unauthorized = client.post("/api/v1/study/reset/", {"mode": "full"}, format="json")
        self.assertEqual(unauthorized.status_code, 401)

        client.force_authenticate(self.user)
        missing_category = client.post("/api/v1/study/reset/", {"mode": "chapter"}, format="json")
        invalid_mode = client.post(
            "/api/v1/study/reset/",
            {"mode": "critical", "category": self.category.pk},
            format="json",
        )
        missing_chapter = client.post(
            "/api/v1/study/reset/",
            {"mode": "chapter", "category": 999999},
            format="json",
        )

        self.assertEqual(missing_category.status_code, 400)
        self.assertEqual(invalid_mode.status_code, 400)
        self.assertEqual(missing_chapter.status_code, 404)

    def test_guest_exam_result_is_returned_but_not_saved(self):
        client = APIClient()
        response = client.post(
            "/api/v1/exams/sessions/",
            {"configuration_id": self.configuration.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        session_id = response.data["id"]
        session = ExamSession.objects.get(pk=session_id)
        self.assertIsNone(session.user_id)
        self.assertEqual(len(response.data["questions"]), 5)
        self.assertNotIn("correct_keys", response.data["questions"][0])

        first_question_id = response.data["questions"][0]["question_id"]
        response = client.put(
            f"/api/v1/exams/sessions/{session_id}/answers/",
            {"answers": {str(first_question_id): "1"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        response = client.post(
            f"/api/v1/exams/sessions/{session_id}/submit/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["attempt_id"])
        self.assertEqual(len(response.data["questions"]), 5)
        self.assertTrue(all("is_correct" in question for question in response.data["questions"]))
        self.assertFalse(ExamSession.objects.filter(pk=session_id).exists())
        self.assertFalse(ExamResult.objects.exists())

        result_response = client.get(
            reverse("exam-result", args=[response.data["attempt_id"]])
        )
        self.assertEqual(result_response.status_code, 200)
        self.assertEqual(result_response.data["session_id"], session_id)

    def test_expired_guest_exam_returns_temporary_result_then_removes_session(self):
        session = create_session(None, self.configuration)
        ExamSession.objects.filter(pk=session.pk).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )

        response = APIClient().get(reverse("exam-session-detail", args=[session.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], ExamSession.Status.EXPIRED)
        token = response.data["result"]["attempt_id"]
        self.assertTrue(token)
        self.assertFalse(ExamSession.objects.filter(pk=session.pk).exists())
        self.assertFalse(ExamResult.objects.exists())
        self.assertEqual(
            APIClient().get(reverse("exam-result", args=[token])).status_code,
            200,
        )

    def test_authenticated_user_cannot_access_guest_exam_session(self):
        guest_session = create_session(None, self.configuration)
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get(reverse("exam-session-detail", args=[guest_session.pk]))
        self.assertEqual(response.status_code, 404)

    def test_guest_practice_is_not_saved_but_authenticated_practice_is(self):
        client = APIClient()
        payload = {
            "question_id": self.q1.pk,
            "selected_options": ["2"],
            "attempt_mode": "practice",
        }
        response = client.post("/api/v1/study/answer/", payload, format="json")
        self.assertEqual(response.status_code, 200)
        client.force_authenticate(self.user)
        response = client.post("/api/v1/study/answer/", payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(QuestionAttempt.objects.filter(user=self.user).count(), 1)

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
        self.assertEqual(response.data["count"], 5)
        self.assertEqual(len(response.data["results"]), 1)

    def test_question_bank_exposes_sixty_critical_question_filter(self):
        response = APIClient().get("/api/v1/questions/", {"is_critical": "true"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertTrue(all(question["is_critical"] for question in response.data["results"]))

    def test_license_class_catalog_contains_all_fifteen_legal_classes(self):
        response = APIClient().get("/api/v1/license-classes/")
        self.assertEqual(response.status_code, 200)
        license_classes = response.data["results"]
        self.assertEqual(
            {license_class["code"] for license_class in license_classes},
            {"A1", "A", "B1", "B", "C1", "C", "D1", "D2", "D",
             "BE", "C1E", "CE", "DE", "D1E", "D2E"},
        )
        self.assertTrue(all(license_class["legal_source"] for license_class in license_classes))

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
        self.assertEqual(response.data["category_progress"][0]["total"], 5)
        self.assertEqual(response.data["exam_scores"][0]["score"], 1)

    def test_exam_configuration_api_is_public_read_and_staff_write(self):
        endpoint = reverse("exam-configuration-list")
        payload = {
            "license_class": self.license_class.pk,
            "name": "Frontend managed test",
            "question_count": 5,
            "duration_seconds": 900,
            "passing_score": 1,
            "critical_question_policy": "fail_on_wrong",
            "question_distribution": {str(self.category.pk): 1},
            "is_active": True,
        }
        client = APIClient()
        self.assertEqual(client.get(endpoint).status_code, 200)
        self.assertEqual(client.post(endpoint, payload, format="json").status_code, 401)

        client.force_authenticate(self.user)
        self.assertEqual(client.post(endpoint, payload, format="json").status_code, 403)

        admin_user = User.objects.create_superuser(
            username="examadmin",
            email="examadmin@example.test",
            password="safe-password-2026",
        )
        client.force_authenticate(admin_user)
        created = client.post(endpoint, payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["eligible_question_count"], 5)
        self.assertEqual(created.data["eligible_critical_question_count"], 3)
        self.assertEqual(created.data["license_class"], self.license_class.pk)

        invalid = {**payload, "name": "Not enough questions", "question_count": 6, "passing_score": 5}
        rejected = client.post(endpoint, invalid, format="json")
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("question_count", rejected.data)

        options = client.get(reverse("exam-configuration-options"), {"license_class": self.license_class.pk})
        self.assertEqual(options.status_code, 200)
        class_options = next(
            item for item in options.data["license_classes"]
            if item["code"] == self.license_class.code
        )
        self.assertEqual(class_options["eligible_question_count"], 5)
        self.assertEqual(class_options["eligible_critical_question_count"], 3)
        self.assertEqual(options.data["categories"][0]["eligible_question_count"], 5)

    def test_exam_configuration_staff_can_edit_inactive_and_cannot_delete_used_config(self):
        admin_user = User.objects.create_superuser(
            username="examadmin2",
            email="examadmin2@example.test",
            password="safe-password-2026",
        )
        client = APIClient()
        client.force_authenticate(admin_user)
        endpoint = reverse("exam-configuration-detail", args=[self.configuration.pk])
        self.assertEqual(client.patch(endpoint, {"is_active": False}, format="json").status_code, 200)
        self.assertEqual(APIClient().get("/api/v1/exams/configurations/").data["count"], 0)

        session = create_session(self.user, self.configuration)
        rejected = client.delete(endpoint)
        self.assertEqual(rejected.status_code, 400)
        self.assertTrue(ExamSession.objects.filter(pk=session.pk).exists())

    def test_admin_configuration_accepts_eligible_questions_and_chapter_distribution(self):
        form = ExamConfigurationAdminForm(data={
            "license_class": self.license_class.pk,
            "name": "Admin configured test",
            "question_count": 5,
            "duration_seconds": 1200,
            "passing_score": 1,
            "critical_question_policy": ExamConfiguration.CriticalPolicy.FAIL_ON_WRONG,
            "question_distribution": {str(self.category.pk): 1},
            "is_active": True,
            "version": 1,
        })

        self.assertTrue(form.is_valid(), form.errors)

    def test_admin_rejects_active_configuration_without_enough_eligible_questions(self):
        form = ExamConfigurationAdminForm(data={
            "license_class": self.license_class.pk,
            "name": "Unavailable test",
            "question_count": 6,
            "duration_seconds": 1200,
            "passing_score": 2,
            "critical_question_policy": ExamConfiguration.CriticalPolicy.FAIL_ON_WRONG,
            "question_distribution": {},
            "is_active": True,
            "version": 1,
        })

        self.assertFalse(form.is_valid())
        self.assertIn("question_count", form.errors)

    def test_admin_rejects_chapter_distribution_exceeding_eligible_questions(self):
        form = ExamConfigurationAdminForm(data={
            "license_class": self.license_class.pk,
            "name": "Invalid chapter allocation",
            "question_count": 5,
            "duration_seconds": 1200,
            "passing_score": 1,
            "critical_question_policy": ExamConfiguration.CriticalPolicy.FAIL_ON_WRONG,
            "question_distribution": {str(self.category.pk): 6},
            "is_active": True,
            "version": 1,
        })

        self.assertFalse(form.is_valid())
        self.assertIn("question_distribution", form.errors)

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

    def test_expiry_command_removes_abandoned_guest_sessions_without_results(self):
        session = create_session(None, self.configuration)
        ExamSession.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))

        ExpireSessionsCommand().handle()

        self.assertFalse(ExamSession.objects.filter(pk=session.pk).exists())
        self.assertFalse(ExamResult.objects.exists())

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

    def test_study_statuses_are_shared_by_practice_sets_and_use_latest_user_attempt(self):
        QuestionAttempt.objects.create(
            user=self.user, question=self.q1, selected_options=["2"], is_correct=False
        )
        QuestionAttempt.objects.create(
            user=self.user, question=self.q1, selected_options=["1"], is_correct=True
        )
        QuestionAttempt.objects.create(
            user=self.user, question=self.q3, selected_options=["2"], is_correct=False
        )
        QuestionAttempt.objects.create(
            user=self.other, question=self.q2, selected_options=["1"], is_correct=True
        )
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.get(
            "/api/v1/study/statuses/",
            {"mode": "chapter", "category": self.category.pk},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [
            {"question_id": self.q1.pk, "page": 1, "is_correct": True},
            {"question_id": self.q3.pk, "page": 3, "is_correct": False},
        ])

    def test_study_statuses_can_be_filtered_by_license_class(self):
        other_license_class, _ = LicenseClass.objects.get_or_create(
            code="A1",
            defaults={"name": "Hạng A1"},
        )
        self.q2.license_classes.remove(self.license_class)
        self.q2.license_classes.add(other_license_class)
        QuestionAttempt.objects.create(
            user=self.user, question=self.q1, selected_options=["1"], is_correct=True
        )
        QuestionAttempt.objects.create(
            user=self.user, question=self.q2, selected_options=["2"], is_correct=False
        )
        client = APIClient()
        client.force_authenticate(self.user)

        response = client.get(
            "/api/v1/study/statuses/",
            {"mode": "full", "license_class": self.license_class.pk},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [
            {"question_id": self.q1.pk, "page": 1, "is_correct": True},
        ])
