from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from venues.models import Reservation, Venue


class E2ECleanupViewTests(TestCase):
    @override_settings(DEBUG=True)
    def test_delete_reservation_matches_current_reservation_fields(self):
        user = get_user_model().objects.create_user(
            username="e2e-cleanup-user",
            email="e2e-cleanup@example.test",
        )
        venue = Venue.objects.create(
            name="E2E Cleanup Venue",
            kind="restaurant",
            location="Athens",
        )
        reservation = Reservation.objects.create(
            user=user,
            venue=venue,
            firstname="Jim",
            lastname="Booki",
            email="jim@example.test",
            phone="6971234567",
            date=date(2030, 10, 22),
            time=time(19, 0),
            guests=3,
        )

        response = self.client.post(
            "/venues/test-utils/delete-reservation/",
            {
                "user": user.username,
                "name": "Jim Booki",
                "date": "2030-10-22",
                "time": "19:00",
                "venue_id": str(venue.pk),
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.json()["deleted"], 1)
        self.assertFalse(Reservation.objects.filter(pk=reservation.pk).exists())
