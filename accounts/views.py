from django.shortcuts               import render, redirect, get_object_or_404
from django.contrib.auth            import login, authenticate
from django.contrib                 import messages
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth            import views as auth_views
from django.contrib.auth.tokens     import default_token_generator
from django.utils.http              import urlsafe_base64_decode
from django.utils                   import timezone
from django.contrib.auth            import get_user_model
from django.views.decorators.http   import require_POST
from .tools                         import send_verification_code
from django.shortcuts               import render, redirect
from .forms                         import ProfileEditForm
from datetime                       import timedelta
from django.views.decorators.cache  import never_cache
from django.utils.timezone          import now
from .forms                         import CustomUserCreationForm
from .models                        import EmailVerificationCode


def signup_view(request):
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            username = form.cleaned_data['username']
            password = form.cleaned_data['password1']
            user = authenticate(request, username=username, password=password)

            if user:
                login(request, user)
                user.unverified_email = user.email
                user.email_verified = False
                user.save()
                send_verification_code(user)
                messages.info(request, "Please verify your email address before continuing.")
                return redirect('profile')
            else:
                form.add_error(None, 'Authentication failed after signup.')
    else:
        form = CustomUserCreationForm()

    return render(request, 'accounts/signup.html', {'form': form})


@login_required
def profile_view(request):
    user = request.user
    old_email = user.email.strip().lower() if user.email else ''
    if request.method == 'POST':
        form = ProfileEditForm(request.POST, instance=user)
        if form.is_valid():
            
            updated_user = form.save(commit=False)

            # Normalize email for comparison
            new_email = form.cleaned_data['email'].strip().lower() if form.cleaned_data.get('email') else ''

            email_changed = False
            
            print(f"Old email: '{old_email}', New email: '{new_email}'")
            
            if new_email != old_email:
                updated_user.unverified_email = updated_user.email
                updated_user.email_verified = False
                email_changed = True
                updated_user.email = user.email  # Keep old email until verified

            updated_user.save()

            if email_changed:
                EmailVerificationCode.objects.filter(user=updated_user).delete()
                send_verification_code(updated_user)
                messages.info(request, "Verification code sent to your new email. Please verify.")
                return redirect('confirm_code')

            messages.success(request, "Profile updated successfully.")
            return redirect('profile')
    else:
        form = ProfileEditForm(instance=user)

    return render(request, 'accounts/profile.html', {'form': form})


@never_cache
@login_required
def confirm_code_view(request):
    user = request.user
    context = {}

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

        # Valid code
        user.email = user.unverified_email
        user.unverified_email = ''
        user.email_verified = True
        user.save()
        code_obj.delete()

        messages.success(request, "Your email has been verified.")
        return redirect('profile')

    # If GET request: delete old code, send a new one, and set fresh timer
    EmailVerificationCode.objects.filter(user=user).delete()
    send_verification_code(user)

    # Get the new code and calculate remaining time
    new_code = EmailVerificationCode.objects.filter(user=user).latest('created_at')
    remaining = max(0, int((new_code.created_at + timedelta(minutes=2) - now()).total_seconds()))
    context['remaining_seconds'] = remaining

    return render(request, 'accounts/verify_code.html', context)


def is_venue_admin(user):
    return user.is_authenticated and user.user_type == 'venue_admin'


@login_required
@user_passes_test(is_venue_admin)
def venue_dashboard_view(request):
    return render(request, 'accounts/venue_dashboard.html')  # Will be built later

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
