import uuid

from django.conf import settings
from django.db import models

from apps.question_bank.models import LicenseClass


class ExamConfiguration(models.Model):
    class CriticalPolicy(models.TextChoices):
        FAIL_ON_WRONG = "fail_on_wrong", "Fail on wrong critical question"

    license_class = models.ForeignKey(LicenseClass, on_delete=models.PROTECT, related_name="exam_configurations")
    name = models.CharField(max_length=120)
    question_count = models.PositiveSmallIntegerField()
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    passing_score = models.PositiveSmallIntegerField(null=True, blank=True)
    critical_question_policy = models.CharField(
        max_length=24, choices=CriticalPolicy.choices, default=CriticalPolicy.FAIL_ON_WRONG
    )
    question_distribution = models.JSONField(default=dict, blank=True)
    fixed_question_ids = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("license_class__code", "name", "-version")
        constraints = [
            models.CheckConstraint(condition=models.Q(question_count__gt=0), name="exam_question_count_positive"),
            models.CheckConstraint(condition=models.Q(duration_seconds__gt=0), name="exam_duration_positive"),
            models.CheckConstraint(condition=models.Q(passing_score__lte=models.F("question_count")), name="exam_pass_score_within_count"),
            models.UniqueConstraint(fields=("license_class", "name", "version"), name="unique_exam_config_version"),
        ]

    def __str__(self):
        return f"{self.name} ({self.license_class.code}, v{self.version})"


class ExamSession(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        SUBMITTED = "submitted", "Submitted"
        EXPIRED = "expired", "Expired and auto-submitted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="exam_sessions",
    )
    configuration = models.ForeignKey(ExamConfiguration, on_delete=models.PROTECT, related_name="sessions")
    started_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    submitted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IN_PROGRESS)
    question_snapshot = models.JSONField()
    answers = models.JSONField(default=dict)
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    correct_count = models.PositiveSmallIntegerField(null=True, blank=True)
    wrong_count = models.PositiveSmallIntegerField(null=True, blank=True)
    unanswered_count = models.PositiveSmallIntegerField(null=True, blank=True)
    critical_failure = models.BooleanField(null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)
    config_snapshot = models.JSONField(default=dict)

    class Meta:
        indexes = [models.Index(fields=("user", "started_at")), models.Index(fields=("user", "status"))]
        ordering = ("-started_at",)


class ExamResult(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(ExamSession, on_delete=models.PROTECT, related_name="result")
    created_at = models.DateTimeField(auto_now_add=True)
    grading_version = models.PositiveSmallIntegerField(default=1)

    @property
    def user(self):
        return self.session.user

    class Meta:
        ordering = ("-created_at",)
