import base64
import logging

from django.contrib.auth import get_user_model
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django_otp.plugins.otp_totp.models import TOTPDevice

from .serializers import (
    UserLoginSerializer,
    UserRegistrationSerializer,
 
    DeviceSessionSerializer,
    TwoFactorCodeSerializer,
    UserEmailUpdateSerializer,
    UserPasswordChangeSerializer,
    UserPasswordRecoverySerializer,
    UserPasswordResetSerializer,
    UserProfileSerializer,
    VerificationCodeSerializer,
)
from ..services.emails import send_verification_code
from accounts.models import DeviceSession
from emails_manager.models import EmailVerificationCode

User = get_user_model()
security_logger = logging.getLogger("accounts.security")
REFRESH_COOKIE_NAME = getattr(settings, "JWT_REFRESH_COOKIE_NAME", "open_spots_refresh")
TWO_FACTOR_PENDING_SECONDS = int(getattr(settings, "TWO_FACTOR_PENDING_SECONDS", 300))


def _refresh_cookie_kwargs():
    refresh_lifetime = settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"]
    return {
        "max_age": int(refresh_lifetime.total_seconds()),
        "httponly": True,
        "secure": getattr(settings, "JWT_COOKIE_SECURE", not settings.DEBUG),
        "samesite": getattr(settings, "JWT_COOKIE_SAMESITE", "Lax"),
        "path": "/api/token/refresh/",
    }


def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(REFRESH_COOKIE_NAME, str(refresh_token), **_refresh_cookie_kwargs())


def _delete_refresh_cookie(response):
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path="/api/token/refresh/",
        samesite=getattr(settings, "JWT_COOKIE_SAMESITE", "Lax"),
    )


def _tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    device_session = getattr(user, "_current_device_session", None)
    if device_session:
        refresh["device_session_id"] = str(device_session.id)
    return {
        "refresh":  str(refresh),
        "access":   str(refresh.access_token),
    }


def _client_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _device_name(user_agent):
    if not user_agent:
        return "Unknown device"
    if "iPhone" in user_agent:
        return "iPhone"
    if "iPad" in user_agent:
        return "iPad"
    if "Android" in user_agent:
        return "Android device"
    if "Windows" in user_agent:
        return "Windows device"
    if "Macintosh" in user_agent or "Mac OS" in user_agent:
        return "Mac device"
    if "Linux" in user_agent:
        return "Linux device"
    return "Unknown device"


def _create_device_session(request, user):
    user_agent = request.META.get("HTTP_USER_AGENT", "")
    return DeviceSession.objects.create(
        user=user,
        device_name=_device_name(user_agent),
        user_agent=user_agent,
        ip_address=_client_ip(request),
    )


def _refresh_device_session(refresh):
    if not refresh:
        raise AuthenticationFailed("Refresh token is missing.")

    try:
        token = RefreshToken(refresh)
    except TokenError as exc:
        raise AuthenticationFailed("Invalid refresh token.") from exc

    device_session_id = token.payload.get("device_session_id")
    if not device_session_id:
        raise AuthenticationFailed("Refresh token is missing a device session.")

    try:
        device_session = DeviceSession.objects.select_related("user").get(id=device_session_id)
    except DeviceSession.DoesNotExist as exc:
        raise AuthenticationFailed("Device session was not found.") from exc

    if not device_session.is_active:
        raise AuthenticationFailed("Device session has been revoked.")

    return device_session


def _current_device_session_id(request):
    refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
    if not refresh:
        return None
    try:
        return RefreshToken(refresh).payload.get("device_session_id")
    except TokenError:
        return None


def _default_redirect_for_user(user):
    if getattr(user, "user_type", None) == "venue_admin":
        from venues.models import Venue

        venue = Venue.objects.filter(owner=user).first()
        if venue:
            return f"/venues/dashboard/{venue.id}/"
        return "/venues/apply-venue/"
    return "/"


def _latest_verification_code(user):
    return EmailVerificationCode.objects.filter(user=user).order_by("-created_at").first()


def _remaining_verification_seconds(code_obj):
    if not code_obj:
        return 0
    expires_at = code_obj.created_at + timezone.timedelta(minutes=10)
    return max(0, int((expires_at - timezone.now()).total_seconds()))


def _confirmed_totp_device(user):
    return TOTPDevice.objects.filter(user=user, confirmed=True).order_by("-id").first()


def _has_two_factor_enabled(user):
    return _confirmed_totp_device(user) is not None


def _begin_two_factor_login(request, user):
    request.session["pending_2fa_user_id"] = user.id
    request.session["pending_2fa_started_at"] = timezone.now().isoformat()


def _clear_two_factor_login(request):
    request.session.pop("pending_2fa_user_id", None)
    request.session.pop("pending_2fa_started_at", None)


def _pending_two_factor_user(request):
    user_id = request.session.get("pending_2fa_user_id")
    started_at = request.session.get("pending_2fa_started_at")
    if not user_id or not started_at:
        return None

    try:
        started = timezone.datetime.fromisoformat(started_at)
    except ValueError:
        _clear_two_factor_login(request)
        return None

    if timezone.is_naive(started):
        started = timezone.make_aware(started)

    if timezone.now() - started > timezone.timedelta(seconds=TWO_FACTOR_PENDING_SECONDS):
        _clear_two_factor_login(request)
        return None

    return User.objects.filter(id=user_id, is_active=True).first()


def _login_response_for_user(request, user):
    user._current_device_session = _create_device_session(request, user)
    tokens = _tokens_for_user(user)
    security_logger.info(
        "login_success user=%s device_session=%s ip=%s",
        user.pk,
        user._current_device_session.pk,
        _client_ip(request),
    )

    response = Response(
        {
            "access":       tokens["access"],
            "user":         UserProfileSerializer(user).data,
            "redirect_to":  _default_redirect_for_user(user),
        }
    )
    _set_refresh_cookie(response, tokens["refresh"])
    return response


def _totp_manual_key(device):
    return base64.b32encode(device.bin_key).decode("ascii").rstrip("=")


class LoginAPIView(generics.GenericAPIView):
    serializer_class   = UserLoginSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_login"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        is_google_user = user.socialaccount_set.filter(provider="google").exists()
        if not user.email_verified and not is_google_user:
            latest_code = _latest_verification_code(user)
            request.session["pending_user_id"]     = user.id
            request.session["code_already_sent"]   = _remaining_verification_seconds(latest_code) > 0
            request.session["verification_reason"] = "signup"
            return Response(
                {
                    "detail": "Please verify your email before continuing.",
                    "requires_verification": True,
                },
                status = status.HTTP_403_FORBIDDEN,
            )

        if _has_two_factor_enabled(user):
            _begin_two_factor_login(request, user)
            security_logger.info("login_2fa_required user=%s ip=%s", user.pk, _client_ip(request))
            return Response(
                {
                    "detail": "Enter the code from your authenticator app.",
                    "requires_2fa": True,
                },
                status=status.HTTP_202_ACCEPTED,
            )

        return _login_response_for_user(request, user)


class TwoFactorLoginVerifyAPIView(generics.GenericAPIView):
    serializer_class = TwoFactorCodeSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_2fa"

    def post(self, request, *args, **kwargs):
        user = _pending_two_factor_user(request)
        if not user:
            return Response(
                {"detail": "Two-factor login expired. Please log in again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device = _confirmed_totp_device(user)
        if not device or not device.verify_token(serializer.validated_data["code"]):
            return Response({"detail": "Invalid two-factor code."}, status=status.HTTP_400_BAD_REQUEST)

        _clear_two_factor_login(request)
        return _login_response_for_user(request, user)


class CookieTokenRefreshAPIView(generics.GenericAPIView):
    serializer_class = TokenRefreshSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_refresh"

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        device_session = _refresh_device_session(refresh)
        serializer = self.get_serializer(data={"refresh": refresh})
        serializer.is_valid(raise_exception=True)

        response = Response({"access": serializer.validated_data["access"]})
        rotated_refresh = serializer.validated_data.get("refresh")
        if rotated_refresh:
            rotated_token = RefreshToken(rotated_refresh)
            rotated_token["device_session_id"] = str(device_session.id)
            rotated_refresh = str(rotated_token)
            _set_refresh_cookie(response, rotated_refresh)
        device_session.ip_address = _client_ip(request)
        device_session.user_agent = request.META.get("HTTP_USER_AGENT", "")
        device_session.device_name = _device_name(device_session.user_agent)
        device_session.last_refresh_at = timezone.now()
        device_session.save(update_fields=["ip_address", "user_agent", "device_name", "last_refresh_at", "last_seen_at"])
        security_logger.info(
            "token_refresh user=%s device_session=%s ip=%s",
            device_session.user_id,
            device_session.pk,
            _client_ip(request),
        )
        return response


class LogoutAPIView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if refresh:
            try:
                device_session = _refresh_device_session(refresh)
                device_session.revoked_at = timezone.now()
                device_session.save(update_fields=["revoked_at", "last_seen_at"])
                security_logger.info(
                    "logout user=%s device_session=%s ip=%s",
                    device_session.user_id,
                    device_session.pk,
                    _client_ip(request),
                )
            except AuthenticationFailed:
                pass
        response = Response({"detail": "Logged out."})
        _delete_refresh_cookie(response)
        return response


class DeviceSessionListAPIView(generics.ListAPIView):
    serializer_class = DeviceSessionSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_device"

    def get_queryset(self):
        return DeviceSession.objects.filter(user=self.request.user)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["current_device_session_id"] = _current_device_session_id(self.request)
        return context


class DeviceSessionRevokeAPIView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_device"

    def post(self, request, pk, *args, **kwargs):
        device_session = get_object_or_404(DeviceSession, pk=pk, user=request.user)
        if device_session.revoked_at is None:
            device_session.revoked_at = timezone.now()
            device_session.save(update_fields=["revoked_at", "last_seen_at"])
            security_logger.warning(
                "device_session_revoked user=%s device_session=%s ip=%s",
                request.user.pk,
                device_session.pk,
                _client_ip(request),
            )
        return Response({"detail": "Device session revoked."})


class TwoFactorStatusAPIView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        device = _confirmed_totp_device(request.user)
        return Response({
            "enabled": bool(device),
            "confirmed_at": getattr(device, "confirmed_at", None),
        })


class TwoFactorSetupAPIView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_2fa"

    def post(self, request, *args, **kwargs):
        TOTPDevice.objects.filter(user=request.user, confirmed=False).delete()
        device = TOTPDevice.objects.create(user=request.user, name="default", confirmed=False)
        return Response({
            "detail": "Scan this authenticator URL and confirm with a generated code.",
            "otp_auth_url": device.config_url,
            "manual_key": _totp_manual_key(device),
            "device_id": device.id,
        })


class TwoFactorConfirmAPIView(generics.GenericAPIView):
    serializer_class = TwoFactorCodeSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_2fa"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        device = TOTPDevice.objects.filter(user=request.user, confirmed=False).order_by("-id").first()
        if not device:
            return Response({"detail": "No pending two-factor setup found."}, status=status.HTTP_400_BAD_REQUEST)

        if not device.verify_token(serializer.validated_data["code"]):
            return Response({"detail": "Invalid two-factor code."}, status=status.HTTP_400_BAD_REQUEST)

        device.confirmed = True
        if hasattr(device, "confirmed_at"):
            device.confirmed_at = timezone.now()
            device.save(update_fields=["confirmed", "confirmed_at"])
        else:
            device.save(update_fields=["confirmed"])
        TOTPDevice.objects.filter(user=request.user, confirmed=True).exclude(pk=device.pk).delete()
        security_logger.warning("two_factor_enabled user=%s ip=%s", request.user.pk, _client_ip(request))
        return Response({"detail": "Two-factor authentication enabled.", "enabled": True})


class TwoFactorDisableAPIView(generics.GenericAPIView):
    serializer_class = TwoFactorCodeSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_2fa"

    def post(self, request, *args, **kwargs):
        device = _confirmed_totp_device(request.user)
        if not device:
            return Response({"detail": "Two-factor authentication is not enabled.", "enabled": False})

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not device.verify_token(serializer.validated_data["code"]):
            return Response({"detail": "Invalid two-factor code."}, status=status.HTTP_400_BAD_REQUEST)

        TOTPDevice.objects.filter(user=request.user).delete()
        security_logger.warning("two_factor_disabled user=%s ip=%s", request.user.pk, _client_ip(request))
        return Response({"detail": "Two-factor authentication disabled.", "enabled": False})


class RegisterAPIView(generics.CreateAPIView):
    serializer_class    = UserRegistrationSerializer
    authentication_classes = []
    permission_classes  = [permissions.AllowAny]
    throttle_scope = "auth_register"

    def get_pending_signup_user(self, request):
        pending_user_id = request.session.get("pending_user_id")
        verification_reason = request.session.get("verification_reason")

        if not pending_user_id or verification_reason != "signup":
            return None

        return User.objects.filter(id=pending_user_id, email_verified=False).first()

    def clear_pending_signup(self, request):
        pending_user = self.get_pending_signup_user(request)
        if pending_user:
            pending_user.delete()

        request.session.pop("pending_user_id", None)
        request.session.pop("verification_reason", None)
        request.session.pop("code_already_sent", None)

    def perform_create(self, serializer):
        user = serializer.save()

        send_verification_code(user)
        security_logger.info("register_started user=%s ip=%s", user.pk, _client_ip(self.request))
        
        self.request.session["pending_user_id"] = user.id
        self.request.session["verification_reason"] = "signup"
        self.request.session["code_already_sent"] = True

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            pending_user = self.get_pending_signup_user(request)
            requested_username = str(request.data.get("username", "")).strip()
            requested_email = str(request.data.get("email", "")).strip().lower()
            pending_email = (pending_user.email or "").strip().lower() if pending_user else ""

            if pending_user and (requested_username == pending_user.username or requested_email == pending_email):
                self.clear_pending_signup(request)
                serializer = self.get_serializer(data=request.data)

            serializer.is_valid(raise_exception=True)
        else:
            self.clear_pending_signup(request)

        self.perform_create(serializer)
        user = serializer.instance
        return Response(
            {
                "detail": "Account created. Please check your email for the verification code.",
                "requires_verification": True,
                "user": UserProfileSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )

    def post(self, request, *args, **kwargs):
        return self.create(request, *args, **kwargs)















class ProfileAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    def patch(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)


class EmailUpdateAPIView(generics.UpdateAPIView):
    serializer_class = UserEmailUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def perform_update(self, serializer):
        user = serializer.save()
        send_verification_code(user)
        self.request.session["pending_user_id"] = user.id
        self.request.session["verification_reason"] = "email_update"
        self.request.session["code_already_sent"] = True

    def post(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)


class PasswordChangeRequestAPIView(generics.GenericAPIView):
    serializer_class = UserPasswordChangeSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "auth_password"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        serializer.save()
        send_verification_code(user)
        security_logger.warning("password_change_requested user=%s ip=%s", user.pk, _client_ip(request))
        request.session["pending_user_id"] = user.id
        request.session["verification_reason"] = "password_change"
        request.session["code_already_sent"] = True
        return Response({"detail": "Verification code sent. Confirm the code to complete the password change."})


class PasswordRecoveryRequestAPIView(generics.GenericAPIView):
    serializer_class = UserPasswordRecoverySerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_password"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user:
            send_verification_code(user)
            request.session["pending_user_id"] = user.id
            request.session["verification_reason"] = "password_recovery"
            request.session["code_already_sent"] = True
        security_logger.warning(
            "password_recovery_requested matched_user=%s ip=%s",
            bool(user),
            _client_ip(request),
        )
        return Response({"detail": "If the email exists, a verification code has been sent."})


class PasswordResetAPIView(generics.GenericAPIView):
    serializer_class = UserPasswordResetSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_password"

    def get_pending_user(self):
        user_id = self.request.session.get("pending_user_id")
        if not user_id or not self.request.session.get("password_recovery_verified"):
            return None
        return get_object_or_404(User, id=user_id)

    def post(self, request, *args, **kwargs):
        user = self.get_pending_user()
        if not user:
            return Response({"detail": "Invalid or expired password recovery session."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user)
        security_logger.warning("password_reset_completed user=%s ip=%s", user.pk, _client_ip(request))
        request.session.pop("pending_user_id", None)
        request.session.pop("verification_reason", None)
        request.session.pop("code_already_sent", None)
        request.session.pop("password_recovery_verified", None)
        return Response({"detail": "Password reset successful."})


class ResendVerificationAPIView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_verification"

    def post(self, request, *args, **kwargs):
        user_id = request.session.get("pending_user_id")
        reason = request.session.get("verification_reason")
        if not user_id or not reason:
            return Response({"detail": "No pending verification in session."}, status=status.HTTP_400_BAD_REQUEST)

        user = get_object_or_404(User, id=user_id)
        EmailVerificationCode.objects.filter(user=user).delete()
        send_verification_code(user)
        request.session["code_already_sent"] = True
        latest_code = _latest_verification_code(user)
        return Response(
            {
                "detail": "Verification code resent.",
                "remaining_seconds": _remaining_verification_seconds(latest_code),
            }
        )


class VerificationStatusAPIView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_verification"

    def get(self, request, *args, **kwargs):
        user_id = request.session.get("pending_user_id")
        reason = request.session.get("verification_reason")
        if not user_id or not reason:
            return Response({"detail": "No pending verification in session."}, status=status.HTTP_400_BAD_REQUEST)

        user = get_object_or_404(User, id=user_id)
        latest_code = _latest_verification_code(user)
        remaining = _remaining_verification_seconds(latest_code)

        if not latest_code or remaining <= 0:
            EmailVerificationCode.objects.filter(user=user).delete()
            send_verification_code(user)
            latest_code = _latest_verification_code(user)
            remaining = _remaining_verification_seconds(latest_code)
            request.session["code_already_sent"] = True
        elif not request.session.get("code_already_sent"):
            request.session["code_already_sent"] = True

        return Response(
            {
                "reason": reason,
                "email": user.unverified_email or user.email,
                "remaining_seconds": remaining,
                "is_expired": remaining <= 0,
            }
        )


class ConfirmVerificationAPIView(generics.GenericAPIView):
    serializer_class = VerificationCodeSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_verification"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = request.session.get("pending_user_id")
        reason = request.session.get("verification_reason")
        if not user_id or not reason:
            return Response({"detail": "No pending verification in session."}, status=status.HTTP_400_BAD_REQUEST)

        user = get_object_or_404(User, id=user_id)

        try:
            code_obj = EmailVerificationCode.objects.get(user=user, code=serializer.validated_data["code"].strip())
        except EmailVerificationCode.DoesNotExist:
            return Response({"detail": "Invalid verification code."}, status=status.HTTP_400_BAD_REQUEST)

        if code_obj.is_expired():
            code_obj.delete()
            return Response({"detail": "Verification code expired. Please request a new one."}, status=status.HTTP_400_BAD_REQUEST)

        code_obj.delete()

        if reason in ["signup", "email_update"]:
            user.email = user.unverified_email or user.email
            user.unverified_email = ""
            user.email_verified = True
            user.save(update_fields=["email", "unverified_email", "email_verified"])
            security_logger.info("email_verified user=%s reason=%s ip=%s", user.pk, reason, _client_ip(request))
            request.session.pop("pending_user_id", None)
            request.session.pop("verification_reason", None)
            request.session.pop("code_already_sent", None)
            user._current_device_session = _create_device_session(request, user)
            tokens = _tokens_for_user(user)
            request.session["jwt_access"] = tokens["access"]
            request.session["jwt_refresh"] = tokens["refresh"]
            response = Response(
                {
                    "detail": "Email verified successfully.",
                    "access": tokens["access"],
                    "user": UserProfileSerializer(user).data,
                    "redirect_to": _default_redirect_for_user(user),
                }
            )
            _set_refresh_cookie(response, tokens["refresh"])
            return response

        if reason == "password_recovery":
            request.session["password_recovery_verified"] = True
            return Response({"detail": "Verification successful. You may now reset your password."})

        if reason == "password_change":
            user.email = user.unverified_email or user.email
            user.unverified_email = ""
            user.email_verified = True
            user.save(update_fields=["email", "unverified_email", "email_verified"])
            request.session.pop("pending_user_id", None)
            request.session.pop("verification_reason", None)
            request.session.pop("code_already_sent", None)
            return Response({"detail": "Password change verified and email confirmed."})

        return Response({"detail": "Unsupported verification flow."}, status=status.HTTP_400_BAD_REQUEST)
