from rest_framework import serializers
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field

from .models import AnswerOption, LicenseClass, Question, QuestionCategory


class LicenseClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = LicenseClass
        fields = ("id", "code", "name", "description")


class CategorySerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = QuestionCategory
        fields = ("id", "name", "slug", "order", "question_count")


class AnswerOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnswerOption
        fields = ("label", "content", "order")


class QuestionSerializer(serializers.ModelSerializer):
    answers = AnswerOptionSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True, allow_null=True)
    image = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = ("id", "question_number", "category", "category_name", "content", "image",
                  "is_critical", "answers")

    @extend_schema_field(OpenApiTypes.URI)
    def get_image(self, obj) -> str | None:
        if not obj.image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url
