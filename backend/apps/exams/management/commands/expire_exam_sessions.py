from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.exams.models import ExamSession
from apps.exams.services import finalize_session


class Command(BaseCommand):
    help = "Auto-submit all exam sessions whose server-side deadline has passed."

    def handle(self, *args, **options):
        expired = ExamSession.objects.filter(
            status=ExamSession.Status.IN_PROGRESS, expires_at__lte=timezone.now()
        ).values_list("pk", "user_id")
        finalized = 0
        for session_id, user_id in expired.iterator():
            _, result = finalize_session(session_id, user_id, expired=True)
            if result:
                finalized += 1
        self.stdout.write(self.style.SUCCESS(f"Auto-submitted {finalized} expired exam session(s)."))
