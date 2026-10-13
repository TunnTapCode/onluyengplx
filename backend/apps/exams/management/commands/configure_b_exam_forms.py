import random

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.exams.models import ExamConfiguration
from apps.question_bank.models import LicenseClass, Question


class Command(BaseCommand):
    help = "Assign the 600 active questions to class B and create 20 fixed 30-question exam drafts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--seed",
            type=int,
            default=20261013,
            help="Deterministic seed used to distribute questions across the 20 forms.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate the question pool without changing the database.",
        )

    def handle(self, *args, **options):
        try:
            license_class = LicenseClass.objects.get(code="B", is_active=True)
        except LicenseClass.DoesNotExist as exc:
            raise CommandError("Hạng B chưa tồn tại hoặc đang bị tắt.") from exc

        questions = list(Question.objects.filter(is_active=True).order_by("question_number"))
        critical = [question for question in questions if question.is_critical is True]
        normal = [question for question in questions if question.is_critical is not True]
        if len(questions) != 600 or len(critical) != 60 or len(normal) != 540:
            raise CommandError(
                "Cần đúng 600 câu đang hoạt động, gồm 60 câu điểm liệt và 540 câu thường; "
                f"hiện có {len(questions)} câu ({len(critical)} điểm liệt, {len(normal)} thường)."
            )

        generator = random.Random(options["seed"])
        generator.shuffle(critical)
        generator.shuffle(normal)
        forms = []
        for index in range(20):
            form_questions = critical[index * 3:(index + 1) * 3]
            form_questions += normal[index * 27:(index + 1) * 27]
            generator.shuffle(form_questions)
            forms.append(form_questions)

        if options["dry_run"]:
            self.stdout.write(self.style.SUCCESS(
                "Validated 600 questions: 20 distinct forms, each with 30 questions "
                "including exactly 3 critical questions. No database changes made."
            ))
            return

        with transaction.atomic():
            license_class.questions.add(*questions)
            for index, form_questions in enumerate(forms, start=1):
                name = f"Hạng B - Đề cố định {index:02}"
                fixed_question_ids = [question.pk for question in form_questions]
                configuration = ExamConfiguration.objects.filter(
                    license_class=license_class,
                    name=name,
                    version=1,
                ).first()
                if configuration is None:
                    ExamConfiguration.objects.create(
                        license_class=license_class,
                        name=name,
                        question_count=30,
                        duration_seconds=None,
                        passing_score=None,
                        question_distribution={},
                        fixed_question_ids=fixed_question_ids,
                        is_active=False,
                        version=1,
                    )
                    continue
                if configuration.fixed_question_ids != fixed_question_ids:
                    if configuration.is_active or configuration.sessions.exists():
                        raise CommandError(
                            f"{name} is active or has exam sessions; its fixed questions cannot be changed."
                        )
                    configuration.fixed_question_ids = fixed_question_ids
                    configuration.question_count = 30
                    configuration.question_distribution = {}
                    configuration.save(update_fields=[
                        "fixed_question_ids",
                        "question_count",
                        "question_distribution",
                        "updated_at",
                    ])

        self.stdout.write(self.style.SUCCESS(
            "Assigned 600 questions to class B and saved 20 fixed exam drafts. "
            "Each has 30 questions and exactly 3 critical questions. New drafts are inactive "
            "until duration and passing score are set; existing forms keep their status."
        ))
