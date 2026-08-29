from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from emails_manager.models import EmailVerificationCode


User = get_user_model()


class VerificationStatusAPIViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="status-user",
            email="status@example.com",
            password="test-password",
        )
        session = self.client.session
        session["pending_user_id"] = self.user.id
        session["verification_reason"] = "signup"
        session.save()

    @patch("accounts.api.views.send_verification_code")
    def test_status_does_not_send_code_when_none_exists(self, send_code):
        response = self.client.get("/api/v1/accounts/verification/status/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["remaining_seconds"], 0)
        self.assertTrue(response.data["is_expired"])
        send_code.assert_not_called()
        self.assertFalse(EmailVerificationCode.objects.filter(user=self.user).exists())
        self.assertNotIn("code_already_sent", self.client.session)
