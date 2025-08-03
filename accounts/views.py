from datetime import timedelta
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, get_backends
from django.contrib import messages
from django.contrib.auth.decorators import login_required, user_passes_test
from django.views.decorators.http import require_POST
from django.utils.timezone import now
from .forms import CustomUserCreationForm, ProfileEditForm
from .models import CustomUser, EmailVerificationCode
from .tools import send_verification_code
from django.utils.http import url_has_allowed_host_and_scheme
from venues.models import Venue
from django.contrib.auth.views import LoginView
from django.urls import reverse
from django.contrib.auth import logout
from .forms import ProfileEditForm, PasswordChangeRequestForm



class CustomLoginView(LoginView):
    template_name = 'accounts/login.html'

    def form_valid(self, form):
        user = form.get_user()

        login(self.request, user)

        if not user.email_verified:
            # Set session for email verification flow
            self.request.session['pending_user_id'] = user.id
            self.request.session['code_already_sent'] = False  # Optional: so you can trigger resend logic
            messages.warning(self.request, "Please verify your email before continuing.")
            return redirect('confirm_code')

        return redirect(self.get_success_url())

    def get_success_url(self):
        user = self.request.user
        if user.user_type == 'venue_admin':
            venue = Venue.objects.filter(owner=user).first()
            if venue:
                return reverse('venue_dashboard', kwargs={'venue_id': venue.id})
            else:
                return reverse('apply_venue')
        return reverse('customer_home')

    

def signup_view(request):
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save(commit=False)
            user.user_type = 'customer'
            user.unverified_email = user.email
            user.email_verified = False
            user.save()
            print("Saved user ID:", user.id)

            # Ensure user ID is set
            if not user.id:
                user.refresh_from_db()

            if user.id:
                send_verification_code(user)
                request.session['pending_user_id'] = user.id
                request.session['code_already_sent'] = True

                messages.info(request, "We’ve sent a 6-digit verification code to your email.")
                return redirect('confirm_code')
            else:
                messages.error(request, "An unexpected error occurred during signup. Please try again.")
                return redirect('signup')
    else:
        form = CustomUserCreationForm()

    return render(request, 'accounts/signup.html', {'form': form})


@login_required
def profile_view(request):
    user = request.user
    old_email = user.email.strip().lower() if user.email else ''
    profile_form = ProfileEditForm(instance=user)
    password_form = PasswordChangeRequestForm(user=user)

    if request.method == 'POST':
        if 'email' in request.POST or 'phone_number' in request.POST:
            profile_form  = ProfileEditForm(request.POST, instance=user)
            if profile_form.is_valid():
                updated_user = profile_form.save(commit=False)

                new_email = profile_form.cleaned_data['email'].strip().lower() if profile_form.cleaned_data.get('email') else ''
                email_changed = False

                if new_email != old_email:
                    updated_user.unverified_email = updated_user.email
                    updated_user.email_verified = False
                    email_changed = True
                    updated_user.email = user.email  # keep old email until verified

                updated_user.save()

                if email_changed:
                    EmailVerificationCode.objects.filter(user=updated_user).delete()
                    send_verification_code(updated_user)
                    request.session['pending_user_id'] = updated_user.id
                    request.session['code_already_sent'] = True
                    messages.info(request, "Verification code sent to your new email. Please verify.")
                    return redirect('confirm_code')

                messages.success(request, "Profile updated successfully.")
                return redirect('profile')
            
        elif 'old_password' in request.POST:
            password_form = PasswordChangeRequestForm(user=user, data=request.POST)
            if password_form.is_valid():
                new_password = password_form.cleaned_data['new_password1']
                user.set_password(new_password)
                user.email_verified = False
                user.unverified_email = user.email
                user.save()

                EmailVerificationCode.objects.filter(user=user).delete()
                send_verification_code(user)
                request.session['pending_user_id'] = user.id
                request.session['code_already_sent'] = True
                messages.info(request, "Password updated. Please verify your email.")
                return redirect('confirm_code')

    else:
        form = ProfileEditForm(instance=user)

    return render(request, 'accounts/profile.html', {'form': form})


def confirm_code_view(request):
    user_id = request.session.get('pending_user_id')
    if not user_id:
        messages.error(request, "Session expired or invalid access to verification page.")
        return redirect('signup')

    user = get_object_or_404(CustomUser, id=user_id)

    # If user already verified, block further code confirmation
    if user.email_verified:
        messages.info(request, "Email already verified.")
        return redirect('profile')

    # If unverified_email is missing, stop here
    if not user.unverified_email:
        messages.error(request, "No unverified email found. Please sign up again.")
        return redirect('signup')

    if request.method == 'POST':
        code_entered = request.POST.get('code', '').strip()
        try:
            code_obj = EmailVerificationCode.objects.get(user=user, code=code_entered)
        except EmailVerificationCode.DoesNotExist:
            messages.error(request, "Invalid verification code.")
            return redirect('confirm_code')

        if code_obj.is_expired():
            code_obj.delete()
            messages.error(request, "Verification code expired. Please request a new one.")
            return redirect('confirm_code')

        # Valid code: finalize email verification
        user.email = user.unverified_email
        user.unverified_email = ''
        user.email_verified = True
        user.save()

        code_obj.delete()

        backend = get_backends()[0]
        login(request, user, backend=backend.__module__ + "." + backend.__class__.__name__)

        # Clean session
        request.session.pop('pending_user_id', None)
        request.session.pop('code_already_sent', None)

        messages.success(request, "Your email has been verified. Welcome!")
        return redirect('profile')

    # Handle GET: optionally resend a code
    if not request.session.get('code_already_sent'):
        # Clean up any previous codes
        EmailVerificationCode.objects.filter(user=user).delete()
        send_verification_code(user)
        request.session['code_already_sent'] = True

    latest_code = EmailVerificationCode.objects.filter(user=user).order_by('-created_at').first()
    if latest_code:
        remaining = max(0, int((latest_code.created_at + timedelta(minutes=2) - now()).total_seconds()))
    else:
        remaining = 0

    context = {
        'remaining_seconds': remaining
    }

    return render(request, 'accounts/verify_code.html', context)

def is_venue_admin(user):
    return user.is_authenticated and user.user_type == 'venue_admin'


@login_required
@user_passes_test(is_venue_admin)
def administration_panel(request):
    # Φέρνουμε όλα τα venues που ανήκουν στον τρέχοντα user
    venues = Venue.objects.filter(owner=request.user)

    context = {
        'venues': venues,
        'show_dashboard_button': True,
    }
    return render(request, 'accounts/administration_panel.html', context)




@require_POST
@login_required
def resend_code_view(request):
    user = request.user
    if user.unverified_email:
        EmailVerificationCode.objects.filter(user=user).delete()
        send_verification_code(user)
        messages.success(request, f"A new verification code has been sent to {user.unverified_email}.")
    else:
        messages.error(request, "No unverified email address found.")
    return redirect('confirm_code')
