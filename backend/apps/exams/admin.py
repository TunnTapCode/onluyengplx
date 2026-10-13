from django.contrib import admin
from django import forms
from django.core.exceptions import ValidationError

from apps.question_bank.models import Question
from .models import ExamConfiguration, ExamResult, ExamSession
from .question_sets import InvalidFixedQuestionSet, resolve_fixed_question_set


class ExamConfigurationAdminForm(forms.ModelForm):
    class Meta:
        model = ExamConfiguration
        fields = (
            "license_class",
            "name",
            "question_count",
            "duration_seconds",
            "passing_score",
            "question_distribution",
            "fixed_question_ids",
            "is_active",
            "version",
        )
        help_texts = {
            "question_distribution": (
                "Tùy chọn: JSON object phân bổ số câu theo ID chương hoặc slug chương, "
                'ví dụ {"1": 10, "chapter-2-bien-bao": 5}. Để trống {} để lấy ngẫu nhiên '
                "toàn bộ câu đủ điều kiện của hạng."
            ),
            "fixed_question_ids": (
                "Tùy chọn: JSON array mã câu hỏi để lưu một đề cố định, ví dụ [12, 34, 56]. "
                "Bộ cố định phải có đúng số câu cấu hình và đúng 3 câu điểm liệt."
            ),
            "question_count": "Tổng số câu trong đề; phải có ít nhất 3 câu.",
            "duration_seconds": "Thời gian làm bài tính bằng giây, ví dụ 1200 cho 20 phút.",
            "passing_score": "Số câu đúng tối thiểu để đạt.",
        }

    def clean(self):
        cleaned_data = super().clean()
        license_class = cleaned_data.get("license_class")
        question_count = cleaned_data.get("question_count")
        distribution = cleaned_data.get("question_distribution") or {}
        fixed_question_ids = cleaned_data.get("fixed_question_ids") or []
        if fixed_question_ids and license_class and question_count:
            if distribution:
                self.add_error(
                    "question_distribution",
                    "Không thể kết hợp bộ câu cố định với phân bố ngẫu nhiên.",
                )
            try:
                resolve_fixed_question_set(fixed_question_ids, license_class, question_count)
            except InvalidFixedQuestionSet as exc:
                self.add_error("fixed_question_ids", str(exc))
        if not cleaned_data.get("is_active"):
            return cleaned_data

        if not license_class or not question_count:
            return cleaned_data
        if cleaned_data.get("duration_seconds") is None:
            self.add_error("duration_seconds", "Hãy nhập thời lượng trước khi bật cấu hình.")
        if cleaned_data.get("passing_score") is None:
            self.add_error("passing_score", "Hãy nhập điểm đạt trước khi bật cấu hình.")
        if question_count < 3:
            self.add_error("question_count", "Mỗi đề phải có ít nhất 3 câu điểm liệt.")
        if not isinstance(distribution, dict):
            raise ValidationError({
                "question_distribution": "Phân bố câu hỏi phải là một JSON object."
            })

        question_pool = Question.objects.filter(
            is_active=True,
            license_classes=license_class,
        )
        pool_count = question_pool.count()
        if pool_count < question_count:
            self.add_error(
                "question_count",
                f"Hạng {license_class.code} hiện có {pool_count} câu hỏi đang hoạt động "
                f"được gán; cần ít nhất {question_count}.",
            )
        critical_pool_count = question_pool.filter(is_critical=True).count()
        if critical_pool_count < 3:
            self.add_error(
                "question_count",
                f"Hạng {license_class.code} hiện có {critical_pool_count} câu điểm liệt "
                "đang hoạt động được gán; cần ít nhất 3.",
            )

        distributed_count = 0
        critical_capacity_in_distribution = 0
        remaining_critical_slots = 3
        distribution_errors = []
        for category_key, count in distribution.items():
            if isinstance(count, bool) or not isinstance(count, int) or count <= 0:
                distribution_errors.append(
                    f"Số câu cho chương {category_key!r} phải là số nguyên dương.",
                )
                continue

            try:
                category_filter = {"category_id": int(category_key)}
            except (TypeError, ValueError):
                category_filter = {"category__slug": str(category_key)}

            available = question_pool.filter(**category_filter).count()
            critical_available = question_pool.filter(
                **category_filter,
                is_critical=True,
            ).count()
            selected_critical = min(count, critical_available, remaining_critical_slots)
            remaining_critical_slots -= selected_critical
            critical_capacity_in_distribution += selected_critical
            if available - critical_available < count - selected_critical:
                distribution_errors.append(
                    f"Chương {category_key!r} không đủ câu thường để giữ đúng 3 câu điểm liệt."
                )
            if available < count:
                distribution_errors.append(
                    f"Chương {category_key!r} chỉ có {available} câu đủ điều kiện, "
                    f"nhưng cấu hình yêu cầu {count}.",
                )
            distributed_count += count

        if distributed_count > question_count:
            distribution_errors.append(
                f"Tổng số câu phân bố ({distributed_count}) vượt tổng số câu của đề "
                f"({question_count}).",
            )
        elif min(
            critical_pool_count,
            critical_capacity_in_distribution + question_count - distributed_count,
        ) < 3:
            distribution_errors.append("Phân bố chương không thể chứa đủ 3 câu điểm liệt.")
        if distribution_errors:
            self.add_error(
                "question_distribution",
                " ".join(distribution_errors),
            )
        return cleaned_data


@admin.register(ExamConfiguration)
class ExamConfigurationAdmin(admin.ModelAdmin):
    form = ExamConfigurationAdminForm
    list_display = (
        "name",
        "license_class",
        "question_count",
        "eligible_question_count",
        "duration_seconds",
        "passing_score",
        "version",
        "is_active",
        "eligible_critical_question_count",
    )
    list_filter = ("license_class", "is_active")
    search_fields = ("name", "license_class__code", "license_class__name")
    list_select_related = ("license_class",)
    fieldsets = (
        ("Thông tin đề thi", {
            "fields": ("name", "license_class", "version", "is_active"),
        }),
        ("Thời lượng và chấm điểm", {
            "fields": (
                "question_count",
                "duration_seconds",
                "passing_score",
            ),
        }),
        ("Phân bố câu hỏi", {
            "fields": ("question_distribution", "fixed_question_ids"),
            "description": (
                "Chỉ lấy câu hỏi đang hoạt động và đã gán đúng hạng GPLX. "
                "Để trống cả hai trường để chọn ngẫu nhiên."
            ),
        }),
    )

    @admin.display(description="Câu đủ điều kiện", ordering="license_class__code")
    def eligible_question_count(self, obj):
        return Question.objects.filter(
            is_active=True,
            license_classes=obj.license_class,
        ).count()

    @admin.display(description="Câu điểm liệt", ordering="license_class__code")
    def eligible_critical_question_count(self, obj):
        return Question.objects.filter(
            is_active=True,
            is_critical=True,
            license_classes=obj.license_class,
        ).count()


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
