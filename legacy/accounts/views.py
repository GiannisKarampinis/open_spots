from accounts.models import VerificationReason
from django.urls                    import reverse
from django.contrib                 import messages
from django.shortcuts               import render, redirect

from django.contrib.auth            import login, get_user_model
from django.contrib.auth.views      import LoginView
from django.contrib.auth.decorators import login_required, user_passes_test

from venues.models                  import Venue                                        #FIXME: circular import + a commented out email sending
from rest_framework_simplejwt.tokens import RefreshToken
from accounts.models import DeviceSession


class CustomLoginView(LoginView):
    template_name = 'accounts/login.html'

    def form_valid(self, form):
        user = form.get_user()
        print('Login:', user.email_verified)

        # ✅ Block if email not verified
        is_google_user = user.socialaccount_set.filter(provider='google').exists()

        if not user.email_verified and not is_google_user:
            from accounts.services.challenges import begin_challenge
            from legacy.accounts.verification_forms import credential_cookie, CHALLENGE_COOKIE
            from rest_framework.exceptions import APIException
            try:
                challenge = begin_challenge(user, VerificationReason.SIGNUP, user.unverified_email or user.email, resume=True)
            except APIException as exc:
                messages.error(self.request, str(exc.detail))
                return redirect('login')
            return credential_cookie(redirect('confirm_code'), CHALLENGE_COOKIE, str(challenge.id))


        # ✅ Standard Django login
        login(self.request, user)

        # ✅ Generate JWT tokens and store in session
        refresh = RefreshToken.for_user(user)
        refresh["device_session_id"] = str(DeviceSession.objects.create(user=user).pk)
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
    
from .verification_forms import (
    signup_view, profile_view, password_recover_request, password_reset,
    confirm_code_view, resend_code_view,
)

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
