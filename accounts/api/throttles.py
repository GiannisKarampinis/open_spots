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
        pending_user_id = request.session.get("pending_user_id")
        if not pending_user_id:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": pending_user_id,
        }
