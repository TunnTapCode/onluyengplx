from rest_framework import serializers

from apps.question_bank.models import LicenseClass, Question
from .models import ExamConfiguration
from .question_sets import InvalidFixedQuestionSet, resolve_fixed_question_set


class ExamConfigurationSerializer(serializers.ModelSerializer):
    license_class_code = serializers.CharField(source="license_class.code", read_only=True)
    license_class = serializers.PrimaryKeyRelatedField(
        queryset=LicenseClass.objects.filter(is_active=True)
    )
    eligible_question_count = serializers.SerializerMethodField()
    eligible_critical_question_count = serializers.SerializerMethodField()

    class Meta:
        model = ExamConfiguration
        fields = (
            "id",
            "license_class",
            "license_class_code",
            "eligible_question_count",
            "eligible_critical_question_count",
            "name",
            "question_count",
            "duration_seconds",
            "passing_score",
            "critical_question_policy",
            "question_distribution",
            "fixed_question_ids",
            "version",
            "is_active",
        )
        read_only_fields = (
            "id",
            "license_class_code",
            "eligible_question_count",
            "eligible_critical_question_count",
            "critical_question_policy",
        )

    def get_eligible_question_count(self, obj):
        return Question.objects.filter(
            is_active=True,
            license_classes=obj.license_class,
        ).count()

    def get_eligible_critical_question_count(self, obj):
        return Question.objects.filter(
            is_active=True,
            is_critical=True,
            license_classes=obj.license_class,
        ).count()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        configuration = self.instance
        license_class = attrs.get("license_class", getattr(configuration, "license_class", None))
        question_count = attrs.get("question_count", getattr(configuration, "question_count", None))
        duration_seconds = attrs.get(
            "duration_seconds", getattr(configuration, "duration_seconds", None)
        )
        passing_score = attrs.get("passing_score", getattr(configuration, "passing_score", None))
        is_active = attrs.get("is_active", getattr(configuration, "is_active", True))
        distribution = attrs.get(
            "question_distribution",
            getattr(configuration, "question_distribution", {}),
        ) or {}
        fixed_question_ids = attrs.get(
            "fixed_question_ids",
            getattr(configuration, "fixed_question_ids", []),
        ) or []

        if question_count is not None and passing_score is not None and passing_score > question_count:
            raise serializers.ValidationError({
                "passing_score": "Điểm đạt không được lớn hơn tổng số câu hỏi."
            })
        if question_count is not None and question_count < 1:
            raise serializers.ValidationError({
                "question_count": "Đề thi phải có ít nhất một câu hỏi."
            })
        if question_count is not None and question_count < 3:
            raise serializers.ValidationError({
                "question_count": "Mỗi đề phải có ít nhất 3 câu điểm liệt."
            })
        if is_active and duration_seconds is None:
            raise serializers.ValidationError({
                "duration_seconds": "Hãy nhập thời lượng trước khi bật cấu hình."
            })
        if is_active and passing_score is None:
            raise serializers.ValidationError({
                "passing_score": "Hãy nhập điểm đạt trước khi bật cấu hình."
            })
        if duration_seconds is not None and duration_seconds < 1:
            raise serializers.ValidationError({
                "duration_seconds": "Thời lượng phải lớn hơn 0."
            })
        if not isinstance(distribution, dict):
            raise serializers.ValidationError({
                "question_distribution": "Phân bố câu hỏi phải là một JSON object."
            })
        if license_class is not None and configuration is not None:
            name = attrs.get("name", configuration.name)
            version = attrs.get("version", configuration.version)
            duplicate = ExamConfiguration.objects.filter(
                license_class=license_class,
                name=name,
                version=version,
            ).exclude(pk=configuration.pk)
            if duplicate.exists():
                raise serializers.ValidationError({
                    "name": "Tên và phiên bản này đã được dùng cho hạng GPLX đã chọn."
                })
        elif license_class is not None and "name" in attrs:
            version = attrs.get("version", 1)
            if ExamConfiguration.objects.filter(
                license_class=license_class,
                name=attrs["name"],
                version=version,
            ).exists():
                raise serializers.ValidationError({
                    "name": "Tên và phiên bản này đã được dùng cho hạng GPLX đã chọn."
                })
        if not is_active or license_class is None or question_count is None:
            if fixed_question_ids and license_class is not None and question_count is not None:
                if distribution:
                    raise serializers.ValidationError({
                        "question_distribution": "Không thể kết hợp bộ câu cố định với phân bố ngẫu nhiên."
                    })
                try:
                    resolve_fixed_question_set(fixed_question_ids, license_class, question_count)
                except InvalidFixedQuestionSet as exc:
                    raise serializers.ValidationError({"fixed_question_ids": str(exc)}) from exc
            return attrs

        question_pool = Question.objects.filter(
            is_active=True,
            license_classes=license_class,
        )
        pool_count = question_pool.count()
        if pool_count < question_count:
            raise serializers.ValidationError({
                "question_count": (
                    f"Hạng {license_class.code} hiện có {pool_count} câu đủ điều kiện; "
                    f"cần ít nhất {question_count}."
                )
            })
        critical_pool_count = question_pool.filter(is_critical=True).count()
        if critical_pool_count < 3:
            raise serializers.ValidationError({
                "question_count": (
                    f"Hạng {license_class.code} hiện chỉ có {critical_pool_count} câu điểm liệt "
                    "đang hoạt động được gán; cần ít nhất 3."
                )
            })

        if fixed_question_ids:
            if distribution:
                raise serializers.ValidationError({
                    "question_distribution": "Không thể kết hợp bộ câu cố định với phân bố ngẫu nhiên."
                })
            try:
                resolve_fixed_question_set(fixed_question_ids, license_class, question_count)
            except InvalidFixedQuestionSet as exc:
                raise serializers.ValidationError({"fixed_question_ids": str(exc)}) from exc
            return attrs

        distributed_count = 0
        critical_capacity_in_distribution = 0
        remaining_critical_slots = 3
        distribution_errors = []
        for category_key, count in distribution.items():
            if isinstance(count, bool) or not isinstance(count, int) or count <= 0:
                distribution_errors.append(
                    f"Số câu ở chương {category_key!r} phải là số nguyên dương."
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
            if available < count:
                distribution_errors.append(
                    f"Chương {category_key!r} có {available} câu đủ điều kiện, "
                    f"không đủ {count} câu được yêu cầu."
                )
            selected_critical = min(count, critical_available, remaining_critical_slots)
            remaining_critical_slots -= selected_critical
            critical_capacity_in_distribution += selected_critical
            noncritical_available = available - critical_available
            if noncritical_available < count - selected_critical:
                distribution_errors.append(
                    f"Chương {category_key!r} không đủ câu thường để giữ đúng 3 câu "
                    "điểm liệt trong đề."
                )
            distributed_count += count

        if distributed_count > question_count:
            distribution_errors.append(
                f"Tổng số câu phân bố ({distributed_count}) vượt tổng số câu "
                f"của đề ({question_count})."
            )
        elif min(
            critical_pool_count,
            critical_capacity_in_distribution + question_count - distributed_count,
        ) < 3:
            distribution_errors.append(
                "Phân bố chương không thể chứa đủ 3 câu điểm liệt; hãy tăng số câu "
                "chưa phân chương hoặc chọn chương có câu điểm liệt."
            )
        if distribution_errors:
            raise serializers.ValidationError({
                "question_distribution": distribution_errors
            })
        return attrs


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
    attempt_id = serializers.CharField(allow_null=True)
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


class ExamConfigurationProgressSerializer(serializers.Serializer):
    configuration_id = serializers.IntegerField()
    attempt_id = serializers.UUIDField()
    passed = serializers.BooleanField()
    score = serializers.IntegerField()
    started_at = serializers.DateTimeField()
