from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import DeviceSession
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

    def test_blacklisted_refresh_token_returns_401_during_rotation_race(self):
        device_session = DeviceSession.objects.create(user=self.user)
        refresh = RefreshToken.for_user(self.user)
        refresh["device_session_id"] = str(device_session.id)
        refresh.blacklist()
        self.client.cookies["open_spots_refresh"] = str(refresh)

        with patch("accounts.api.views._refresh_device_session", return_value=device_session):
            response = self.client.post("/api/token/refresh/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_uses_httponly_refresh_cookie_and_device_session(self):
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])

        response = self.client.post(
            "/api/v1/accounts/login/",
            {"username": "apiuser", "password": "pass1234"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn("open_spots_refresh", response.cookies)
        self.assertTrue(response.cookies["open_spots_refresh"]["httponly"])
        self.assertEqual(DeviceSession.objects.filter(user=self.user, revoked_at__isnull=True).count(), 1)

    def test_cookie_refresh_rotates_token_without_request_body(self):
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        login_response = self.client.post(
            "/api/v1/accounts/login/",
            {"username": "apiuser", "password": "pass1234"},
            format="json",
        )
        original_refresh = login_response.cookies["open_spots_refresh"].value

        refresh_response = self.client.post("/api/token/refresh/", {}, format="json")

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_response.data)
        self.assertNotIn("refresh", refresh_response.data)
        self.assertIn("open_spots_refresh", refresh_response.cookies)
        self.assertNotEqual(refresh_response.cookies["open_spots_refresh"].value, original_refresh)

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
        self.assertEqual(response.data["user"]["email"], "newapiuser@example.com")
        self.assertEqual(response.data["user"]["username"], "newapiuser")
        self.assertFalse(response.data["user"].get("email_verified", True))

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

    def test_confirmation_locks_after_five_invalid_codes(self):
        self.user.email_verified = False
        self.user.save(update_fields=["email_verified"])
        valid_code = EmailVerificationCode.objects.create(user=self.user, code="123456")
        session = self.client.session
        session["pending_user_id"] = self.user.id
        session["verification_reason"] = "signup"
        session.save()

        for attempt in range(5):
            response = self.client.post(
                self.verification_confirm_url,
                {"code": "000000"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(self.client.session["verification_attempts"], 5)
        self.assertIn("verification_locked_until", self.client.session)

        locked_response = self.client.post(
            self.verification_confirm_url,
            {"code": valid_code.code},
            format="json",
        )
        self.assertEqual(locked_response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertTrue(EmailVerificationCode.objects.filter(pk=valid_code.pk).exists())

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

    def test_password_reset_revokes_existing_device_sessions(self):
        device_session = DeviceSession.objects.create(user=self.user)
        refresh = RefreshToken.for_user(self.user)
        refresh["device_session_id"] = str(device_session.id)
        self.client.cookies["open_spots_refresh"] = str(refresh)
        session = self.client.session
        session["pending_user_id"] = self.user.id
        session["verification_reason"] = "password_recovery"
        session["password_recovery_verified"] = True
        session.save()

        response = self.client.post(
            self.password_reset_url,
            {"new_password1": "newstrongpass123", "new_password2": "newstrongpass123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        device_session.refresh_from_db()
        self.assertIsNotNone(device_session.revoked_at)
        self.assertEqual(response.cookies["open_spots_refresh"]["max-age"], 0)

    def test_password_change_waits_for_verification_and_revokes_sessions(self):
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        login_response = self.client.post(
            "/api/v1/accounts/login/",
            {"username": "apiuser", "password": "pass1234"},
            format="json",
        )
        old_access = login_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")

        request_response = self.client.post(
            self.password_change_url,
            {
                "old_password": "pass1234",
                "new_password1": "changed-password-123",
                "new_password2": "changed-password-123",
            },
            format="json",
        )

        self.assertEqual(request_response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("pass1234"))
        self.assertFalse(self.user.check_password("changed-password-123"))
        self.assertNotEqual(
            self.client.session["pending_password_hash"],
            "changed-password-123",
        )

        code = EmailVerificationCode.objects.get(user=self.user).code
        confirm_response = self.client.post(
            self.verification_confirm_url,
            {"code": code},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.assertTrue(confirm_response.data["session_invalidated"])
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("changed-password-123"))
        self.assertFalse(DeviceSession.objects.filter(user=self.user, revoked_at__isnull=True).exists())
        self.assertEqual(confirm_response.cookies["open_spots_refresh"]["max-age"], 0)

        protected_response = self.client.get(self.url)
        self.assertEqual(protected_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_expired_pending_password_change_is_rejected(self):
        code = EmailVerificationCode.objects.create(user=self.user, code="123456")
        session = self.client.session
        session["pending_user_id"] = self.user.id
        session["verification_reason"] = "password_change"
        session["pending_password_hash"] = self.user.password
        session["pending_password_expires_at"] = "0"
        session.save()

        response = self.client.post(
            self.verification_confirm_url,
            {"code": code.code},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", response.data["detail"].lower())
        self.assertTrue(EmailVerificationCode.objects.filter(pk=code.pk).exists())

    @patch("accounts.api.views.send_verification_code")
    def test_password_change_uses_verified_email_and_cleans_up_send_failure(self, send_code):
        self.user.email_verified = True
        self.user.unverified_email = "attacker-controlled@example.com"
        self.user.save(update_fields=["email_verified", "unverified_email"])
        self.client.force_authenticate(self.user)

        send_code.side_effect = RuntimeError("email unavailable")
        response = self.client.post(
            self.password_change_url,
            {
                "old_password": "pass1234",
                "new_password1": "changed-password-123",
                "new_password2": "changed-password-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        send_code.assert_called_once_with(
            self.user,
            recipient="apiuser@example.com",
            async_send=False,
        )
        self.assertNotIn("pending_password_hash", self.client.session)
        self.assertNotIn("pending_password_expires_at", self.client.session)
        self.assertFalse(EmailVerificationCode.objects.filter(user=self.user).exists())

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
        self.assertEqual(response.data["user"]["email"], "newapiuser@example.com")
        self.assertEqual(response.data["user"]["username"], "newapiuser")
        self.assertFalse(response.data["user"].get("email_verified", True))
