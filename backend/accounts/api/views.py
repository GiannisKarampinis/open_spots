from accounts.models import VerificationReason
import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .serializers import (
    DeviceSessionSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    UserNavigationSerializer,
)
from ..services.challenges import begin_challenge, get_challenge, close_challenge
from accounts.models import DeviceSession
from openspots.security import CsrfProtectedAPIViewMixin

User = get_user_model()
security_logger = logging.getLogger("accounts.security")
REFRESH_COOKIE_NAME = getattr(settings, "JWT_REFRESH_COOKIE_NAME", "open_spots_refresh")


def _default_redirect_for_user(user):
    if getattr(user, "user_type", None) == "venue_admin":
        from venues.models import Venue

        venue = Venue.objects.filter(owner=user).first()
        if venue:
            return f"/venues/dashboard/{venue.id}/"
        return "/venues/apply-venue/"
    return "/"


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
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }


def _revoke_all_user_sessions(user):
    now = timezone.now()
    DeviceSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=now)
    outstanding_tokens = OutstandingToken.objects.filter(user=user)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in outstanding_tokens],
        ignore_conflicts=True,
    )


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


@transaction.atomic
def _login_response_for_user(request, user):
    locked_user = User.objects.select_for_update().get(pk=user.pk)
    if not locked_user.is_active or locked_user.password != user.password:
        raise AuthenticationFailed("The account changed. Please log in again.")
    user = locked_user
    auth = getattr(request, "auth", None)
    if auth and not DeviceSession.objects.filter(
        pk=auth.get("device_session_id"), user=user, revoked_at__isnull=True,
    ).exists():
        raise AuthenticationFailed("Device session has been revoked. Please log in again.")
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
            "access": tokens["access"],
            "user": UserNavigationSerializer(user).data,
            "redirect_to": _default_redirect_for_user(user),
        }
    )
    # Server-side HTML adapters need a stable identity; this is not response data.
    response._authenticated_user_id = user.pk
    _set_refresh_cookie(response, tokens["refresh"])
    response["Cache-Control"] = "no-store"
    return response


class LoginAPIView(CsrfProtectedAPIViewMixin, generics.GenericAPIView):
    serializer_class        = UserLoginSerializer
    authentication_classes  = [] # disables automatic authentication for this endpoint such as checking JWTs.
    permission_classes      = [permissions.AllowAny] # lets anyone call the endpoint, including users who haven't logged in-which is necessary for login.
    throttle_scope          = "auth_login"

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        authenticated_user = serializer.validated_data["user"]
        user = User.objects.select_for_update().get(pk=authenticated_user.pk)
        if not user.is_active or user.password != authenticated_user.password: # they are hashes, not text passwords
            raise AuthenticationFailed("The account changed. Please log in again.")
        is_google_user  = user.socialaccount_set.filter(provider="google").exists()

        if not user.email_verified and not is_google_user:
            # Read that challenge function to understand what it creates and how it is matched with the challenge_id in the response. It is used to verify the user's email before allowing them to log in.
            challenge = begin_challenge(user, VerificationReason.SIGNUP, user.unverified_email or user.email, resume=True)

            return Response(
                {
                    "detail":                   "Please verify your email before continuing.",
                    "requires_verification":    True,
                    "challenge_id":             str(challenge.id),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        return _login_response_for_user(request, user)


class CookieTokenRefreshAPIView(CsrfProtectedAPIViewMixin, generics.GenericAPIView):
    serializer_class = TokenRefreshSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_scope = "auth_refresh"

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(REFRESH_COOKIE_NAME)
        try:
            device_session = _refresh_device_session(refresh)
        except AuthenticationFailed as exc:
            return Response({"detail": str(exc.detail)}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = self.get_serializer(data={"refresh": refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            return Response(
                {"detail": "Invalid or expired refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

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


class LogoutAPIView(CsrfProtectedAPIViewMixin, generics.GenericAPIView):
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


class SocialLoginSessionAPIView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def get(self, request, *args, **kwargs):
        return _login_response_for_user(request, request.user)


class NavigationUserAPIView(generics.RetrieveAPIView):
    serializer_class = UserNavigationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ProfileAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get(self, request, *args, **kwargs):
        return self.retrieve(request, *args, **kwargs)

    def patch(self, request, *args, **kwargs):
        user = request.user
        if (
            user.unverified_email
            and user.email
            and user.unverified_email.strip().lower() != user.email.strip().lower()
            and not user.email_verified
        ):
            user.unverified_email = ""
            user.email_verified = True
            user.save(update_fields=["unverified_email", "email_verified"])
        return self.partial_update(request, *args, **kwargs)


# Keep existing view imports working while the challenge endpoints live separately.
from .verification import (
    RegisterAPIView, EmailUpdateAPIView, PasswordChangeRequestAPIView,
    PasswordRecoveryRequestAPIView, PasswordResetAPIView, ResendVerificationAPIView,
    VerificationStatusAPIView, ConfirmVerificationAPIView, CancelVerificationAPIView,
    CurrentVerificationAPIView,
)
