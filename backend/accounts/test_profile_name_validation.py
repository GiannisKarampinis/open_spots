from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.api.serializers import UserProfileSerializer


User = get_user_model()


class ProfileNameValidationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="name-validation-user",
            email="name-validation@example.com",
            password="test-password",
            firstname="Existing",
            lastname="User",
        )

    def validate_names(self, firstname, lastname="User"):
        return UserProfileSerializer(
            self.user,
            data={"firstname": firstname, "lastname": lastname},
            partial=True,
        )

    def test_names_are_trimmed(self):
        serializer = self.validate_names("  Giannis  ")

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["firstname"], "Giannis")

    def test_names_are_required_when_supplied(self):
        serializer = self.validate_names("   ")

        self.assertFalse(serializer.is_valid())
        self.assertIn("firstname", serializer.errors)

    def test_names_cannot_exceed_model_limit(self):
        serializer = self.validate_names("A" * 31)

        self.assertFalse(serializer.is_valid())
        self.assertIn("firstname", serializer.errors)

    def test_names_cannot_contain_digits(self):
        serializer = self.validate_names("Giannis2")

        self.assertFalse(serializer.is_valid())
        self.assertEqual(str(serializer.errors["firstname"][0]), "Names cannot contain digits.")

    def test_names_cannot_contain_control_characters(self):
        serializer = self.validate_names("Giannis\u0000")

        self.assertFalse(serializer.is_valid())
        self.assertEqual(
            str(serializer.errors["firstname"][0]),
            "Names cannot contain control characters.",
        )
