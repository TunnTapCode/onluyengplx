import io
import json
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command, CommandError
from django.test import TestCase

from apps.question_bank.management.commands.import_questions import validate_source
from apps.question_bank.models import AnswerOption, LicenseClass, Question, QuestionCategory


def source_row(**overrides):
    row = {
        "id": 42,
        "chapter": 3,
        "chapter_name": "Exact source chapter name",
        "question": "What is the source question?",
        "image": None,
        "answers": [{"key": 1, "text": "First"}, {"key": 2, "text": "Second"}],
        "correct_answer": 2,
        "is_critical": None,
    }
    row.update(overrides)
    return row


class ImportValidationTests(TestCase):
    def test_malformed_non_object_record_is_reported_without_crashing(self):
        images, errors = validate_source([None])
        self.assertEqual(images, {})
        self.assertEqual(errors, ["record[0]: expected an object"])

    def test_validates_source_schema_without_inventing_null_critical_value(self):
        images, errors = validate_source([source_row()])
        self.assertEqual(images, {})
        self.assertEqual(errors, [])

    def test_referenced_image_requires_supplied_image_files(self):
        _, errors = validate_source([source_row(image="q_042.jpg")])
        self.assertTrue(any("require --images-archive or --images-dir" in error for error in errors))

    def test_reports_missing_answer_correct_key_and_duplicate_source_ids(self):
        row = source_row(answers=[])
        images, errors = validate_source([row, source_row()])
        self.assertEqual(images, {})
        self.assertTrue(any("answers" in error for error in errors))
        self.assertTrue(any("correct_answer" in error for error in errors))
        self.assertTrue(any("duplicate question id 42" in error for error in errors))

    def test_dry_run_and_import_are_atomic_and_repeatable(self):
        payload = json.dumps([source_row()], ensure_ascii=False)
        with patch.object(Path, "open", return_value=io.StringIO(payload)):
            output = io.StringIO()
            call_command("import_questions", "supplied.json", "--dry-run", stdout=output)
        self.assertEqual(Question.objects.count(), 0)
        self.assertIn("added=1", output.getvalue())

        with patch.object(Path, "open", return_value=io.StringIO(payload)):
            call_command("import_questions", "supplied.json", stdout=io.StringIO())
        question = Question.objects.get(question_number=42)
        self.assertEqual(question.category.name, "Exact source chapter name")
        self.assertIsNone(question.is_critical)
        self.assertFalse(question.license_classes.exists())
        self.assertEqual(
            list(question.answers.filter(is_correct=True).values_list("label", flat=True)), ["2"]
        )
        with patch.object(Path, "open", return_value=io.StringIO(payload)):
            output = io.StringIO()
            call_command("import_questions", "supplied.json", stdout=output)
        self.assertIn("added=0 updated=0 skipped=1 errors=0", output.getvalue())
        self.assertEqual(AnswerOption.objects.filter(question=question).count(), 2)

    def test_invalid_import_makes_no_database_changes(self):
        payload = json.dumps([source_row(answers=[])])
        existing_category = QuestionCategory.objects.create(name="Existing", slug="existing")
        existing = Question.objects.create(
            question_number=7, category=existing_category, content="Keep this row", source="verified.json"
        )
        with patch.object(Path, "open", return_value=io.StringIO(payload)):
            output = io.StringIO()
            with self.assertRaises(CommandError):
                call_command("import_questions", "bad.json", stdout=output)
        self.assertEqual(Question.objects.count(), 1)
        self.assertEqual(Question.objects.get(pk=existing.pk).content, "Keep this row")
        self.assertIn("database unchanged", output.getvalue())
        self.assertIn("errors=", output.getvalue())

    def test_import_preserves_manually_curated_fields_absent_from_source(self):
        category = QuestionCategory.objects.create(name="Old chapter", slug="old-chapter")
        license_class, _ = LicenseClass.objects.get_or_create(
            code="B",
            defaults={"name": "Hạng B"},
        )
        question = Question.objects.create(
            question_number=42, category=category, content="Earlier wording",
            explanation="Verified explanation", source="earlier.json", is_active=False,
            is_critical=True,
        )
        question.license_classes.add(license_class)
        payload = json.dumps([source_row()])
        with patch.object(Path, "open", return_value=io.StringIO(payload)):
            call_command("import_questions", "supplied.json", stdout=io.StringIO())
        question.refresh_from_db()
        self.assertEqual(question.explanation, "Verified explanation")
        self.assertEqual(list(question.license_classes.all()), [license_class])
        self.assertEqual(question.content, "What is the source question?")
        self.assertFalse(question.is_active)
        self.assertTrue(question.is_critical)
