from rest_framework.throttling import SimpleRateThrottle


class VerificationResendIPThrottle(SimpleRateThrottle):
    scope = "auth_verification_resend_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class VerificationResendUserThrottle(SimpleRateThrottle):
    scope = "auth_verification_resend_user"

    def get_cache_key(self, request, view):
        from accounts.services.challenges import challenge_id
        from accounts.models import VerificationChallenge
        identifier = challenge_id(request)
        pending_user_id = VerificationChallenge.objects.filter(pk=identifier).values_list("user_id", flat=True).first() if identifier else None
        if not identifier:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": pending_user_id or f"challenge-{identifier}",
        }
