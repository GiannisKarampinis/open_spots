from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from emails_manager.models import EmailVerificationCode

User = get_user_model()


class AccountsAPITestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="apiuser",
            email="apiuser@example.com",
            password="pass1234",
        )
        self.url = "/api/v1/accounts/profile/"
        self.register_url = "/api/v1/accounts/register/"
        self.verification_confirm_url = "/api/v1/accounts/verification/confirm/"
        self.verification_resend_url = "/api/v1/accounts/verification/resend/"
        self.password_recover_url = "/api/v1/accounts/password/recover/"
        self.password_reset_url = "/api/v1/accounts/password/reset/"
        self.password_change_url = "/api/v1/accounts/password/change/"

    def test_profile_requires_authentication(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_returns_authenticated_user_data(self):
        self.client.login(username="apiuser", password="pass1234")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "apiuser@example.com")
        self.assertEqual(response.data["id"], self.user.id)

    def test_profile_allows_partial_update(self):
        self.client.login(username="apiuser", password="pass1234")
        response = self.client.patch(self.url, {"firstname": "Api"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.firstname, "Api")

    def test_register_creates_customer_account(self):
        payload = {
            "username": "newapiuser",
            "email": "newapiuser@example.com",
            "firstname": "New",
            "lastname": "User",
            "phone_number": "+1234567890",
            "password": "strong-password-123",
            "password2": "strong-password-123",
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "newapiuser@example.com")
        self.assertEqual(response.data["username"], "newapiuser")
        self.assertFalse(response.data.get("email_verified", True))

    def test_confirmation_fails_without_pending_session(self):
        response = self.client.post(self.verification_confirm_url, {"code": "123456"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_confirmation_succeeds_with_valid_code(self):
        verification_user = User.objects.create_user(
            username="verifyuser",
            email="verifyuser@example.com",
            password="pass1234",
        )
        code_obj = EmailVerificationCode.objects.create(user=verification_user, code="123456")
        session = self.client.session
        session["pending_user_id"] = verification_user.id
        session["verification_reason"] = "signup"
        session.save()

        response = self.client.post(self.verification_confirm_url, {"code": "123456"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        verification_user.refresh_from_db()
        self.assertTrue(verification_user.email_verified)

    def test_password_recovery_allows_reset_after_verification(self):
        recovery_email = "apiuser@example.com"
        response = self.client.post(self.password_recover_url, {"email": recovery_email}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        session = self.client.session
        self.assertEqual(session["pending_user_id"], self.user.id)
        self.assertEqual(session["verification_reason"], "password_recovery")

        # Simulate successful code confirmation
        session["password_recovery_verified"] = True
        session.save()
        response = self.client.post(self.password_reset_url, {"new_password1": "newstrongpass123", "new_password2": "newstrongpass123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newstrongpass123"))

    def test_profile_requires_authentication(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_returns_authenticated_user_data(self):
        self.client.login(username="apiuser", password="pass1234")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "apiuser@example.com")
        self.assertEqual(response.data["id"], self.user.id)

    def test_profile_allows_partial_update(self):
        self.client.login(username="apiuser", password="pass1234")
        response = self.client.patch(self.url, {"firstname": "Api"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.firstname, "Api")

    def test_register_creates_customer_account(self):
        payload = {
            "username": "newapiuser",
            "email": "newapiuser@example.com",
            "firstname": "New",
            "lastname": "User",
            "phone_number": "+1234567890",
            "password": "strong-password-123",
            "password2": "strong-password-123",
        }
        response = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "newapiuser@example.com")
        self.assertEqual(response.data["username"], "newapiuser")
        self.assertFalse(response.data.get("email_verified", True))
