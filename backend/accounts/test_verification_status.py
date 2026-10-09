from accounts.models import VerificationReason
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import VerificationChallenge
from accounts.services.challenges import begin_challenge


class VerificationStatusAPIViewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = get_user_model().objects.create_user(username="status-user", email="status@example.com", password="test-password")
        self.mail_patch = patch("accounts.services.challenges.send_email_with_template")
        self.mail = self.mail_patch.start()
        self.addCleanup(self.mail_patch.stop)
        self.challenge = begin_challenge(self.user, VerificationReason.SIGNUP, self.user.email)
        self.client.credentials(HTTP_X_VERIFICATION_CHALLENGE=str(self.challenge.pk))
        self.mail.reset_mock()

    def test_status_does_not_send_code_when_code_expired(self):
        VerificationChallenge.objects.filter(pk=self.challenge.pk).update(code_expires_at=timezone.now())
        response = self.client.get("/api/v1/accounts/verification/status/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["pending"])
        self.assertEqual(response.data["remaining_seconds"], 0)
        self.assertTrue(response.data["is_expired"])
        self.mail.assert_not_called()
        self.assertNotIn("pending_user_id", self.client.session)

    def test_resend_is_rejected_during_cooldown(self):
        response = self.client.post("/api/v1/accounts/verification/resend/", {})
        self.assertEqual(response.status_code, 429)
        self.assertGreater(response.data["retry_after"], 0)
        self.assertLessEqual(response.data["retry_after"], 60)
        self.mail.assert_not_called()

    def test_resend_is_strictly_throttled_per_pending_user(self):
        responses = [self.client.post("/api/v1/accounts/verification/resend/", {}) for _ in range(4)]
        self.assertEqual(responses[2].status_code, 429)
        self.assertIn("retry_after", responses[2].data)
        self.assertEqual(responses[3].status_code, 429)
        self.assertNotIn("retry_after", responses[3].data)
        self.mail.assert_not_called()
