from django.conf import settings
from django.db import models


class LicenseClass(models.Model):
    code = models.CharField(max_length=12, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.code} — {self.name}"


class QuestionCategory(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    source_chapter_number = models.PositiveSmallIntegerField(null=True, blank=True, unique=True)

    class Meta:
        ordering = ("order", "id")
        verbose_name_plural = "question categories"

    def __str__(self):
        return self.name


class Question(models.Model):
    question_number = models.PositiveIntegerField(unique=True)
    category = models.ForeignKey(QuestionCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="questions")
    content = models.TextField()
    image = models.ImageField(upload_to="questions/", null=True, blank=True)
    explanation = models.TextField(null=True, blank=True)
    is_critical = models.BooleanField(null=True, blank=True)
    license_classes = models.ManyToManyField(LicenseClass, blank=True, related_name="questions")
    source = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("question_number",)
        indexes = [
            models.Index(fields=("category", "is_active")),
            models.Index(fields=("is_critical", "is_active")),
        ]

    def __str__(self):
        return f"Question {self.question_number}"


class AnswerOption(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="answers")
    label = models.CharField(max_length=16)
    content = models.TextField()
    is_correct = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("order", "id")
        constraints = [
            models.UniqueConstraint(fields=("question", "label"), name="unique_question_answer_label"),
        ]

    def __str__(self):
        return f"{self.question}: {self.label}"


class QuestionBookmark(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="question_bookmarks")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="bookmarks")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("user", "question"), name="unique_user_question_bookmark")]
        ordering = ("-created_at",)


class QuestionAttempt(models.Model):
    class Mode(models.TextChoices):
        PRACTICE = "practice", "Practice"
        REVIEW = "review", "Review"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="question_attempts")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="attempts")
    selected_options = models.JSONField(default=list)
    is_correct = models.BooleanField()
    answered_at = models.DateTimeField(auto_now_add=True)
    attempt_mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.PRACTICE)

    class Meta:
        indexes = [models.Index(fields=("user", "answered_at")), models.Index(fields=("user", "is_correct"))]
        ordering = ("-answered_at",)


class QuestionReport(models.Model):
    class Reason(models.TextChoices):
        WRONG_ANSWER = "wrong_answer", "Wrong answer"
        TYPO = "typo", "Typo or wording"
        OUTDATED = "outdated", "Possibly outdated"
        MISSING_IMAGE = "missing_image", "Missing or incorrect image"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        REVIEWING = "reviewing", "Reviewing"
        RESOLVED = "resolved", "Resolved"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="question_reports")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="reports")
    reason = models.CharField(max_length=40, choices=Reason.choices)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=("status", "created_at"))]
        ordering = ("-created_at",)

    def __str__(self):
        return f"Report #{self.pk} — Q{self.question.question_number}"
