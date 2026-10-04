from accounts.models import VerificationReason
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import Client
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import DeviceSession, VerificationChallenge
from accounts.services.challenges import begin_challenge

User = get_user_model()
BASE = "/api/v1/accounts/"


class VerificationChallengeTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username="challenge-user", email="user@example.com", password="old-password-123", email_verified=True)
        self.mail_patch = patch("accounts.services.challenges.send_email_with_template")
        self.mail = self.mail_patch.start()
        self.addCleanup(self.mail_patch.stop)
        self.addCleanup(cache.clear)

    def start(self, reason=VerificationReason.SIGNUP, **kwargs):
        with self.captureOnCommitCallbacks(execute=True):
            challenge = begin_challenge(self.user, reason, kwargs.pop("email", self.user.email), **kwargs)
        self.code = self.mail.call_args.kwargs["context"]["code"]
        self.client.credentials(HTTP_X_VERIFICATION_CHALLENGE=str(challenge.id))
        return challenge

    def post(self, path, data=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(BASE + path + "/", data or {}, format="json")

    def confirm(self, code=None):
        return self.post("verification/confirm", {"code": self.code if code is None else code})

    def test_recovery_delivery_failure_has_uniform_response_and_can_retry(self):
        self.mail.side_effect = RuntimeError("SMTP unavailable")
        known = self.post("password/recover", {"email": self.user.email})
        unknown = self.post("password/recover", {"email": "missing@example.com"})
        self.assertEqual(known.status_code, 200)
        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(known.data["detail"], unknown.data["detail"])
        self.assertEqual(set(known.data), set(unknown.data))
        self.assertFalse(VerificationChallenge.objects.filter(user=self.user, closed_at__isnull=True).exists())
        self.mail.side_effect = None
        retry = self.post("password/recover", {"email": self.user.email})
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(VerificationChallenge.objects.get(pk=retry.data["challenge_id"]).user, self.user)

    def test_status_requires_id_and_ignores_old_session(self):
        session = self.client.session
        session["pending_user_id"] = self.user.pk
        session["verification_reason"] = VerificationReason.SIGNUP
        session.save()
        self.assertEqual(self.client.get(BASE + "verification/status/").status_code, 400)
        self.start()
        response = self.client.get(BASE + "verification/status/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reason"], VerificationReason.SIGNUP)
        self.assertGreater(response.data["remaining_seconds"], 0)
        self.assertNotIn("payload", response.data)
        self.assertNotIn("code_hash", response.data)
        self.mail.assert_called_once()

    def test_codes_are_hashed_and_confirmation_is_one_use(self):
        challenge = self.start()
        self.assertNotEqual(challenge.code_hash, self.code)
        self.assertTrue(check_password(self.code, challenge.code_hash))
        self.assertEqual(self.confirm().status_code, 200)
        self.assertEqual(self.confirm().status_code, 400)
        challenge.refresh_from_db()
        self.assertIsNotNone(challenge.closed_at)
        self.assertEqual(challenge.payload, {})
        self.assertEqual(challenge.code_hash, "")

    def test_competing_flow_does_not_replace_existing_challenge(self):
        challenge = self.start(VerificationReason.EMAIL_UPDATE, email="new@example.com")
        self.client.force_authenticate(self.user)
        response = self.post("password/change", {"old_password": "old-password-123", "new_password1": "new-password-456", "new_password2": "new-password-456"})
        self.assertEqual(response.status_code, 409)
        challenge.refresh_from_db()
        self.assertIsNone(challenge.closed_at)
        self.assertTrue(check_password(self.code, challenge.code_hash))
        self.assertEqual(VerificationChallenge.objects.filter(user=self.user).count(), 1)

    def test_database_prevents_two_open_challenges(self):
        challenge = self.start()
        with self.assertRaises(IntegrityError), transaction.atomic():
            VerificationChallenge.objects.create(user=self.user, reason=VerificationReason.SIGNUP, email=self.user.email, expires_at=challenge.expires_at, code_expires_at=challenge.code_expires_at, last_sent_at=challenge.last_sent_at)

    def test_expired_challenge_can_be_replaced_and_cannot_confirm(self):
        challenge = self.start(VerificationReason.PASSWORD_CHANGE, payload={"password_hash": self.user.password})
        VerificationChallenge.objects.filter(pk=challenge.pk).update(expires_at=timezone.now() - timezone.timedelta(seconds=1))
        self.assertEqual(self.confirm().status_code, 400)
        second = self.start(VerificationReason.EMAIL_UPDATE, email="new@example.com")
        self.assertNotEqual(challenge.pk, second.pk)
        challenge.refresh_from_db()
        self.assertIsNotNone(challenge.closed_at)
        self.assertEqual(challenge.payload, {})

    def test_cancel_closes_flow_and_allows_another(self):
        challenge = self.start()
        self.assertEqual(self.post("verification/cancel").status_code, 200)
        self.assertEqual(self.confirm().status_code, 400)
        self.assertNotEqual(self.start().pk, challenge.pk)

    def test_resend_cooldown_rotation_and_attempts(self):
        challenge = self.start()
        old_code = self.code
        self.assertEqual(self.confirm("bad-code").status_code, 400)
        self.assertEqual(self.post("verification/resend").status_code, 429)
        VerificationChallenge.objects.filter(pk=challenge.pk).update(last_sent_at=timezone.now() - timezone.timedelta(seconds=61))
        with patch("accounts.services.challenges.secrets.randbelow", return_value=(int(old_code) + 1) % 1000000):
            self.assertEqual(self.post("verification/resend").status_code, 200)
        challenge.refresh_from_db()
        self.assertEqual(challenge.attempts, 1)
        self.assertFalse(check_password(old_code, challenge.code_hash))
        new_code = self.mail.call_args.kwargs["context"]["code"]
        self.assertEqual(self.confirm(new_code).status_code, 200)

    def test_code_expiry_can_resend_within_challenge_lifetime(self):
        challenge = self.start()
        VerificationChallenge.objects.filter(pk=challenge.pk).update(code_expires_at=timezone.now() - timezone.timedelta(seconds=1), last_sent_at=timezone.now() - timezone.timedelta(seconds=61))
        self.assertEqual(self.confirm().status_code, 400)
        self.assertEqual(self.post("verification/resend").status_code, 200)

    def test_lockout_survives_new_client_and_blocks_resend(self):
        challenge = self.start()
        for _ in range(5):
            result = self.confirm("bad-code")
        self.assertEqual(result.status_code, 429)
        self.client = APIClient()
        self.client.credentials(HTTP_X_VERIFICATION_CHALLENGE=str(challenge.id))
        self.assertEqual(self.confirm().status_code, 429)
        self.assertEqual(self.post("verification/resend").status_code, 429)
        challenge.refresh_from_db()
        self.assertEqual(challenge.attempts, 5)

    def test_password_reset_requires_separate_token_and_revokes_sessions(self):
        challenge = self.start(VerificationReason.PASSWORD_RECOVERY)
        device = DeviceSession.objects.create(user=self.user)
        refresh = RefreshToken.for_user(self.user)
        refresh["device_session_id"] = str(device.pk)
        self.client.cookies["open_spots_refresh"] = str(refresh)
        data = {"new_password1": "new-password-456", "new_password2": "new-password-456"}
        self.assertEqual(self.post("password/reset", data).status_code, 400)
        verified = self.confirm()
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(self.post("password/reset", data).status_code, 400)
        self.assertEqual(self.post("password/reset", {**data, "reset_token": "wrong"}).status_code, 400)
        data["reset_token"] = verified.data["reset_token"]
        result = self.post("password/reset", data)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.cookies["open_spots_refresh"]["max-age"], 0)
        self.assertEqual(self.post("password/reset", data).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-password-456"))
        device.refresh_from_db()
        self.assertIsNotNone(device.revoked_at)

    def test_recovery_does_not_disclose_unknown_or_busy_users(self):
        active = self.start(VerificationReason.EMAIL_UPDATE, email="new@example.com")
        for email in (self.user.email, "unknown@example.com"):
            response = self.post("password/recover", {"email": email})
            self.assertEqual(response.status_code, 200)
            challenge = VerificationChallenge.objects.get(pk=response.data["challenge_id"])
            self.assertIsNone(challenge.user_id)
            self.assertNotEqual(challenge.id, active.id)
        self.mail.assert_called_once()
        active.refresh_from_db()
        self.assertIsNone(active.closed_at)

    def test_email_change_does_not_modify_profile_and_preserves_live_code_on_resume(self):
        self.client.force_authenticate(self.user)
        response = self.post("email/update", {"email": "new@example.com"})
        self.assertEqual(response.status_code, 200)
        self.code = self.mail.call_args.kwargs["context"]["code"]
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "user@example.com")
        self.assertTrue(self.user.email_verified)
        self.client.credentials(HTTP_X_VERIFICATION_CHALLENGE=response.data["challenge_id"])
        again = self.post("email/update", {"email": "new@example.com"})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["challenge_id"], response.data["challenge_id"])
        self.mail.assert_called_once()
        self.assertEqual(self.confirm().status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")

    def test_password_change_waits_for_code_and_revokes_old_access(self):
        login = self.post("login", {"username": self.user.username, "password": "old-password-123"})
        token = login.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        request = self.post("password/change", {"old_password": "old-password-123", "new_password1": "new-password-456", "new_password2": "new-password-456"})
        self.assertEqual(request.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-password-123"))
        self.code = self.mail.call_args.kwargs["context"]["code"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}", HTTP_X_VERIFICATION_CHALLENGE=request.data["challenge_id"])
        self.assertEqual(self.confirm().status_code, 200)
        self.assertEqual(self.client.get(BASE + "profile/").status_code, 401)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-password-456"))

    def test_delivery_failure_rolls_back_challenge_and_uses_verified_email(self):
        self.user.unverified_email = "wrong@example.com"
        self.user.save()
        self.client.force_authenticate(self.user)
        self.mail.side_effect = RuntimeError("mail failed")
        result = self.post("password/change", {"old_password": "old-password-123", "new_password1": "new-password-456", "new_password2": "new-password-456"})
        self.assertEqual(result.status_code, 503)
        self.assertEqual(self.mail.call_args.kwargs["recipient"], "user@example.com")
        self.assertFalse(VerificationChallenge.objects.filter(user=self.user).exists())
        self.assertNotIn("pending_password_hash", self.client.session)

    def test_account_change_invalidates_challenge(self):
        challenge = self.start(VerificationReason.PASSWORD_RECOVERY)
        self.user.set_password("changed-elsewhere-123")
        self.user.save()
        self.assertEqual(self.confirm().status_code, 400)
        challenge.refresh_from_db()
        self.assertIsNotNone(challenge.closed_at)

    def test_current_requires_auth_and_returns_only_own_challenge(self):
        self.start(VerificationReason.EMAIL_UPDATE, email="new@example.com")
        self.assertEqual(self.client.get(BASE + "verification/current/").status_code, 401)
        self.client.force_authenticate(self.user)
        self.assertTrue(self.client.get(BASE + "verification/current/").data["pending"])
        other = User.objects.create_user(username="other", email="other@example.com")
        self.client.force_authenticate(other)
        self.assertFalse(self.client.get(BASE + "verification/current/").data["pending"])

    def test_signup_login_resumes_challenge_without_session_state(self):
        self.user.email_verified = False
        self.user.save()
        challenge = self.start()
        response = self.post("login", {"username": self.user.username, "password": "old-password-123"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["challenge_id"], str(challenge.pk))
        self.assertNotIn("pending_user_id", self.client.session)
        self.mail.assert_called_once()

    def test_signup_endpoint_creates_challenge_and_does_not_delete_previous_user(self):
        payload = {"username": "new-user", "email": "new@example.com", "firstname": "New", "lastname": "User", "phone_number": "+306912345678", "password": "new-password-456", "password2": "new-password-456"}
        result = self.post("register", payload)
        self.assertEqual(result.status_code, 201)
        challenge = VerificationChallenge.objects.get(pk=result.data["challenge_id"])
        self.assertEqual(challenge.reason, VerificationReason.SIGNUP)
        self.assertFalse(challenge.user.email_verified)
        self.assertNotIn("pending_user_id", self.client.session)
        self.assertEqual(self.post("register", payload).status_code, 400)
        self.assertTrue(User.objects.filter(pk=challenge.user_id).exists())

    def test_signup_delivery_failure_rolls_back_user(self):
        self.mail.side_effect = RuntimeError("mail failed")
        result = self.post("register", {"username": "new-user", "email": "new@example.com", "firstname": "New", "lastname": "User", "phone_number": "+306912345678", "password": "new-password-456", "password2": "new-password-456"})
        self.assertEqual(result.status_code, 503)
        self.assertFalse(User.objects.filter(username="new-user").exists())

    def test_recovery_start_and_expiring_reset_token(self):
        result = self.post("password/recover", {"email": self.user.email})
        self.assertEqual(result.status_code, 200)
        self.client.credentials(HTTP_X_VERIFICATION_CHALLENGE=result.data["challenge_id"])
        self.code = self.mail.call_args.kwargs["context"]["code"]
        confirmed = self.confirm()
        self.assertEqual(confirmed.status_code, 200)
        VerificationChallenge.objects.filter(pk=result.data["challenge_id"]).update(expires_at=timezone.now())
        reset = self.post("password/reset", {"new_password1": "new-password-456", "new_password2": "new-password-456", "reset_token": confirmed.data["reset_token"]})
        self.assertEqual(reset.status_code, 400)

    def test_code_from_another_challenge_cannot_verify(self):
        first = self.start()
        first_code = self.code
        self.post("verification/cancel")
        with patch("accounts.services.challenges.secrets.randbelow", return_value=(int(first_code) + 1) % 1000000):
            self.start(VerificationReason.EMAIL_UPDATE, email="new@example.com")
        self.assertEqual(self.confirm(first_code).status_code, 400)
        self.assertEqual(self.confirm().status_code, 200)

    def test_purge_removes_only_expired_or_closed_challenges(self):
        from django.core.management import call_command
        from io import StringIO
        old = self.start()
        self.post("verification/cancel")
        active = self.start()
        call_command("purge_verification_challenges", stdout=StringIO())
        self.assertFalse(VerificationChallenge.objects.filter(pk=old.pk).exists())
        self.assertTrue(VerificationChallenge.objects.filter(pk=active.pk).exists())

    def test_html_recovery_and_reset_use_challenges(self):
        browser = Client()
        with self.captureOnCommitCallbacks(execute=True):
            response = browser.post("/accounts/password-recover/", {"email": self.user.email})
        self.assertEqual(response.status_code, 302)
        identifier = response.cookies["open_spots_verification"].value
        self.assertTrue(response.cookies["open_spots_verification"]["httponly"])
        self.assertNotIn("pending_user_id", browser.session)
        page = browser.get("/accounts/confirm-code/")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, identifier)
        code = self.mail.call_args.kwargs["context"]["code"]
        verified = browser.post("/accounts/confirm-code/", {"code": code, "challenge_id": identifier})
        self.assertEqual(verified.status_code, 302)
        self.assertIn("open_spots_reset", verified.cookies)
        reset = browser.post("/accounts/reset-password/", {"new_password1": "new-password-456", "new_password2": "new-password-456"})
        self.assertEqual(reset.status_code, 302)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-password-456"))

    def test_html_profile_email_change_uses_challenge(self):
        browser = Client()
        browser.force_login(self.user)
        response = browser.post("/accounts/profile/", {"email": "new@example.com"})
        self.assertEqual(response.status_code, 302)
        identifier = response.cookies["open_spots_verification"].value
        code = self.mail.call_args.kwargs["context"]["code"]
        confirmed = browser.post("/accounts/confirm-code/", {"code": code, "challenge_id": identifier})
        self.assertEqual(confirmed.status_code, 302)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")

    def test_html_cancel_closes_challenge(self):
        challenge = self.start()
        browser = Client()
        response = browser.post("/accounts/cancel-verification/", {"challenge_id": str(challenge.pk)})
        self.assertEqual(response.status_code, 302)
        challenge.refresh_from_db()
        self.assertIsNotNone(challenge.closed_at)
