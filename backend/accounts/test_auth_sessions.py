from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import DeviceSession


class AuthenticationSessionTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = get_user_model().objects.create_user(
            username="session-user", email="session@example.com",
            password="password-123", email_verified=True,
        )

    def test_password_login_issues_tokens_in_one_step(self):
        response = self.client.post("/api/v1/accounts/login/", {
            "username": self.user.username, "password": "password-123",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertFalse(response.data.get("requires_verification", False))
        self.assertEqual(DeviceSession.objects.filter(user=self.user, revoked_at__isnull=True).count(), 1)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(self.client.get("/api/v1/accounts/profile/").status_code, 200)

    def test_revoking_device_immediately_rejects_access_and_refresh_tokens(self):
        session = DeviceSession.objects.create(user=self.user)
        refresh = RefreshToken.for_user(self.user)
        refresh["device_session_id"] = str(session.pk)
        attacker = APIClient()
        attacker.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
        self.assertEqual(attacker.get("/api/v1/accounts/profile/").status_code, 200)
        self.client.force_authenticate(user=self.user)
        result = self.client.post(f"/api/v1/accounts/devices/{session.pk}/revoke/", {}, format="json")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(attacker.get("/api/v1/accounts/profile/").status_code, 401)
        attacker.cookies["open_spots_refresh"] = str(refresh)
        csrf = attacker.get("/api/v1/csrf/").json()["csrfToken"]
        self.assertEqual(attacker.post("/api/token/refresh/", {}, format="json", HTTP_X_CSRFTOKEN=csrf).status_code, 401)

    def test_google_handoff_issues_tokens_for_authenticated_session(self):
        self.client.force_login(self.user)
        response = self.client.get("/api/v1/accounts/social/session/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("open_spots_refresh", response.cookies)

    def test_google_handoff_rejects_anonymous_sessions(self):
        self.assertEqual(self.client.get("/api/v1/accounts/social/session/").status_code, 401)

    def test_access_token_requires_a_device_session(self):
        access = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(self.client.get("/api/v1/accounts/profile/").status_code, 401)
