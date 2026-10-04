from accounts.models import VerificationReason
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient

from accounts.models import VerificationChallenge
from accounts.services.challenges import begin_challenge
from venues.models import VenueApplication


class VenueChallengeTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        mail_patch = patch("accounts.services.challenges.send_email_with_template")
        self.mail = mail_patch.start()
        self.addCleanup(mail_patch.stop)
        self.email = "applicant@example.com"
        self.payload = {
            "venue_name": "Challenge Cafe", "venue_type": VenueApplication._meta.get_field("venue_type").choices[0][0],
            "location": "Athens", "description": "Cafe", "phone": "+306912345678",
            "admin_username": "applicant", "admin_email": self.email, "admin_firstname": "First",
            "admin_lastname": "Last", "admin_phone": "+306912345678", "password": "password-strong-123",
        }

    def send(self, identifier=""):
        return self.client.post("/api/v1/venues/verification/send/", {"email": self.email, "challenge_id": identifier}, format="json")

    def start(self):
        response = self.send()
        self.assertEqual(response.status_code, 200)
        self.identifier = response.data["challenge_id"]
        self.code = self.mail.call_args.kwargs["context"]["code"]
        return VerificationChallenge.objects.get(pk=self.identifier)

    def confirm(self, code=None):
        return self.client.post("/api/v1/venues/verification/confirm/", {"challenge_id": self.identifier, "code": self.code if code is None else code}, format="json")

    def apply(self, token="", **overrides):
        return self.client.post("/api/v1/venues/apply/", {**self.payload, "challenge_id": self.identifier, "verification_token": token, **overrides}, format="json")

    def test_challenge_proof_is_required_and_consumed_on_application(self):
        challenge = self.start()
        self.assertNotEqual(challenge.code_hash, self.code)
        self.assertNotIn("venue_pending_email", self.client.session)
        self.assertEqual(self.apply().status_code, 400)
        verified = self.confirm()
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(self.confirm().status_code, 400)
        self.assertEqual(self.apply().status_code, 400)
        self.assertEqual(self.apply("wrong-token").status_code, 400)
        proof = verified.data["verification_token"]
        result = self.apply(proof)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(VenueApplication.objects.count(), 1)
        challenge.refresh_from_db()
        self.assertIsNotNone(challenge.closed_at)
        self.assertEqual(challenge.completion_token_hash, "")
        self.assertEqual(self.apply(proof, admin_username="second").status_code, 400)

    def test_venue_completion_token_cannot_reset_password(self):
        challenge = self.start()
        token = self.confirm().data["verification_token"]
        response = self.client.post("/api/v1/accounts/password/reset/", {
            "challenge_id": self.identifier, "reset_token": token,
            "new_password1": "new-password-456", "new_password2": "new-password-456",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        challenge.refresh_from_db()
        self.assertIsNone(challenge.closed_at)
        self.assertEqual(self.apply(token).status_code, 201)

    def test_recovery_completion_token_cannot_submit_venue_application(self):
        user = get_user_model().objects.create_user(
            username="recovering", email=self.email, password="old-password-123",
        )
        with self.captureOnCommitCallbacks(execute=True):
            challenge = begin_challenge(user, VerificationReason.PASSWORD_RECOVERY, self.email)
        self.identifier = str(challenge.pk)
        code = self.mail.call_args.kwargs["context"]["code"]
        verified = self.client.post("/api/v1/accounts/verification/confirm/", {
            "challenge_id": self.identifier, "code": code,
        }, format="json")
        self.assertEqual(verified.status_code, 200)
        token = verified.data["reset_token"]
        self.assertEqual(self.apply(token).status_code, 400)
        self.assertFalse(VenueApplication.objects.exists())
        response = self.client.post("/api/v1/accounts/password/reset/", {
            "challenge_id": self.identifier, "reset_token": token,
            "new_password1": "new-password-456", "new_password2": "new-password-456",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        challenge.refresh_from_db()
        self.assertEqual(challenge.completion_token_hash, "")

    def test_proof_must_match_application_email(self):
        challenge = self.start()
        token = self.confirm().data["verification_token"]
        self.assertEqual(self.apply(token, admin_email="other@example.com").status_code, 400)
        challenge.refresh_from_db()
        self.assertIsNone(challenge.closed_at)
        self.assertFalse(VenueApplication.objects.exists())

    def test_failed_application_validation_keeps_proof_usable(self):
        self.start()
        token = self.confirm().data["verification_token"]
        self.assertEqual(self.apply(token, venue_name="").status_code, 400)
        self.assertEqual(self.apply(token).status_code, 201)

    def test_expired_proof_and_legacy_session_flags_are_rejected(self):
        challenge = self.start()
        token = self.confirm().data["verification_token"]
        VerificationChallenge.objects.filter(pk=challenge.id).update(expires_at=timezone.now())
        expired = self.apply(token)
        self.assertEqual(expired.status_code, 400)
        self.assertIn("verification_required", expired.data)
        session = self.client.session
        session["venue_email_verified"] = True
        session["venue_verified_email"] = self.email
        session.save()
        self.identifier = ""
        self.assertEqual(self.apply().status_code, 400)

    def test_resend_preserves_challenge_and_invalidates_old_code(self):
        challenge = self.start()
        self.assertEqual(self.send(self.identifier).status_code, 429)
        VerificationChallenge.objects.filter(pk=challenge.pk).update(last_sent_at=timezone.now() - timezone.timedelta(seconds=46))
        with patch("accounts.services.challenges.secrets.randbelow", return_value=(int(self.code) + 1) % 1000000):
            result = self.send(self.identifier)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["challenge_id"], self.identifier)
        self.assertEqual(self.confirm().status_code, 400)
        self.assertEqual(self.confirm(self.mail.call_args.kwargs["context"]["code"]).status_code, 200)

    def test_attempts_persist_across_clients(self):
        self.start()
        for _ in range(5):
            result = self.confirm("bad-code")
        self.assertEqual(result.status_code, 429)
        self.client = APIClient()
        self.assertEqual(self.confirm().status_code, 429)

    def test_different_challenges_for_same_email_do_not_share_codes(self):
        first = self.start()
        old_code = self.code
        with patch("accounts.services.challenges.secrets.randbelow", return_value=(int(old_code) + 1) % 1000000):
            second = self.start()
        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(self.confirm(old_code).status_code, 400)
        self.assertEqual(self.confirm().status_code, 200)

    def test_mail_failure_leaves_no_challenge(self):
        self.mail.side_effect = RuntimeError("Delivery failed")
        self.assertEqual(self.send().status_code, 503)
        self.assertFalse(VerificationChallenge.objects.exists())

    def test_account_challenge_is_rejected_by_venue_endpoints(self):
        user = get_user_model().objects.create_user(username="other", email="other@example.com")
        challenge = begin_challenge(user, VerificationReason.SIGNUP, user.email)
        self.identifier = str(challenge.pk)
        self.code = self.mail.call_args.kwargs["context"]["code"]
        self.assertEqual(self.confirm().status_code, 400)
        self.assertEqual(self.send(self.identifier).status_code, 400)

    def test_send_limit_cannot_be_reset_by_a_new_browser_session(self):
        for _ in range(3):
            self.assertEqual(self.send().status_code, 200)
        self.client = APIClient()
        self.assertEqual(self.send().status_code, 429)
