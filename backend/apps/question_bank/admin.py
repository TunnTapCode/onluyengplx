from django.contrib import admin

from .models import AnswerOption, LicenseClass, Question, QuestionCategory, QuestionReport


class AnswerInline(admin.TabularInline):
    model = AnswerOption
    extra = 0


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("question_number", "category", "is_critical", "is_active")
    list_filter = ("category", "is_critical", "is_active", "license_classes")
    search_fields = ("content", "question_number")
    readonly_fields = ("created_at", "updated_at")
    inlines = (AnswerInline,)
    filter_horizontal = ("license_classes",)


@admin.register(QuestionCategory)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "source_chapter_number", "question_count")
    prepopulated_fields = {"slug": ("name",)}

    @admin.display(description="Questions")
    def question_count(self, obj):
        return obj.questions.count()


admin.site.register(LicenseClass)
admin.site.register(QuestionReport)
