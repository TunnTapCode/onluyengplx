import json
import hashlib
from io import BytesIO
from pathlib import Path
import re
import zipfile

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify
from PIL import Image

from apps.question_bank.models import AnswerOption, Question, QuestionCategory


class BaseSchemaError(Exception):
    pass


def validate_source(records, archive_path=None, images_dir=None):
    errors = []
    if not isinstance(records, list):
        return [], ["$: expected a JSON array"]
    identifiers = set()
    references = {}
    chapter_names = {}
    for index, item in enumerate(records):
        if not isinstance(item, dict):
            errors.append(f"record[{index}]: expected an object")
            continue
        question_id_for_error = item.get("id")
        prefix = (f"question {question_id_for_error}"
                  if isinstance(question_id_for_error, int) and not isinstance(question_id_for_error, bool)
                  else f"record[{index}]")
        required = {"id", "chapter", "chapter_name", "question", "image", "answers", "correct_answer", "is_critical"}
        missing = required - set(item)
        extra = set(item) - required
        errors.extend(f"{prefix}.{key}: missing required field" for key in sorted(missing))
        errors.extend(f"{prefix}.{key}: unsupported field" for key in sorted(extra))
        question_id = item.get("id")
        if isinstance(question_id, bool) or not isinstance(question_id, int) or question_id <= 0:
            errors.append(f"{prefix}.id: expected a positive integer")
        elif question_id in identifiers:
            errors.append(f"{prefix}.id: duplicate question id {question_id}")
        else:
            identifiers.add(question_id)
        chapter = item.get("chapter")
        if isinstance(chapter, bool) or not isinstance(chapter, int) or chapter <= 0:
            errors.append(f"{prefix}.chapter: expected a positive integer")
        if not isinstance(item.get("chapter_name"), str) or not item.get("chapter_name", "").strip():
            errors.append(f"{prefix}.chapter_name: expected a non-empty string")
        elif isinstance(chapter, int) and not isinstance(chapter, bool):
            chapter_name = item["chapter_name"].strip()
            if chapter in chapter_names and chapter_names[chapter] != chapter_name:
                errors.append(f"{prefix}.chapter_name: conflicts with another name for chapter {chapter}")
            chapter_names[chapter] = chapter_name
        if not isinstance(item.get("question"), str) or not item.get("question", "").strip():
            errors.append(f"{prefix}.question: expected a non-empty string")
        critical = item.get("is_critical")
        if critical is not None and not isinstance(critical, bool):
            errors.append(f"{prefix}.is_critical: expected true, false, or null")
        image_name = item.get("image")
        if image_name is not None:
            if not isinstance(image_name, str) or Path(image_name).name != image_name:
                errors.append(f"{prefix}.image: expected null or a file basename")
            elif isinstance(question_id, int) and not isinstance(question_id, bool):
                expected = f"q_{question_id:03}.jpg"
                if image_name != expected:
                    errors.append(f"{prefix}.image: expected {expected!r} for source id {question_id}")
                else:
                    references[question_id] = image_name
        answers = item.get("answers")
        answer_keys = []
        if not isinstance(answers, list) or not answers:
            errors.append(f"{prefix}.answers: expected a non-empty array")
        else:
            for answer_index, answer in enumerate(answers):
                answer_prefix = f"{prefix}.answers[{answer_index}]"
                if not isinstance(answer, dict):
                    errors.append(f"{answer_prefix}: expected an object")
                    continue
                if set(answer) != {"key", "text"}:
                    errors.append(f"{answer_prefix}: expected exactly key and text fields")
                key = answer.get("key")
                if isinstance(key, bool) or not isinstance(key, int) or key <= 0:
                    errors.append(f"{answer_prefix}.key: expected a positive integer")
                elif key in answer_keys:
                    errors.append(f"{answer_prefix}.key: duplicate answer key {key}")
                else:
                    answer_keys.append(key)
                if not isinstance(answer.get("text"), str) or not answer.get("text", "").strip():
                    errors.append(f"{answer_prefix}.text: expected a non-empty string")
        correct = item.get("correct_answer")
        if isinstance(correct, bool) or not isinstance(correct, int) or correct not in answer_keys:
            errors.append(f"{prefix}.correct_answer: must match exactly one key in answers")
    if references and not archive_path and not images_dir:
        errors.append("$.image: images referenced by source require --images-archive or --images-dir")

    image_bytes = {}
    if references and archive_path:
        try:
            with zipfile.ZipFile(archive_path) as archive:
                for question_id, filename in references.items():
                    archive_name = f"images/{filename}"
                    try:
                        content = archive.read(archive_name)
                    except KeyError:
                        errors.append(f"question {question_id}.image: {archive_name} missing from archive")
                        continue
                    if not valid_jpeg(content):
                        errors.append(f"question {question_id}.image: {archive_name} is not a valid JPEG")
                    else:
                        image_bytes[question_id] = (filename, content)
        except (OSError, zipfile.BadZipFile) as exc:
            errors.append(f"images archive: cannot read archive ({exc})")
    elif references and images_dir:
        folder = Path(images_dir)
        for question_id, filename in references.items():
            path = folder / filename
            try:
                content = path.read_bytes()
            except OSError:
                errors.append(f"question {question_id}.image: {path} missing or unreadable")
                continue
            if not valid_jpeg(content):
                errors.append(f"question {question_id}.image: {path} is not a valid JPEG")
            else:
                image_bytes[question_id] = (filename, content)
    return image_bytes, errors


def valid_jpeg(content):
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
            return image.format == "JPEG"
    except (OSError, ValueError):
        return False


class Command(BaseCommand):
    help = "Validate and idempotently import the supplied question JSON source format."

    def add_arguments(self, parser):
        parser.add_argument("json_file", type=Path)
        parser.add_argument("--images-archive", type=Path)
        parser.add_argument("--images-dir", type=Path)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if options["images_archive"] and options["images_dir"]:
            raise CommandError("Choose only one of --images-archive or --images-dir.")
        path = options["json_file"]
        try:
            with path.open("r", encoding="utf-8-sig") as source:
                records = json.load(source)
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError(f"Cannot read UTF-8 JSON file {path}: {exc}") from exc

        image_bytes, errors = validate_source(
            records, options["images_archive"], options["images_dir"]
        )
        if errors:
            self.stdout.write(self.style.ERROR(f"Validation failed: {len(errors)} error(s); database unchanged."))
            for error in errors:
                self.stdout.write(f" - {error}")
            self.stdout.write("Report: added=0 updated=0 skipped=0 errors={}".format(len(errors)))
            raise CommandError("Question import aborted; database unchanged.")

        counts = {"added": 0, "updated": 0, "skipped": 0}
        existing = {
            question.question_number: question
            for question in Question.objects.filter(question_number__in=[row["id"] for row in records])
            .select_related("category").prefetch_related("answers")
        }
        category_values = {row["chapter"]: row["chapter_name"].strip() for row in records}
        for row in records:
            old = existing.get(row["id"])
            if old is None:
                counts["added"] += 1
            elif row_matches(
                old, row, category_values[row["chapter"]], path.name, image_bytes.get(row["id"])
            ):
                counts["skipped"] += 1
            else:
                counts["updated"] += 1
        if options["dry_run"]:
            self.stdout.write(self.style.SUCCESS(
                f"Dry run valid: {len(records)} source questions. "
                f"Report: added={counts['added']} updated={counts['updated']} skipped={counts['skipped']} errors=0"
            ))
            return

        with transaction.atomic():
            categories = {}
            for chapter, name in category_values.items():
                slug = f"chapter-{chapter}-{slugify(name)[:180]}"
                category, _ = QuestionCategory.objects.update_or_create(
                    source_chapter_number=chapter,
                    defaults={"name": name, "slug": slug, "order": chapter},
                )
                categories[chapter] = category
            for row in records:
                existing_question = existing.get(row["id"])
                image_path = None
                if row["id"] in image_bytes:
                    filename, content = image_bytes[row["id"]]
                    digest = hashlib.sha256(content).hexdigest()[:12]
                    stem = Path(filename).stem
                    storage_name = f"questions/{stem}-{digest}.jpg"
                    if not default_storage.exists(storage_name):
                        default_storage.save(storage_name, ContentFile(content))
                    image_path = storage_name
                question, _ = Question.objects.update_or_create(
                    question_number=row["id"],
                    defaults={
                        "category": categories[row["chapter"]],
                        "content": row["question"],
                        "image": image_path or None,
                        "is_critical": (
                            row["is_critical"]
                            if row["is_critical"] is not None or existing_question is None
                            else existing_question.is_critical
                        ),
                        "source": path.name,
                    },
                )
                source_labels = set()
                for order, answer in enumerate(row["answers"]):
                    label = str(answer["key"])
                    source_labels.add(label)
                    AnswerOption.objects.update_or_create(
                        question=question, label=label,
                        defaults={
                            "content": answer["text"],
                            "is_correct": answer["key"] == row["correct_answer"],
                            "order": order,
                        },
                    )
                question.answers.exclude(label__in=source_labels).delete()

        self.stdout.write(self.style.SUCCESS(
            f"Import complete ({len(records)} source rows). "
            f"Report: added={counts['added']} updated={counts['updated']} skipped={counts['skipped']} errors=0"
        ))


def row_matches(question, row, category_name, source_name, image_data):
    if question.content != row["question"] or (
        row["is_critical"] is not None and question.is_critical != row["is_critical"]
    ):
        return False
    if question.source != source_name:
        return False
    if not question.category or question.category.name != category_name:
        return False
    if row["image"] is None:
        if question.image:
            return False
    else:
        if not question.image or not image_data:
            return False
        filename, content = image_data
        digest = hashlib.sha256(content).hexdigest()[:12]
        expected_path = f"questions/{Path(filename).stem}-{digest}.jpg"
        if question.image.name != expected_path:
            return False
    current = {option.label: (option.content, option.is_correct, option.order) for option in question.answers.all()}
    expected = {
        str(answer["key"]): (answer["text"], answer["key"] == row["correct_answer"], index)
        for index, answer in enumerate(row["answers"])
    }
    return current == expected
