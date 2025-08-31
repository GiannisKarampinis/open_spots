from datetime                       import timedelta

from django.urls                    import reverse
from django.contrib                 import messages
from django.shortcuts               import render, redirect, get_object_or_404
from django.utils.timezone          import now
from django.views.decorators.http   import require_POST

from django.contrib.auth            import login, get_backends, get_user_model
from django.contrib.auth.views      import LoginView
from django.contrib.auth.decorators import login_required, user_passes_test

from .forms                         import CustomUserCreationForm, ProfileEditForm
from .forms                         import ProfileEditForm, PasswordChangeRequestForm
from .forms                         import PasswordResetRequestForm, PasswordResetForm
from .tools                         import send_verification_code
from .models                        import CustomUser, EmailVerificationCode
from venues.models                  import Venue
from rest_framework_simplejwt.tokens import RefreshToken


### This function is only used for developing/testing purposes 
def password_recover_request(request):
    if request.method == 'POST':
        form = PasswordResetRequestForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data['email'].strip().lower()
            user = CustomUser.objects.filter(email__iexact=email).first()
            print('Password recover:', user.username)

            if user:
                request.session['pending_user_id'] = user.id
                request.session['verification_reason'] = 'password_recovery'
                request.session['code_already_sent'] = False
                return redirect('confirm_code')
            else:
                messages.error(request, "No user found with that email.")
                return redirect('password_recover')
    else:
        form = PasswordResetRequestForm()

    return render(request, 'accounts/password_recover.html', {'form': form})



### This function will be used later when: email = models.EmailField(unique=True) in CustomUser
# def password_recover_request(request):
#     if request.method == 'POST':
#         form = PasswordResetRequestForm(request.POST)
#         if form.is_valid():
#             email = form.cleaned_data['email'].strip().lower()
#             try:
#                 user = CustomUser.objects.get(email=email)
#                 user.unverified_email = email  # Assign temporarily
#                 user.email_verified = False
#                 user.save()

#                 EmailVerificationCode.objects.filter(user=user).delete()
#                 send_verification_code(user)

#                 request.session['pending_user_id'] = user.id
#                 request.session['recovery_flow'] = True
#                 messages.info(request, "Verification code sent. Please check your email.")
#                 return redirect('confirm_code')
#             except CustomUser.DoesNotExist:
#                 messages.error(request, "No account found with that email.")
#     else:
#         form = PasswordResetRequestForm()
#     return render(request, 'accounts/password_recover.html', {'form': form})

### This function is only used for developing/testing purposes 
def password_reset(request):
    user_id = request.session.get('pending_user_id')
    verified = request.session.get('password_recovery_verified')

    if not user_id or not verified:
        messages.error(request, "Invalid access. Start password recovery again.")
        return redirect('password_recover')

    user = get_object_or_404(CustomUser, id=user_id)

    if request.method == 'POST':
        form = PasswordResetForm(request.POST)  # Simple two-field form
        if form.is_valid():
            new_password = form.cleaned_data['new_password1']
            user.set_password(new_password)
            user.email_verified = True  # ✅ Consider email verified
            user.unverified_email = ''  # ✅ Clear unverified email
            user.save()

            # Clear session
            request.session.flush()

            messages.success(request, "Password reset successfully. You may now log in.")
            return redirect('login')
    else:
        form = PasswordResetForm()

    return render(request, 'accounts/password_reset.html', {'form': form})


### This function will be used later when: email = models.EmailField(unique=True) in CustomUser
# def password_reset(request):
#     user_id = request.session.get('pending_user_id')
#     if not user_id or not request.session.get('recovery_flow'):
#         messages.error(request, "Invalid access.")
#         return redirect('login')

#     user = get_object_or_404(CustomUser, id=user_id)

#     if request.method == 'POST':
#         form = PasswordResetForm(request.POST)
#         if form.is_valid():
#             password = form.cleaned_data['new_password1']
#             user.set_password(password)
#             user.email_verified = True
#             user.unverified_email = ''
#             user.save()

#             EmailVerificationCode.objects.filter(user=user).delete()

#             # Clear session
#             request.session.pop('pending_user_id', None)
#             request.session.pop('recovery_flow', None)
#             request.session.pop('code_already_sent', None)

#             messages.success(request, "Password reset successful. Please log in.")
#             return redirect('login')
#     else:
#         form = PasswordResetForm()
#     return render(request, 'accounts/password_reset.html', {'form': form})


class CustomLoginView(LoginView):
    template_name = 'accounts/login.html'

    def form_valid(self, form):
        user = form.get_user()
        print('Login:', user.email_verified)

        # ✅ Block if email not verified
        if not user.email_verified:
            self.request.session['pending_user_id'] = user.id
            self.request.session['code_already_sent'] = False
            self.request.session['verification_reason'] = 'signup'

            messages.warning(self.request, "Please verify your email before continuing.")
            return redirect('confirm_code')

        # ✅ Standard Django login
        login(self.request, user)

        # ✅ Generate JWT tokens and store in session
        refresh = RefreshToken.for_user(user)
        self.request.session['jwt_access'] = str(refresh.access_token)
        self.request.session['jwt_refresh'] = str(refresh)

        return redirect(self.get_success_url())

    def form_invalid(self, form):
        User = get_user_model()
        username = form.data.get('username')
        password = form.data.get('password')

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            messages.error(self.request, "This username does not exist. Please sign up first.")
            return redirect('signup')

        if not user.check_password(password):
            messages.error(self.request, "Incorrect password. Please try again.")
            return super().form_invalid(form)

        messages.error(self.request, "Login failed. Please check your credentials.")
        return super().form_invalid(form)

    def get_success_url(self):
        user = self.request.user
        if user.user_type == 'venue_admin':
            venue = Venue.objects.filter(owner=user).first()
            if venue:
                return reverse('venue_dashboard', kwargs={'venue_id': venue.id})
            else:
                return reverse('apply_venue')
        return reverse('venue_list')
    
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
                request.session['verification_reason'] = 'signup'
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
                
                # Capture current verified email BEFORE invalidating
                current_verified_email = user.email.strip().lower()
                user.set_password(new_password)
                user.email_verified = False
                user.unverified_email = current_verified_email
                print('Profile view:', user.unverified_email)
                user.save()

                EmailVerificationCode.objects.filter(user=user).delete()
                send_verification_code(user)
                request.session['pending_user_id'] = user.id
                request.session['code_already_sent'] = True
                request.session['verification_reason'] = 'password_change'
                messages.info(request, "Password updated. Please verify your email.")
                return redirect('confirm_code')
            else:
                messages.error(request, "Invalid form: something went wrong, please try again")

    context = {
        'profile_form': profile_form,
        'password_form': password_form,
    }

    return render(request, 'accounts/profile.html', context)


def confirm_code_view(request):
    user_id = request.session.get('pending_user_id')
    verification_reason = request.session.get('verification_reason')

    if not user_id or not verification_reason:
        messages.error(request, "Session expired or invalid access to verification page.")
        return redirect('login')

    user = get_object_or_404(CustomUser, id=user_id)

    # If user already verified, block further code confirmation
    if verification_reason == 'signup': 
        if user.email_verified:
            messages.info(request, "Email already verified.")
            return redirect('login')
        else:
            messages.info(request, "Log in to verify your email.")

    # If unverified_email is missing, stop here
    if verification_reason not in ['password_recovery', 'password_change'] and not user.unverified_email:
        messages.error(request, "No unverified email found. Please sign up again.")
        return redirect('login')

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

        code_obj.delete()

        if verification_reason in ['signup', 'email_update']:
            user.email = user.unverified_email
            user.unverified_email = ''
            user.email_verified = True
            user.save()

          # Only clear what's necessary
            request.session.pop('pending_user_id', None)
            request.session.pop('code_already_sent', None)
            request.session.pop('verification_reason', None)


            # Log the user in manually
            backend = get_backends()[0]
            login(request, user, backend=backend.__module__ + "." + backend.__class__.__name__)
            messages.success(request, "Your email has been verified. You may now use your account.")
            return redirect('profile')  # or another landing page

        elif verification_reason == 'password_recovery':
            # Do not log in yet!
            # Clean old sessions but keep ID to use on password reset
            request.session['password_recovery_verified'] = True
            return redirect('password_reset')  # You need to create this view
        
        elif verification_reason == 'password_change':
            user.email = user.unverified_email
            user.unverified_email = ''
            user.email_verified = True
            user.save()

            request.session.flush()  # Clear session to avoid conflicts

            # request.session.pop('pending_user_id', None)
            # request.session.pop('code_already_sent', None)
            # request.session.pop('verification_reason', None)

            backend = get_backends()[0]
            login(request, user, backend=backend.__module__ + "." + backend.__class__.__name__)
            messages.success(request, "Password changed and email verified.")
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
