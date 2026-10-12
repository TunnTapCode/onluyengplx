from rest_framework import serializers

from .models import ExamConfiguration


class ExamConfigurationSerializer(serializers.ModelSerializer):
    license_class_code = serializers.CharField(source="license_class.code", read_only=True)

    class Meta:
        model = ExamConfiguration
        fields = ("id", "license_class_code", "name", "question_count", "duration_seconds",
                  "passing_score", "critical_question_policy", "question_distribution", "version")


class ExamAnswersSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.CharField(max_length=16), allow_empty=True)


class ExamSessionCreateSerializer(serializers.Serializer):
    configuration_id = serializers.IntegerField(min_value=1)


class ExamSessionResponseSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    status = serializers.CharField()
    started_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    configuration = serializers.JSONField()
    answers = serializers.JSONField()
    questions = serializers.ListField(child=serializers.JSONField())
    result = serializers.JSONField(allow_null=True)


class ExamResultSerializer(serializers.Serializer):
    attempt_id = serializers.UUIDField(allow_null=True)
    session_id = serializers.UUIDField()
    status = serializers.CharField()
    started_at = serializers.DateTimeField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    expires_at = serializers.DateTimeField()
    score = serializers.IntegerField(allow_null=True)
    correct_count = serializers.IntegerField(allow_null=True)
    wrong_count = serializers.IntegerField(allow_null=True)
    unanswered_count = serializers.IntegerField(allow_null=True)
    critical_failure = serializers.BooleanField(allow_null=True)
    passed = serializers.BooleanField(allow_null=True)
    questions = serializers.ListField(child=serializers.JSONField())


class ExamHistoryItemSerializer(serializers.Serializer):
    attempt_id = serializers.UUIDField()
    session_id = serializers.UUIDField()
    license_class = serializers.CharField(allow_null=True)
    score = serializers.IntegerField(allow_null=True)
    passed = serializers.BooleanField(allow_null=True)
    critical_failure = serializers.BooleanField(allow_null=True)
    started_at = serializers.DateTimeField()
    submitted_at = serializers.DateTimeField(allow_null=True)
