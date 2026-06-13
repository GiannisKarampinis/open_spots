from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    UserLoginSerializer,
    UserRegistrationSerializer,
 
    UserEmailUpdateSerializer,
    UserPasswordChangeSerializer,
    UserPasswordRecoverySerializer,
    UserPasswordResetSerializer,
    UserProfileSerializer,
    VerificationCodeSerializer,
)
from ..services.emails import send_verification_code
from emails_manager.models import EmailVerificationCode

User = get_user_model()


def _tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        "refresh":  str(refresh),
        "access":   str(refresh.access_token),
    }


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


class LoginAPIView(generics.GenericAPIView):
    serializer_class   = UserLoginSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

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

        tokens = _tokens_for_user(user)

        return Response(
            {
                **tokens,
                "user":         UserProfileSerializer(user).data,
                "redirect_to":  _default_redirect_for_user(user),
            }
        )


class RegisterAPIView(generics.CreateAPIView):
    serializer_class    = UserRegistrationSerializer
    authentication_classes = []
    permission_classes  = [permissions.AllowAny]

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

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        serializer.save()
        send_verification_code(user)
        request.session["pending_user_id"] = user.id
        request.session["verification_reason"] = "password_change"
        request.session["code_already_sent"] = True
        return Response({"detail": "Verification code sent. Confirm the code to complete the password change."})


class PasswordRecoveryRequestAPIView(generics.GenericAPIView):
    serializer_class = UserPasswordRecoverySerializer
    permission_classes = [permissions.AllowAny]

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
        return Response({"detail": "If the email exists, a verification code has been sent."})


class PasswordResetAPIView(generics.GenericAPIView):
    serializer_class = UserPasswordResetSerializer
    permission_classes = [permissions.AllowAny]

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
        request.session.pop("pending_user_id", None)
        request.session.pop("verification_reason", None)
        request.session.pop("code_already_sent", None)
        request.session.pop("password_recovery_verified", None)
        return Response({"detail": "Password reset successful."})


class ResendVerificationAPIView(generics.GenericAPIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

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
            request.session.pop("pending_user_id", None)
            request.session.pop("verification_reason", None)
            request.session.pop("code_already_sent", None)
            tokens = _tokens_for_user(user)
            request.session["jwt_access"] = tokens["access"]
            request.session["jwt_refresh"] = tokens["refresh"]
            return Response(
                {
                    "detail": "Email verified successfully.",
                    **tokens,
                    "user": UserProfileSerializer(user).data,
                    "redirect_to": _default_redirect_for_user(user),
                }
            )

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
