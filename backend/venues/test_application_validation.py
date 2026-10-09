from django.test import TestCase

from venues.api.serializers import VenueApplicationSerializer


class VenueApplicationValidationTests(TestCase):
    def setUp(self):
        self.payload = {
            "venue_name": "Example Venue", "venue_type": "restaurant", "location": "Athens",
            "phone": "+302101234567", "admin_username": "venueowner",
            "admin_email": "owner@example.com", "admin_firstname": "Alex",
            "admin_lastname": "Owner", "admin_phone": "+306991234567",
            "password": "Example-password-42",
        }

    def test_owner_names_follow_user_validation(self):
        for field in ("admin_firstname", "admin_lastname"):
            for invalid in ("Alex123", "A" * 31, "Alex\x00"):
                with self.subTest(field=field, invalid=invalid):
                    serializer = VenueApplicationSerializer(data={**self.payload, field: invalid})
                    self.assertFalse(serializer.is_valid())
                    self.assertIn(field, serializer.errors)

    def test_phone_numbers_follow_signup_validation(self):
        for field in ("admin_phone", "phone"):
            for invalid in ("abc", "123", "1" * 16):
                with self.subTest(field=field, invalid=invalid):
                    serializer = VenueApplicationSerializer(data={**self.payload, field: invalid})
                    self.assertFalse(serializer.is_valid())
                    self.assertIn(field, serializer.errors)

    def test_valid_owner_account_is_created(self):
        serializer = VenueApplicationSerializer(data=self.payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        application = serializer.save()
        self.assertEqual(application.owner_user.firstname, "Alex")
        self.assertEqual(application.owner_user.phone_number, "+306991234567")
        self.assertTrue(application.owner_user.check_password(self.payload["password"]))

    def test_application_notes_are_not_published_when_approved(self):
        from unittest.mock import patch
        from django.contrib import admin
        from django.test import RequestFactory
        from venues.admin import VenueApplicationAdmin
        from venues.models import Venue, VenueApplication

        serializer = VenueApplicationSerializer(data={**self.payload, "description": "Notes for the reviewers."})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        application = serializer.save()
        model_admin = VenueApplicationAdmin(VenueApplication, admin.site)
        request = RequestFactory().post("/admin/venues/venueapplication/")
        request.user = application.owner_user
        with patch.object(model_admin, "message_user"):
            model_admin.mark_as_approved(request, VenueApplication.objects.filter(pk=application.pk))
        application.refresh_from_db()
        self.assertEqual(application.status, "approved")
        self.assertEqual(application.description, "Notes for the reviewers.")
        self.assertEqual(Venue.objects.get(owner=application.owner_user).description, "")
        form = model_admin.get_form(request)
        self.assertEqual(form.base_fields["description"].label, "Application notes")
