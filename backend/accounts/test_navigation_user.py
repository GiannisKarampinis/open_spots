from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.api.serializers import UserNavigationSerializer


class NavigationUserTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="nav-user", password="test-password",
            firstname="Ada", lastname="Lovelace", email="ada@example.com",
            phone_number="+306912345678", email_verified=True,
        )

    def test_navigation_requires_authentication(self):
        response = self.client.get("/api/v1/accounts/navigation/")
        self.assertEqual(response.status_code, 401)

    def test_navigation_returns_only_current_users_display_fields(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/v1/accounts/navigation/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {
            "username": "nav-user", "full_name": "Ada Lovelace",
        })

    def test_login_does_not_return_profile_details(self):
        response = self.client.post("/api/v1/accounts/login/", {
            "username": "nav-user", "password": "test-password",
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"], {
            "username": "nav-user", "full_name": "Ada Lovelace",
        })

    def test_empty_name_does_not_duplicate_username(self):
        self.user.firstname = ""
        self.user.lastname = ""
        self.assertEqual(UserNavigationSerializer(self.user).data, {
            "username": "nav-user", "full_name": "",
        })
