"""HTML adapters for the same challenge endpoints used by React.

Only opaque challenge/reset credentials travel in cookies; flow state is in the DB.
"""
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST
from rest_framework.authentication import SessionAuthentication

from accounts.api.views import (
    RegisterAPIView, EmailUpdateAPIView, PasswordChangeRequestAPIView,
    PasswordRecoveryRequestAPIView, PasswordResetAPIView, VerificationStatusAPIView,
    ConfirmVerificationAPIView, ResendVerificationAPIView,
    CancelVerificationAPIView,
)
from accounts.forms import (
    CustomUserCreationForm, EmailEditForm, PhoneEditForm, PasswordChangeRequestForm,
    PasswordResetRequestForm, PasswordResetForm,
)

CHALLENGE_COOKIE = "open_spots_verification"
RESET_COOKIE = "open_spots_reset"


def credential_cookie(response, key, value):
    response.set_cookie(key, value, max_age=1800, httponly=True,
                        secure=getattr(settings, "JWT_COOKIE_SECURE", not settings.DEBUG),
                        samesite="Strict", path="/")
    return response


def dispatch(request, view, *, data=None, authenticated=False):
    request.META["HTTP_X_VERIFICATION_CHALLENGE"] = request.POST.get("challenge_id") or request.COOKIES.get(CHALLENGE_COOKIE, "")
    if data is not None:
        request._post = data
    return view.as_view(authentication_classes=[SessionAuthentication] if authenticated else [])(request)


def begin_response(request, response, template, context):
    if response.status_code < 400:
        return credential_cookie(redirect("confirm_code"), CHALLENGE_COOKIE, response.data["challenge_id"])
    messages.error(request, str(response.data.get("detail", response.data)))
    return render(request, template, context)


def signup_view(request):
    form = CustomUserCreationForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        data = request.POST.copy()
        data["password"] = data.get("password1", "")
        return begin_response(request, dispatch(request, RegisterAPIView, data=data), "accounts/signup.html", {"form": form})
    return render(request, "accounts/signup.html", {"form": form})


def password_recover_request(request):
    form = PasswordResetRequestForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        return begin_response(request, dispatch(request, PasswordRecoveryRequestAPIView), "accounts/password_recover.html", {"form": form})
    return render(request, "accounts/password_recover.html", {"form": form})


@login_required
def profile_view(request):
    user = request.user
    context = {"email_form": EmailEditForm(instance=user), "phone_form": PhoneEditForm(instance=user),
               "password_form": PasswordChangeRequestForm(user=user)}
    if request.method == "POST":
        if "email" in request.POST:
            return begin_response(request, dispatch(request, EmailUpdateAPIView, authenticated=True), "accounts/profile.html", context)
        if "old_password" in request.POST:
            return begin_response(request, dispatch(request, PasswordChangeRequestAPIView, authenticated=True), "accounts/profile.html", context)
        if "phone_number" in request.POST:
            form = PhoneEditForm(request.POST, instance=user)
            if form.is_valid():
                form.save()
                return redirect("profile")
            context["phone_form"] = form
    return render(request, "accounts/profile.html", context)


def confirm_code_view(request):
    if request.method == "POST":
        result = dispatch(request, ConfirmVerificationAPIView)
        if result.status_code >= 400:
            messages.error(request, str(result.data.get("detail", result.data)))
            return redirect("confirm_code")
        if result.data.get("reset_token"):
            return credential_cookie(redirect("password_reset"), RESET_COOKIE, result.data["reset_token"])
        if result.data.get("access"):
            user = get_user_model().objects.get(pk=result._authenticated_user_id)
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        if result.data.get("session_invalidated"):
            logout(request)
        response = redirect(result.data.get("redirect_to", "/"))
        response.cookies.update(result.cookies)
        response.delete_cookie(CHALLENGE_COOKIE, path="/")
        return response
    result = dispatch(request, VerificationStatusAPIView)
    if result.status_code >= 400:
        messages.error(request, "Verification expired. Please start again.")
        return redirect("login")
    return render(request, "accounts/verify_code.html", result.data)


@require_POST
def resend_code_view(request):
    result = dispatch(request, ResendVerificationAPIView)
    (messages.success if result.status_code < 400 else messages.error)(request, str(result.data.get("detail", result.data)))
    return redirect("confirm_code")


@require_POST
def cancel_verification_view(request):
    result = dispatch(request, CancelVerificationAPIView)
    if result.status_code >= 400:
        messages.error(request, str(result.data.get("detail", result.data)))
        return redirect("confirm_code")
    response = redirect("login")
    response.delete_cookie(CHALLENGE_COOKIE, path="/")
    response.delete_cookie(RESET_COOKIE, path="/")
    return response


def password_reset(request):
    form = PasswordResetForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        data = request.POST.copy()
        data["reset_token"] = request.POST.get("reset_token") or request.COOKIES.get(RESET_COOKIE, "")
        result = dispatch(request, PasswordResetAPIView, data=data)
        if result.status_code < 400:
            logout(request)
            response = redirect("login")
            response.cookies.update(result.cookies)
            response.delete_cookie(CHALLENGE_COOKIE, path="/")
            response.delete_cookie(RESET_COOKIE, path="/")
            return response
        messages.error(request, str(result.data.get("detail", result.data)))
    return render(request, "accounts/password_reset.html", {
        "form": form, "challenge_id": request.COOKIES.get(CHALLENGE_COOKIE, ""),
        "reset_token": request.COOKIES.get(RESET_COOKIE, ""),
    })
