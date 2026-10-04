
from unittest.mock import patch

from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import DeviceSession

User = get_user_model()


@override_settings(
    SECURITY_ALLOWED_CORS_ORIGINS=["http://localhost:5173"],
)
class CsrfEnforcementTests(TestCase):
    csrf_protected_posts = (
        ("/api/v1/accounts/login/", {"username": "x", "password": "x"}),
        ("/api/v1/accounts/login/2fa/", {"code": "000000"}),
        ("/api/token/refresh/", {}),
        ("/api/v1/accounts/logout/", {}),
        ("/api/v1/accounts/register/", {}),
        ("/api/v1/accounts/password/recover/", {"email": "nobody@example.com"}),
        ("/api/v1/accounts/password/reset/", {}),
        ("/api/v1/accounts/verification/resend/", {}),
        ("/api/v1/accounts/verification/confirm/", {"code": "000000"}),
        ("/api/v1/accounts/verification/cancel/", {}),
        ("/api/v1/venues/verification/send/", {"email": "nobody@example.com"}),
        ("/api/v1/venues/verification/confirm/", {"code": "000000"}),
        ("/api/v1/venues/apply/", {}),
    )

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def test_cookie_backed_api_posts_reject_missing_csrf_token(self):
        for url, payload in self.csrf_protected_posts:
            with self.subTest(url=url):
                response = self.client.post(url, payload, content_type="application/json")
                self.assertEqual(response.status_code, 403)

    def test_cookie_backed_api_post_rejects_invalid_csrf_token(self):
        self.client.get("/api/v1/csrf/")
        response = self.client.post(
            "/api/v1/accounts/logout/",
            {},
            content_type="application/json",
            HTTP_X_CSRFTOKEN="invalid",
        )
        self.assertEqual(response.status_code, 403)

    def test_cookie_backed_api_post_accepts_matching_csrf_token(self):
        token = self.client.get("/api/v1/csrf/").json()["csrfToken"]
        response = self.client.post(
            "/api/v1/accounts/logout/",
            {},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
            HTTP_ORIGIN="http://localhost:5173",
        )
        self.assertEqual(response.status_code, 200)

    def test_api_rejects_untrusted_origin_even_with_valid_csrf_token(self):
        token = self.client.get("/api/v1/csrf/").json()["csrfToken"]
        response = self.client.post(
            "/api/v1/accounts/logout/",
            {},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
            HTTP_ORIGIN="https://evil.example",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.content, b"CORS origin is not allowed.")


class AccountsAPITestCase(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
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

    # Verification lifecycle coverage has moved to test_challenges.py.

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
