from django.contrib.auth import get_user_model
from allauth.account.utils import user_email, user_field
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    """Make Google OAuth behave like a modern one-click login/signup flow.

    After Google returns a verified email, allauth should not show the intermediate
    social-signup form. New users are created automatically; existing users with
    the same verified email are connected and logged in.
    """

    def is_auto_signup_allowed(self, request, sociallogin):
        return True

    def pre_social_login(self, request, sociallogin):
        if sociallogin.is_existing:
            return

        email = (sociallogin.account.extra_data.get("email") or "").strip().lower()
        email_verified = sociallogin.account.extra_data.get("email_verified", False)

        if not email or not email_verified:
            return

        User = get_user_model()
        existing_user = User.objects.filter(email__iexact=email).first()
        if existing_user:
            sociallogin.connect(request, existing_user)

    def populate_user(self, request, sociallogin, data):
        user = super().populate_user(request, sociallogin, data)
        extra = sociallogin.account.extra_data or {}

        email = (extra.get("email") or data.get("email") or "").strip().lower()
        first_name = extra.get("given_name") or data.get("first_name") or ""
        last_name = extra.get("family_name") or data.get("last_name") or ""

        if email:
            user_email(user, email)

        user_field(user, "first_name", first_name)
        user_field(user, "last_name", last_name)
        user_field(user, "firstname", first_name)
        user_field(user, "lastname", last_name)

        # Do not use allauth.utils.generate_unique_username() here.
        # This project has ACCOUNT_USER_MODEL_USERNAME_FIELD=None for email-based
        # auth, and that makes allauth's helper crash with:
        # TypeError: unsupported operand type(s) for +: 'NoneType' and 'str'
        self._set_unique_username_if_model_has_one(user, email)

        return user

    def _set_unique_username_if_model_has_one(self, user, email):
        """Set a unique username only when the custom user model has that field."""
        User = get_user_model()

        try:
            User._meta.get_field("username")
        except Exception:
            return

        base = (email.split("@")[0] if email else "google_user") or "google_user"
        base = "".join(ch for ch in base if ch.isalnum() or ch in "._-")[:120] or "google_user"

        candidate = base
        counter = 1
        while User.objects.filter(username__iexact=candidate).exists():
            counter += 1
            suffix = f"_{counter}"
            candidate = f"{base[:150 - len(suffix)]}{suffix}"

        user.username = candidate

    def save_user(self, request, sociallogin, form=None):
        user = super().save_user(request, sociallogin, form)
        extra = sociallogin.account.extra_data or {}
        email = (extra.get("email") or user.email or "").strip().lower()

        if email:
            user.email = email
        user.email_verified = True
        user.unverified_email = ""
        user.save()
        return user
