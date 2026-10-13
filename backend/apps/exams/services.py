from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.question_bank.models import Question
from .models import ExamResult, ExamSession
from .question_sets import InvalidFixedQuestionSet, resolve_fixed_question_set


class NotEnoughQuestions(Exception):
    pass


class InvalidDistribution(Exception):
    pass


def public_questions(session):
    return [{
        "question_id": item["question_id"],
        "question_number": item["question_number"],
        "category_name": item["category_name"],
        "content": item["content"],
        "image": item["image"],
        "is_critical": item["is_critical"],
        "answers": item["answers"],
    } for item in session.question_snapshot]


def create_session(user, configuration):
    license_class = configuration.license_class
    pool = Question.objects.filter(is_active=True, license_classes=license_class)
    distribution = configuration.question_distribution or {}
    if not isinstance(distribution, dict):
        raise InvalidDistribution("Question distribution must be a JSON object.")
    if configuration.question_count < 3:
        raise InvalidDistribution("An exam must contain at least three questions.")
    if pool.filter(is_critical=True).count() < 3:
        raise NotEnoughQuestions(
            "At least three active critical questions must be assigned to this license class."
        )
    fixed_question_ids = configuration.fixed_question_ids or []
    if fixed_question_ids:
        if distribution:
            raise InvalidDistribution(
                "A fixed question set cannot be combined with a category distribution."
            )
        try:
            questions = resolve_fixed_question_set(
                fixed_question_ids,
                license_class,
                configuration.question_count,
            )
        except InvalidFixedQuestionSet as exc:
            raise InvalidDistribution(str(exc)) from exc
    else:
        questions = None
    requested = []
    selected_critical_count = 0
    if questions is None:
        for category_key, count in distribution.items():
            if not str(count).isdigit() or int(count) < 1:
                raise InvalidDistribution("Each category count must be a positive integer.")
            try:
                category_filter = {"category_id": int(category_key)}
            except (TypeError, ValueError):
                category_filter = {"category__slug": str(category_key)}
            category_pool = pool.filter(**category_filter)
            critical_count = min(
                int(count),
                3 - selected_critical_count,
                category_pool.filter(is_critical=True).count(),
            )
            group = list(
                category_pool.filter(is_critical=True)
                .select_related("category").prefetch_related("answers")
                .order_by("?")[:critical_count]
            )
            selected_critical_count += len(group)
            normal_count = int(count) - len(group)
            group.extend(
                category_pool.exclude(is_critical=True)
                .select_related("category").prefetch_related("answers")
                .order_by("?")[:normal_count]
            )
            if len(group) != int(count):
                raise NotEnoughQuestions(f"Not enough eligible questions in category {category_key}.")
            requested.extend(group)
        if len(requested) > configuration.question_count:
            raise InvalidDistribution("Category counts exceed the configured exam question count.")
        selected_ids = [question.pk for question in requested]
        remaining = configuration.question_count - len(requested)
        extra_critical = list(
            pool.filter(is_critical=True).exclude(pk__in=selected_ids)
            .select_related("category").prefetch_related("answers")
            .order_by("?")[:max(0, 3 - selected_critical_count)]
        )
        if selected_critical_count + len(extra_critical) < 3:
            raise NotEnoughQuestions("The exam distribution cannot include three critical questions.")
        questions = requested + extra_critical
        selected_ids.extend(question.pk for question in extra_critical)
        remaining -= len(extra_critical)
        questions += list(
            pool.exclude(pk__in=selected_ids).exclude(is_critical=True)
            .select_related("category").prefetch_related("answers").order_by("?")[:remaining]
        )
    if len(questions) != configuration.question_count:
        raise NotEnoughQuestions(
            "Not enough curated, active non-critical questions assigned to this license class."
        )
    snapshot = []
    for question in questions:
        options = list(question.answers.all())
        correct = [option.label for option in options if option.is_correct]
        snapshot.append({
            "question_id": question.pk,
            "question_number": question.question_number,
            "category_name": question.category.name if question.category else None,
            "content": question.content,
            "image": question.image.url if question.image else None,
            "explanation": question.explanation,
            "is_critical": question.is_critical,
            "answers": [{"key": option.label, "text": option.content} for option in options],
            "correct_keys": correct,
        })
    now = timezone.now()
    config_snapshot = {
        "configuration_id": configuration.pk,
        "name": configuration.name,
        "license_class": license_class.code,
        "question_count": configuration.question_count,
        "duration_seconds": configuration.duration_seconds,
        "passing_score": configuration.passing_score,
        "critical_question_policy": configuration.critical_question_policy,
        "question_distribution": configuration.question_distribution,
        "version": configuration.version,
    }
    return ExamSession.objects.create(
        user=user,
        configuration=configuration,
        started_at=now,
        expires_at=now + timedelta(seconds=configuration.duration_seconds),
        question_snapshot=snapshot,
        config_snapshot=config_snapshot,
    )


@transaction.atomic
def finalize_session(session_id, user_id, expired=False):
    session = ExamSession.objects.select_for_update().select_related("configuration").get(
        pk=session_id, user_id=user_id
    )
    if session.status != ExamSession.Status.IN_PROGRESS:
        return session, getattr(session, "result", None)
    now = timezone.now()
    was_expired = expired or now >= session.expires_at
    correct_count = wrong_count = unanswered_count = 0
    critical_failure = False
    details = []
    for question in session.question_snapshot:
        question_key = str(question["question_id"])
        selected = session.answers.get(question_key)
        correct_keys = question.get("correct_keys", [])
        correct = selected in correct_keys
        unanswered = selected is None
        if unanswered:
            unanswered_count += 1
        elif correct:
            correct_count += 1
        else:
            wrong_count += 1
        failed_critical = question.get("is_critical") is True and not correct
        critical_failure = critical_failure or failed_critical
        details.append({
            "question_id": question["question_id"],
            "question_number": question["question_number"],
            "category_name": question["category_name"],
            "content": question["content"],
            "image": question["image"],
            "explanation": question.get("explanation"),
            "is_critical": question.get("is_critical"),
            "answers": question["answers"],
            "selected_key": selected,
            "correct_keys": correct_keys,
            "is_correct": correct,
        })
    score = correct_count
    passed = score >= session.config_snapshot["passing_score"] and not critical_failure
    session.submitted_at = now
    session.status = ExamSession.Status.EXPIRED if was_expired else ExamSession.Status.SUBMITTED
    session.score = score
    session.correct_count = correct_count
    session.wrong_count = wrong_count
    session.unanswered_count = unanswered_count
    session.critical_failure = critical_failure
    session.passed = passed
    session.save(update_fields=(
        "submitted_at", "status", "score", "correct_count", "wrong_count",
        "unanswered_count", "critical_failure", "passed",
    ))
    result = ExamResult.objects.create(session=session) if session.user_id else None
    return session, result


def result_payload(session):
    result = getattr(session, "result", None)
    return {
        "attempt_id": str(result.pk) if result else None,
        "session_id": str(session.pk),
        "status": session.status,
        "started_at": session.started_at,
        "submitted_at": session.submitted_at,
        "expires_at": session.expires_at,
        "score": session.score,
        "correct_count": session.correct_count,
        "wrong_count": session.wrong_count,
        "unanswered_count": session.unanswered_count,
        "critical_failure": session.critical_failure,
        "passed": session.passed,
        "questions": [{
            **question,
            "selected_key": session.answers.get(str(question["question_id"])),
            "is_correct": session.answers.get(str(question["question_id"])) in question.get("correct_keys", []),
        } for question in session.question_snapshot],
    }
