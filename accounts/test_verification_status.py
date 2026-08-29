from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from emails_manager.models import EmailVerificationCode


User = get_user_model()


class VerificationStatusAPIViewTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="status-user",
            email="status@example.com",
            password="test-password",
        )
        session = self.client.session
        session["pending_user_id"] = self.user.id
        session["verification_reason"] = "signup"
        session.save()

    def tearDown(self):
        cache.clear()

    @patch("accounts.api.views.send_verification_code")
    def test_status_does_not_send_code_when_none_exists(self, send_code):
        response = self.client.get("/api/v1/accounts/verification/status/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["remaining_seconds"], 0)
        self.assertTrue(response.data["is_expired"])
        send_code.assert_not_called()
        self.assertFalse(EmailVerificationCode.objects.filter(user=self.user).exists())
        self.assertNotIn("code_already_sent", self.client.session)

    @patch("accounts.api.views.send_verification_code")
    def test_resend_is_rejected_during_cooldown(self, send_code):
        EmailVerificationCode.objects.create(user=self.user, code="123456")

        response = self.client.post("/api/v1/accounts/verification/resend/", {})

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertGreater(response.data["retry_after"], 0)
        self.assertLessEqual(response.data["retry_after"], 60)
        send_code.assert_not_called()

    @patch("accounts.api.views.send_verification_code")
    def test_resend_is_strictly_throttled_per_pending_user(self, send_code):
        EmailVerificationCode.objects.create(user=self.user, code="123456")

        responses = [
            self.client.post("/api/v1/accounts/verification/resend/", {})
            for _ in range(4)
        ]

        self.assertEqual(responses[2].status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("retry_after", responses[2].data)
        self.assertEqual(responses[3].status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertNotIn("retry_after", responses[3].data)
        send_code.assert_not_called()
