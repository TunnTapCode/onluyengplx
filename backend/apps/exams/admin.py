from django.contrib import admin

from .models import ExamConfiguration, ExamResult, ExamSession


@admin.register(ExamConfiguration)
class ExamConfigurationAdmin(admin.ModelAdmin):
    list_display = ("name", "license_class", "question_count", "duration_seconds", "passing_score", "version", "is_active")
    list_filter = ("license_class", "is_active", "critical_question_policy")


@admin.register(ExamSession)
class ExamSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "configuration", "status", "score", "started_at", "submitted_at")
    readonly_fields = ("id", "user", "configuration", "started_at", "expires_at", "submitted_at", "status",
                       "question_snapshot", "answers", "score", "correct_count", "wrong_count",
                       "unanswered_count", "critical_failure", "passed", "config_snapshot")
    def has_add_permission(self, request):
        return False
    def has_change_permission(self, request, obj=None):
        return False
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ExamResult)
class ExamResultAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "created_at", "grading_version")
    readonly_fields = ("id", "session", "created_at", "grading_version")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
