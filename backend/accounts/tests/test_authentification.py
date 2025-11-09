from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model

User = get_user_model()

class AuthenticationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="test@example.com", password="pass1234")

    def test_login_valid_user(self):
        response = self.client.post(reverse("login"), {"email": "test@example.com", "password": "pass1234"})
        self.assertEqual(response.status_code, 302)  # Redirect on success

    def test_login_invalid_user(self):
        response = self.client.post(reverse("login"), {"email": "bad@example.com", "password": "wrong"})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Invalid credentials")
