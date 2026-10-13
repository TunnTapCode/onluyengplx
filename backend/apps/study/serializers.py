from rest_framework import serializers


class StudyAnswerSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    selected_options = serializers.ListField(child=serializers.CharField(max_length=16), allow_empty=False)
    attempt_mode = serializers.ChoiceField(choices=("practice", "review"), default="practice")

    def validate_selected_options(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Answer keys must be unique.")
        return value


class StudyResetSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("full", "chapter", "critical"))
    category = serializers.IntegerField(required=False)
    license_class = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if attrs["mode"] == "chapter" and "category" not in attrs:
            raise serializers.ValidationError({"category": "This field is required for chapter practice."})
        if attrs["mode"] != "chapter" and "category" in attrs:
            raise serializers.ValidationError({"category": "Only chapter practice accepts a category."})
        if attrs["mode"] != "full" and "license_class" in attrs:
            raise serializers.ValidationError({"license_class": "Only full practice accepts a license class."})
        return attrs


class StudyQuestionStatusQuerySerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("full", "chapter", "critical"))
    category = serializers.IntegerField(required=False)
    license_class = serializers.IntegerField(required=False)

    def validate(self, attrs):
        if attrs["mode"] == "chapter" and "category" not in attrs:
            raise serializers.ValidationError({"category": "This field is required for chapter practice."})
        if attrs["mode"] != "chapter" and "category" in attrs:
            raise serializers.ValidationError({"category": "Only chapter practice accepts a category."})
        if attrs["mode"] != "full" and "license_class" in attrs:
            raise serializers.ValidationError({"license_class": "Only full practice accepts a license class."})
        return attrs


class BookmarkCreateSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()


class BookmarkStatusSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    bookmarked = serializers.BooleanField()


class StudyAnswerResponseSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    is_correct = serializers.BooleanField()
    correct_options = serializers.ListField(child=serializers.CharField())
    explanation = serializers.CharField(allow_null=True)


class StudyResetResponseSerializer(serializers.Serializer):
    deleted_attempts = serializers.IntegerField()


class StudyQuestionStatusSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    page = serializers.IntegerField()
    is_correct = serializers.BooleanField()


class StudyProgressSerializer(serializers.Serializer):
    answered_questions = serializers.IntegerField()
    correct_answers = serializers.IntegerField()
    incorrect_answers = serializers.IntegerField()
    last_answered_at = serializers.DateTimeField(allow_null=True)
    answer_count = serializers.IntegerField()
    accuracy_percentage = serializers.IntegerField()
    exam_count = serializers.IntegerField()
    average_exam_score = serializers.FloatField()
    exam_scores = serializers.ListField(child=serializers.DictField())
    category_progress = serializers.ListField(child=serializers.DictField())
