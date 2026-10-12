from rest_framework import serializers

from apps.question_bank.models import QuestionReport


class QuestionReportSerializer(serializers.ModelSerializer):
    question = serializers.IntegerField(source="question_id", read_only=True)

    class Meta:
        model = QuestionReport
        fields = ("id", "question", "reason", "description", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")
