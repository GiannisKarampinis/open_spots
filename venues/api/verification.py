"""Venue application verification, independent of the legacy Django form session."""
from accounts.models import VerificationReason
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework import generics, permissions, serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from accounts.api.verification import PublicChallengeView, ConfirmVerificationAPIView
from accounts.services.challenges import (
    begin_challenge, challenge_id, challenge_status, close_challenge,
    fingerprint, get_challenge, send_challenge_code,
)
from venues.services.emails import send_new_venue_application_email
from openspots.security import CsrfProtectedAPIViewMixin
from .serializers import VenueApplicationSerializer, VenueEmailSerializer, VenueVerificationCodeSerializer


class VenueSendEmailThrottle(SimpleRateThrottle):
    scope = "venue_verification_send_email"

    def get_cache_key(self, request, view):
        email = str(request.data.get("email", "")).strip().lower()
        return self.cache_format % {"scope": self.scope, "ident": fingerprint(email)}


class VenueSendIPThrottle(SimpleRateThrottle):
    scope = "venue_verification_send_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class VenueVerificationSendAPIView(PublicChallengeView):
    serializer_class = VenueEmailSerializer
    throttle_classes = [VenueSendEmailThrottle, VenueSendIPThrottle]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        if challenge_id(request):
            challenge = get_challenge(request, lock=True)
            if challenge.reason != VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY or challenge.email != email:
                return Response({"detail": "The challenge must match the venue email."}, status=400)
            if challenge.verified_at:
                return Response({"detail": "Email verification already completed."}, status=400)
            if challenge.locked_until and challenge.locked_until > timezone.now():
                return Response({"detail": "Too many attempts. Try again later."}, status=429)
            cooldown = challenge_status(challenge)["resend_after_seconds"]
            if cooldown:
                return Response({"detail": "Please wait before requesting another code.", "retry_after": cooldown}, status=429)
            send_challenge_code(challenge)
        else:
            challenge = begin_challenge(None, VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY, email)
        return Response({"detail": "Code sent.", **challenge_status(challenge)})


class VenueVerificationConfirmAPIView(ConfirmVerificationAPIView):
    serializer_class = VenueVerificationCodeSerializer
    allowed_reasons = (VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY,)


class VenueApplicationCreateAPIView(CsrfProtectedAPIViewMixin, generics.CreateAPIView):
    serializer_class = VenueApplicationSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        try:
            challenge = get_challenge(self.request, lock=True)
        except ValidationError:
            raise serializers.ValidationError({
                "verification_required": True,
                "admin_email": "Verify this email before submitting the application.",
            })
        email = serializer.validated_data["admin_email"].strip().lower()
        token = self.request.data.get("verification_token", "")
        if (challenge.reason != VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY or not challenge.verified_at
                or challenge.email != email or not isinstance(token, str) or not token
                or not constant_time_compare(challenge.completion_token_hash, fingerprint(token))):
            raise serializers.ValidationError({
                "verification_required": True,
                "admin_email": "Verify this email before submitting the application.",
            })
        application = serializer.save()
        close_challenge(challenge)
        transaction.on_commit(lambda: send_new_venue_application_email(application))

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        return self.create(request, *args, **kwargs)
