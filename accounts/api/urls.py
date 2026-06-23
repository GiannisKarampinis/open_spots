from django.urls import path

from .views import (
    ConfirmVerificationAPIView,
    EmailUpdateAPIView,
    LoginAPIView,
    PasswordChangeRequestAPIView,
    PasswordRecoveryRequestAPIView,
    PasswordResetAPIView,
    ProfileAPIView,
    RegisterAPIView,
    ResendVerificationAPIView,
    VerificationStatusAPIView,
    SocialLoginSessionAPIView,
)

urlpatterns = [
    path("login/", LoginAPIView.as_view(), name="accounts-login"),
    path("register/", RegisterAPIView.as_view(), name="accounts-register"),
    path("social/session/", SocialLoginSessionAPIView.as_view(), name="accounts-social-session"),
    path("profile/", ProfileAPIView.as_view(), name="accounts-profile"),
    path("verification/resend/", ResendVerificationAPIView.as_view(), name="accounts-verification-resend"),
    path("verification/status/", VerificationStatusAPIView.as_view(), name="accounts-verification-status"),
    path("verification/confirm/", ConfirmVerificationAPIView.as_view(), name="accounts-verification-confirm"),
    path("email/update/", EmailUpdateAPIView.as_view(), name="accounts-email-update"),
    path("password/recover/", PasswordRecoveryRequestAPIView.as_view(), name="accounts-password-recover"),
    path("password/reset/", PasswordResetAPIView.as_view(), name="accounts-password-reset"),
    path("password/change/", PasswordChangeRequestAPIView.as_view(), name="accounts-password-change"),
]
