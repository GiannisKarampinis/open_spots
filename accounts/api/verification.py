"""Account verification endpoints. No verification state is stored in Django sessions."""
from accounts.models import VerificationReason
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from accounts.services.challenges import (
    begin_challenge, challenge_id, challenge_status, close_challenge,
    fingerprint, get_challenge, PendingVerification, DeliveryFailed, send_challenge_code,
)
from openspots.security import CsrfProtectedAPIViewMixin
from .serializers import (
    UserRegistrationSerializer, UserProfileSerializer, UserNavigationSerializer, UserEmailUpdateSerializer,
    UserPasswordChangeSerializer, UserPasswordRecoverySerializer, UserPasswordResetSerializer,
    VerificationCodeSerializer,
)
from .throttles import VerificationResendIPThrottle, VerificationResendUserThrottle
from accounts.models import VerificationChallenge

User = get_user_model()


class PublicChallengeView(CsrfProtectedAPIViewMixin, generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_verification"

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response


class RegisterAPIView(PublicChallengeView):
    serializer_class = UserRegistrationSerializer
    throttle_scope = "auth_register"

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        challenge = begin_challenge(user, VerificationReason.SIGNUP, user.email)
        return Response({
            "detail": "Account created. Please check your email for the verification code.",
            "requires_verification": True, "challenge_id": str(challenge.id),
            "user": UserNavigationSerializer(user).data,
        }, status=status.HTTP_201_CREATED)


class EmailUpdateAPIView(generics.GenericAPIView):
    serializer_class = UserEmailUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_verification"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = begin_challenge(
            request.user, VerificationReason.EMAIL_UPDATE, serializer.validated_data["email"],
            existing_id=challenge_id(request),
            resume=True,
        )
        code_sent = challenge._code_sent
        return Response({
            "detail": "Verification code sent to your new email." if code_sent else "Email verification is already pending.",
            "code_sent": code_sent,
            "requires_verification": True, **challenge_status(challenge),
        })


class PasswordChangeRequestAPIView(generics.GenericAPIView):
    serializer_class = UserPasswordChangeSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_password"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = begin_challenge(
            request.user, VerificationReason.PASSWORD_CHANGE, request.user.email,
            payload={"password_hash": make_password(serializer.validated_data["new_password1"])},
        )
        return Response({
            "detail": "Verification code sent. Confirm the code to complete the password change.",
            "requires_verification": True, "challenge_id": str(challenge.id),
        })


class PasswordRecoveryRequestAPIView(PublicChallengeView):
    serializer_class = UserPasswordRecoverySerializer
    throttle_scope = "auth_password"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        try:
            challenge = begin_challenge(user, VerificationReason.PASSWORD_RECOVERY, email)
        except (PendingVerification, DeliveryFailed):
            # Keep recovery responses uniform even when delivery fails. A failed
            # real challenge was rolled back, so the account can retry immediately.
            challenge = begin_challenge(None, VerificationReason.PASSWORD_RECOVERY, email)
        return Response({
            "detail": "If the email exists, a verification code has been sent.",
            "challenge_id": str(challenge.id),
        })


class VerificationStatusAPIView(PublicChallengeView):
    def get(self, request, *args, **kwargs):
        return Response(challenge_status(get_challenge(request)))


class CurrentVerificationAPIView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        challenge = VerificationChallenge.objects.filter(
            user=request.user,
            closed_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).exclude(reason=VerificationReason.TWO_FACTOR_LOGIN).first()
        response = Response(challenge_status(challenge) if challenge else {"pending": False})
        response["Cache-Control"] = "no-store" # Prevents caching of sensitive verification state.
        return response


class CancelVerificationAPIView(PublicChallengeView):
    @transaction.atomic
    def post(self, request, *args, **kwargs):
        close_challenge(get_challenge(request, lock=True))
        return Response({"detail": "Verification cancelled."})


class ResendVerificationAPIView(PublicChallengeView):
    throttle_classes = [VerificationResendIPThrottle, VerificationResendUserThrottle]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        challenge = get_challenge(request, lock=True)
        if challenge.reason not in (VerificationReason.SIGNUP, VerificationReason.EMAIL_UPDATE, VerificationReason.PASSWORD_CHANGE, VerificationReason.PASSWORD_RECOVERY):
            return Response({"detail": "This challenge uses a different verification endpoint."}, status=400)
        if challenge.verified_at:
            return Response({"detail": "Verification already completed."}, status=400)
        if challenge.locked_until and challenge.locked_until > timezone.now():
            return Response({"detail": "Too many verification attempts. Try again later."}, status=429)
        cooldown = challenge_status(challenge)["resend_after_seconds"]
        if cooldown:
            return Response({"detail": f"Please wait {cooldown} seconds before requesting another code.", "retry_after": cooldown}, status=429)
        send_challenge_code(challenge)
        return Response({"detail": "Verification code resent.", **challenge_status(challenge)})


def challenge_user(challenge):
    if not challenge.user_id:
        return None
    user = User.objects.select_for_update().get(pk=challenge.user_id)
    if (not user.is_active
            or challenge.payload.get("password_fingerprint") != fingerprint(user.password)
            or challenge.payload.get("original_email") != user.email):
        return None
    return user


class ConfirmVerificationAPIView(PublicChallengeView):
    serializer_class = VerificationCodeSerializer
    allowed_reasons = (VerificationReason.SIGNUP, VerificationReason.EMAIL_UPDATE, VerificationReason.PASSWORD_CHANGE, VerificationReason.PASSWORD_RECOVERY)

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        from .views import _login_response_for_user, _revoke_all_user_sessions, _delete_refresh_cookie
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = get_challenge(request, lock=True)
        if challenge.reason not in self.allowed_reasons:
            return Response({"detail": "This challenge is for a different verification flow."}, status=400)
        now = timezone.now()
        if challenge.verified_at:
            return Response({"detail": "Verification already completed."}, status=400)
        if challenge.locked_until and challenge.locked_until > now:
            return Response({"detail": "Too many verification attempts. Try again later."}, status=429)
        if challenge.code_expires_at <= now:
            return Response({"detail": "Verification code expired. Please request a new one."}, status=400)
        if challenge.locked_until:
            challenge.attempts = 0
            challenge.locked_until = None
        if not check_password(serializer.validated_data["code"].strip(), challenge.code_hash) or (not challenge.user_id and challenge.reason != VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY):
            challenge.attempts += 1
            locked = challenge.attempts >= int(getattr(settings, "VERIFICATION_MAX_ATTEMPTS", 5))
            if locked:
                challenge.locked_until = now + timezone.timedelta(seconds=int(getattr(settings, "VERIFICATION_LOCK_SECONDS", 600)))
            challenge.save()
            return Response({"detail": "Too many verification attempts. Try again later." if locked else "Invalid verification code."}, status=429 if locked else 400)
        if challenge.reason == VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY:
            proof = secrets.token_urlsafe(32)
            challenge.verified_at = now
            challenge.code_hash = ""
            challenge.completion_token_hash = fingerprint(proof)
            challenge.save()
            return Response({"detail": "Email verified.", "verification_token": proof, "email": challenge.email})
        user = challenge_user(challenge)
        if not user:
            close_challenge(challenge)
            return Response({"detail": "The account changed. Please start verification again."}, status=400)
        if challenge.reason in (VerificationReason.SIGNUP, VerificationReason.EMAIL_UPDATE):
            if User.objects.filter(email__iexact=challenge.email).exclude(pk=user.pk).exists():
                return Response({"detail": "An account with this email already exists."}, status=400)
            user.email = challenge.email
            user.unverified_email = ""
            user.email_verified = True
            user.save(update_fields=["email", "unverified_email", "email_verified"])
            close_challenge(challenge)
            # Respect 2FA for signup; email verification must not bypass it.
            from .views import _has_two_factor_enabled
            if _has_two_factor_enabled(user):
                payload = {"detail": "Email verified successfully. Please log in.", "user": UserNavigationSerializer(user).data, "redirect_to": "/accounts/login"}
                if challenge.reason == VerificationReason.EMAIL_UPDATE:
                    payload["profile"] = UserProfileSerializer(user).data
                return Response(payload)
            response = _login_response_for_user(request, user)
            if challenge.reason == VerificationReason.EMAIL_UPDATE:
                response.data["profile"] = UserProfileSerializer(user).data
            response.data["detail"] = "Email verified successfully."
            return response
        if challenge.reason == VerificationReason.PASSWORD_CHANGE:
            user.password = challenge.payload["password_hash"]
            user.save(update_fields=["password"])
            close_challenge(challenge)
            _revoke_all_user_sessions(user)
            response = Response({"detail": "Password changed successfully. Please log in again.", "session_invalidated": True, "redirect_to": "/accounts/login"})
            _delete_refresh_cookie(response)
            return response
        if challenge.reason == VerificationReason.PASSWORD_RECOVERY:
            reset_token = secrets.token_urlsafe(32)
            challenge.verified_at = now
            challenge.code_hash = ""
            challenge.completion_token_hash = fingerprint(reset_token)
            challenge.expires_at = min(challenge.expires_at, now + timezone.timedelta(minutes=10))
            challenge.save()
            return Response({"detail": "Verification successful. You may now reset your password.", "reset_token": reset_token})
        return Response({"detail": "Unsupported verification flow."}, status=400)


class PasswordResetAPIView(PublicChallengeView):
    serializer_class = UserPasswordResetSerializer
    throttle_scope = "auth_password"

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        from .views import _revoke_all_user_sessions, _delete_refresh_cookie
        challenge = get_challenge(request, lock=True)
        token = request.data.get("reset_token", "")
        if (challenge.reason != VerificationReason.PASSWORD_RECOVERY or not challenge.verified_at
                or not isinstance(token, str) or not token
                or not constant_time_compare(challenge.completion_token_hash, fingerprint(token))):
            return Response({"detail": "Invalid or expired password recovery authorization."}, status=400)
        user = challenge_user(challenge)
        if not user:
            close_challenge(challenge)
            return Response({"detail": "The account changed. Please start verification again."}, status=400)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user)
        close_challenge(challenge)
        _revoke_all_user_sessions(user)
        response = Response({"detail": "Password reset successful."})
        _delete_refresh_cookie(response)
        return response
