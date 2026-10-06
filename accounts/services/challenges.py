"""Database-backed verification lifecycle, shared by API and HTML views."""
from accounts.models import VerificationReason
import hashlib
import math
import secrets
import uuid
import logging

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from accounts.models import CustomUser, VerificationChallenge
from emails_manager.utils import send_email_with_template


class PendingVerification(APIException):
    status_code = 409
    default_detail = "Another verification is pending. Finish or cancel it before starting a new one."


class DeliveryFailed(APIException):
    status_code = 503
    default_detail = "Could not send the verification code. Please try again."


def fingerprint(value):
    return hashlib.sha256(value.encode()).hexdigest()


def challenge_id(request):
    value = request.META.get("HTTP_X_VERIFICATION_CHALLENGE")
    if not value:
        value = getattr(request, "data", request.POST).get("challenge_id")
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def get_challenge(request, *, lock=False):
    identifier = challenge_id(request)
    if lock and identifier:
        user_id = VerificationChallenge.objects.filter(pk=identifier).values_list("user_id", flat=True).first()
        if user_id:
            # Use the same user-then-challenge lock order as creation.
            CustomUser.objects.select_for_update().get(pk=user_id)
    challenge = (VerificationChallenge.objects.select_for_update() if lock else VerificationChallenge.objects).filter(
        pk=identifier, closed_at__isnull=True,
    ).first() if identifier else None
    if not challenge or challenge.expires_at <= timezone.now():
        raise ValidationError({
            "detail": "Invalid or expired verification challenge. Please start again.",
            "code": "verification_challenge_expired",
        })
    return challenge


def challenge_status(challenge):
    now         = timezone.now()
    remaining   = max(0, int((min(challenge.code_expires_at, challenge.expires_at) - now).total_seconds()))
    cooldown    = 45 if challenge.reason == VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY else int(getattr(settings, "VERIFICATION_RESEND_COOLDOWN_SECONDS", 60))
    return {
        "challenge_id":         str(challenge.id),
        "pending":              True,
        "reason":               challenge.reason,
        "email":                challenge.email,
        "remaining_seconds":    remaining,
        "is_expired":           remaining <= 0,
        "resend_after_seconds": max(0, math.ceil((challenge.last_sent_at + timezone.timedelta(seconds=cooldown) - now).total_seconds())),
        "verified":             challenge.verified_at is not None,
    }


def send_challenge_code(challenge):
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge.code_hash = make_password(code)
    challenge.last_sent_at = timezone.now()
    challenge.code_expires_at = min(challenge.expires_at, challenge.last_sent_at + timezone.timedelta(minutes=10))
    if challenge.reason == VerificationReason.PASSWORD_RECOVERY:
        from accounts.tasks import deliver_recovery_code
        challenge.save()
        identifier, expected_hash = str(challenge.pk), challenge.code_hash

        def enqueue():
            try:
                deliver_recovery_code.apply_async(
                    args=[identifier, code, expected_hash],
                    argsrepr="(<challenge>, <redacted>, <redacted>)",
                    expires=challenge.code_expires_at,
                )
            except Exception:
                logging.getLogger(__name__).error("Recovery email enqueue failed", exc_info=False)
                VerificationChallenge.objects.filter(pk=identifier, code_hash=expected_hash).update(
                    closed_at=timezone.now(), payload={}, code_hash="", completion_token_hash="",
                )

        # Queue decoys too; broker use must not disclose account existence.
        transaction.on_commit(enqueue)
        return
    # Decoy recovery challenges keep responses identical for unknown/busy accounts.
    if challenge.user_id or challenge.reason == VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY:
        try:
            send_email_with_template(
                subject="Your OpenSpots Verification Code", recipient=challenge.email,
                template_base="verification_code",
                context={"title": "Verify your email", "intro": "Enter this code in the browser where you started verification.",
                         "code": code, "verify_url": None},
                async_send=False,
            )
        except Exception as exc:
            raise DeliveryFailed() from exc
    challenge.save()


@transaction.atomic
def begin_challenge(user, reason, email, *, payload=None, existing_id=None, resume=False):
    now = timezone.now()
    if user:
        # Serialize creation on the user, including when no challenge exists yet.
        original_password = user.password
        user = CustomUser.objects.select_for_update().get(pk=user.pk)
        if user.password != original_password:
            raise ValidationError({"detail": "The account changed. Please start again."})
        VerificationChallenge.objects.filter(user=user, closed_at__isnull=True, expires_at__lte=now).update(
            closed_at=now, payload={}, code_hash="", completion_token_hash="",
        )
        active = VerificationChallenge.objects.filter(user=user, closed_at__isnull=True).first()
        if active:
            if (resume or str(active.id) == str(existing_id)) and active.reason == reason and active.email == email and not active.verified_at:
                active._code_sent = False
                return active
            raise PendingVerification()
    duration = int(getattr(settings, "PASSWORD_CHANGE_PENDING_SECONDS", 600)) if reason == VerificationReason.PASSWORD_CHANGE else 1800
    pending = dict(payload or {})
    if user:
        pending["password_fingerprint"] = fingerprint(user.password)
        pending["original_email"] = user.email
    challenge = VerificationChallenge(
        user=user, reason=reason, email=email, payload=pending,
        expires_at=now + timezone.timedelta(seconds=duration),
        code_expires_at=now, last_sent_at=now,
    )
    send_challenge_code(challenge)
    challenge._code_sent = True
    return challenge


def close_challenge(challenge):
    challenge.closed_at = timezone.now()
    challenge.payload = {}
    challenge.code_hash = ""
    challenge.completion_token_hash = ""
    challenge.save()
