from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from accounts.api.serializers import (
    UserLoginSerializer, UserRegistrationSerializer,
    UserPasswordChangeSerializer, UserPasswordResetSerializer,
)
from venues.api.serializers import VenueApplicationSerializer


class PasswordWhitespaceTests(SimpleTestCase):
    def password_fields(self):
        for serializer_class in (
            UserLoginSerializer, UserRegistrationSerializer,
            UserPasswordChangeSerializer, UserPasswordResetSerializer,
            VenueApplicationSerializer,
        ):
            for name, field in serializer_class().fields.items():
                if "password" in name:
                    yield serializer_class.__name__, name, field

    def test_passwords_trim_outer_spaces_but_preserve_internal_spaces(self):
        for serializer, name, field in self.password_fields():
            with self.subTest(serializer=serializer, field=name):
                self.assertEqual(field.run_validation("  Example passphrase 42!  "), "Example passphrase 42!")

    def test_whitespace_only_passwords_are_rejected(self):
        for serializer, name, field in self.password_fields():
            with self.subTest(serializer=serializer, field=name):
                with self.assertRaises(ValidationError):
                    field.run_validation("   ")
