from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from accounts.models import VerificationChallenge


class Command(BaseCommand):
    help = "Remove expired or closed verification challenges and their sensitive payloads."

    def handle(self, *args, **options):
        count, _ = VerificationChallenge.objects.filter(
            Q(expires_at__lte=timezone.now()) | Q(closed_at__isnull=False)
        ).delete()
        self.stdout.write(f"Removed {count} verification challenges.")
