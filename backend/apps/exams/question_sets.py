from apps.question_bank.models import LicenseClass, Question


class InvalidFixedQuestionSet(ValueError):
    pass


def resolve_fixed_question_set(question_ids, license_class: LicenseClass, question_count: int):
    if not isinstance(question_ids, list):
        raise InvalidFixedQuestionSet("Danh sách câu cố định phải là một JSON array.")
    if any(isinstance(question_id, bool) or not isinstance(question_id, int) for question_id in question_ids):
        raise InvalidFixedQuestionSet("Mỗi mã câu hỏi cố định phải là số nguyên.")
    if len(question_ids) != question_count:
        raise InvalidFixedQuestionSet(
            f"Bộ đề cố định phải có đúng {question_count} mã câu hỏi."
        )
    if len(set(question_ids)) != len(question_ids):
        raise InvalidFixedQuestionSet("Bộ đề cố định không được lặp câu hỏi.")

    eligible = Question.objects.filter(
        pk__in=question_ids,
        is_active=True,
        license_classes=license_class,
    ).select_related("category").prefetch_related("answers")
    by_id = {question.pk: question for question in eligible}
    if len(by_id) != len(question_ids):
        raise InvalidFixedQuestionSet(
            f"Mọi câu trong bộ đề phải đang hoạt động và được gán cho hạng {license_class.code}."
        )

    questions = [by_id[question_id] for question_id in question_ids]
    critical_count = sum(question.is_critical is True for question in questions)
    if critical_count != 3:
        raise InvalidFixedQuestionSet(
            f"Bộ đề cố định phải có đúng 3 câu điểm liệt; hiện có {critical_count}."
        )
    return questions
