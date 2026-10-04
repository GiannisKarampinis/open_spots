from accounts.models import VerificationReason
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import close_old_connections
from django.test import TransactionTestCase, override_settings, skipUnlessDBFeature
from rest_framework.test import APIClient

from accounts.models import VerificationChallenge
from accounts.services.challenges import begin_challenge, PendingVerification


@override_settings(
    PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
@skipUnlessDBFeature("has_select_for_update")
class ChallengeConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="concurrent", email="concurrent@example.com", password="password-123")

    def run_race(self, action):
        barrier = Barrier(2)

        def run():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return action()
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            return list(executor.map(lambda _: run(), range(2)))

    @patch("accounts.services.challenges.send_email_with_template")
    def test_concurrent_starts_create_only_one_challenge(self, mail):
        def start():
            try:
                begin_challenge(self.user, VerificationReason.SIGNUP, self.user.email)
                return 201
            except PendingVerification:
                return 409

        self.assertEqual(sorted(self.run_race(start)), [201, 409])
        self.assertEqual(VerificationChallenge.objects.filter(user=self.user, closed_at__isnull=True).count(), 1)
        mail.assert_called_once()

    @patch("accounts.services.challenges.send_email_with_template")
    def test_concurrent_confirmation_consumes_code_once(self, mail):
        challenge = begin_challenge(self.user, VerificationReason.SIGNUP, self.user.email)
        code = mail.call_args.kwargs["context"]["code"]

        def confirm():
            client = APIClient()
            return client.post("/api/v1/accounts/verification/confirm/", {"challenge_id": str(challenge.pk), "code": code}, format="json").status_code

        self.assertEqual(sorted(self.run_race(confirm)), [200, 400])

    def test_two_factor_login_challenge_can_only_be_consumed_once(self):
        from django_otp.oath import totp
        from django_otp.plugins.otp_totp.models import TOTPDevice
        device = TOTPDevice.objects.create(user=self.user, confirmed=True)
        challenge = begin_challenge(self.user, VerificationReason.TWO_FACTOR_LOGIN, self.user.email, payload={"device_id": device.pk})
        code = str(totp(device.bin_key)).zfill(6)

        def confirm():
            return APIClient().post("/api/v1/accounts/login/2fa/", {"challenge_id": str(challenge.pk), "code": code}, format="json").status_code

        self.assertEqual(sorted(self.run_race(confirm)), [200, 400])

    @patch("venues.api.verification.send_new_venue_application_email")
    @patch("accounts.services.challenges.send_email_with_template")
    def test_venue_proof_is_consumed_by_only_one_application(self, mail, notify):
        from venues.models import VenueApplication
        challenge = begin_challenge(None, VerificationReason.VENUE_SIGNUP_EMAIL_VERIFY, "applicant@example.com")
        code = mail.call_args.kwargs["context"]["code"]
        verified = APIClient().post("/api/v1/venues/verification/confirm/", {"challenge_id": str(challenge.pk), "code": code}, format="json")
        payload = {
            "challenge_id": str(challenge.pk), "verification_token": verified.data["verification_token"],
            "venue_name": "Test Cafe", "venue_type": VenueApplication._meta.get_field("venue_type").choices[0][0],
            "location": "Athens", "phone": "+306912345678", "admin_username": "new-applicant",
            "admin_email": challenge.email, "admin_firstname": "First", "admin_lastname": "Last",
            "admin_phone": "+306912345678", "password": "strong-password-123",
        }

        def apply():
            return APIClient().post("/api/v1/venues/apply/", payload, format="json").status_code

        self.assertEqual(sorted(self.run_race(apply)), [201, 400])
        self.assertEqual(VenueApplication.objects.count(), 1)
