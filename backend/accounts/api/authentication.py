from django.core.exceptions import ValidationError
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from accounts.models import DeviceSession


class DeviceSessionJWTAuthentication(JWTAuthentication):
    """Reject access tokens immediately when their device session is revoked."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        session_id = validated_token.get("device_session_id")
        try:
            active = session_id and DeviceSession.objects.filter(
                pk=session_id, user=user, revoked_at__isnull=True,
            ).exists()
        except (ValidationError, ValueError, TypeError):
            active = False
        if not active:
            raise AuthenticationFailed("Device session is missing or revoked.")
        return user
