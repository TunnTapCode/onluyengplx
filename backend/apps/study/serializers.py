from rest_framework import serializers


class StudyAnswerSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    selected_options = serializers.ListField(child=serializers.CharField(max_length=16), allow_empty=True)
    attempt_mode = serializers.ChoiceField(choices=("practice", "review"), default="practice")

    def validate_selected_options(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Answer keys must be unique.")
        return value


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
