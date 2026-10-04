from celery import shared_task
from django.core.management import call_command


@shared_task
def purge_verification_challenges():
    call_command("purge_verification_challenges")


@shared_task(bind=True, max_retries=3)
def deliver_recovery_code(self, identifier, code, expected_hash):
    from django.db import transaction
    from django.utils import timezone
    from accounts.models import VerificationChallenge, VerificationReason
    from accounts.services.challenges import send_email_with_template, close_challenge

    with transaction.atomic():
        challenge = VerificationChallenge.objects.select_for_update().filter(
            pk=identifier, reason=VerificationReason.PASSWORD_RECOVERY,
            closed_at__isnull=True, verified_at__isnull=True, code_hash=expected_hash,
            expires_at__gt=timezone.now(), code_expires_at__gt=timezone.now(),
        ).first()
        if not challenge or not challenge.user_id:
            return
        try:
            send_email_with_template(
                subject="Your OpenSpots Verification Code", recipient=challenge.email,
                template_base="verification_code",
                context={"title": "Verify your email", "intro": "Enter this code in the browser where you started verification.",
                         "code": code, "verify_url": None}, async_send=False,
            )
        except Exception as exc:
            if self.request.retries >= self.max_retries:
                close_challenge(challenge)
                return
            raise self.retry(exc=exc, countdown=15 * (2 ** self.request.retries))
