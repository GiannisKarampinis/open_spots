from accounts.models import VerificationReason
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APITestCase, APIClient

from accounts.models import VerificationChallenge
from accounts.services.challenges import begin_challenge


class TwoFactorChallengeTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = get_user_model().objects.create_user(username="two-factor-user", email="two@example.com", password="password-123", email_verified=True)
        self.device = TOTPDevice.objects.create(user=self.user, confirmed=True)

    def login(self):
        return self.client.post("/api/v1/accounts/login/", {"username": self.user.username, "password": "password-123"}, format="json")

    def confirm(self, identifier, code=None):
        code = code if code is not None else str(totp(self.device.bin_key)).zfill(6)
        return self.client.post("/api/v1/accounts/login/2fa/", {"code": code, "challenge_id": identifier}, format="json")

    @patch("accounts.services.challenges.send_email_with_template")
    def test_login_challenge_requires_password_and_is_consumed_once(self, mail):
        invalid = self.client.post("/api/v1/accounts/login/", {"username": self.user.username, "password": "incorrect"}, format="json")
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(VerificationChallenge.objects.exists())
        start = self.login()
        self.assertEqual(start.status_code, 202)
        self.assertNotIn("access", start.data)
        self.assertNotIn("pending_2fa_user_id", self.client.session)
        result = self.confirm(start.data["challenge_id"])
        self.assertEqual(result.status_code, 200)
        self.assertIn("access", result.data)
        self.assertIn("open_spots_refresh", result.cookies)
        self.assertEqual(self.confirm(start.data["challenge_id"]).status_code, 400)
        mail.assert_not_called()

    def test_old_session_flags_are_not_authorization(self):
        session = self.client.session
        session["pending_2fa_user_id"] = self.user.pk
        session["pending_2fa_started_at"] = timezone.now().isoformat()
        session.save()
        self.assertEqual(self.confirm("").status_code, 400)

    @patch("accounts.services.challenges.send_email_with_template")
    def test_pending_account_verification_does_not_block_login(self, mail):
        account = begin_challenge(self.user, VerificationReason.EMAIL_UPDATE, "new@example.com")
        start = self.login()
        self.assertEqual(start.status_code, 202)
        self.assertNotEqual(start.data["challenge_id"], str(account.pk))
        self.assertEqual(self.confirm(start.data["challenge_id"]).status_code, 200)
        account.refresh_from_db()
        self.assertIsNone(account.closed_at)

    def test_expired_challenge_and_changed_password_are_rejected(self):
        start = self.login()
        identifier = start.data["challenge_id"]
        VerificationChallenge.objects.filter(pk=identifier).update(expires_at=timezone.now())
        self.assertEqual(self.confirm(identifier).status_code, 400)
        new = self.login()
        self.user.set_password("changed-password-123")
        self.user.save()
        self.assertEqual(self.confirm(new.data["challenge_id"]).status_code, 400)

    @patch.object(TOTPDevice, "verify_token", return_value=False)
    def test_failed_attempts_survive_relogin_and_new_client(self, verify):
        identifier = self.login().data["challenge_id"]
        for _ in range(5):
            self.confirm(identifier, "000000")
        self.client = APIClient()
        again = self.login()
        self.assertEqual(again.data["challenge_id"], identifier)
        self.assertEqual(self.confirm(identifier).status_code, 429)
        self.assertEqual(verify.call_count, 5)

    @patch("accounts.services.challenges.send_email_with_template")
    def test_account_challenge_cannot_be_used_for_login(self, mail):
        challenge = begin_challenge(self.user, VerificationReason.SIGNUP, self.user.email)
        self.assertEqual(self.confirm(str(challenge.id)).status_code, 400)

    def test_login_challenge_cannot_be_confirmed_or_resent_as_email(self):
        identifier = self.login().data["challenge_id"]
        self.client.credentials(HTTP_X_VERIFICATION_CHALLENGE=identifier)
        self.assertEqual(self.client.post("/api/v1/accounts/verification/confirm/", {"code": "123456"}).status_code, 400)
        self.assertEqual(self.client.post("/api/v1/accounts/verification/resend/", {}).status_code, 400)

    def test_removed_device_cannot_complete_challenge(self):
        identifier = self.login().data["challenge_id"]
        self.device.delete()
        self.assertEqual(self.confirm(identifier, "123456").status_code, 400)

    def test_token_alias_requires_totp_and_uses_the_login_challenge(self):
        result = self.client.post("/api/token/", {
            "username": self.user.username, "password": "password-123",
        }, format="json")
        self.assertEqual(result.status_code, 202)
        self.assertNotIn("access", result.data)
        self.assertNotIn("refresh", result.data)
        self.assertTrue(result.data["requires_2fa"])
        self.assertEqual(self.confirm(result.data["challenge_id"]).status_code, 200)

    def test_new_login_replaces_challenge_after_primary_email_changes(self):
        previous = self.login().data["challenge_id"]
        self.user.email = "updated@example.com"
        self.user.save(update_fields=["email"])
        result = self.login()
        self.assertEqual(result.status_code, 202)
        self.assertNotEqual(result.data["challenge_id"], previous)
        self.assertIsNotNone(VerificationChallenge.objects.get(pk=previous).closed_at)
