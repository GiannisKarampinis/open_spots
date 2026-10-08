from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from venues.models import Reservation, Venue
from venues.api.dashboard_helpers import _dashboard_reservations_queryset, _dashboard_reservation_counts


class ReservationTimeTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="time-user", password="password")
        self.venue = Venue.objects.create(name="Time Venue", kind="cafe", location="Athens")
        self.client.force_authenticate(self.user)
        self.now = timezone.make_aware(datetime(2026, 10, 6, 15), timezone.get_default_timezone())
        self.clock = patch("django.utils.timezone.now", return_value=self.now)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def reservation(self, start):
        return Reservation.objects.create(user=self.user, venue=self.venue,
            firstname="Time", lastname="User", email="time@example.com", phone="1234567890",
            date=start.date(), time=start.time(), guests=2)

    def test_quick_card_skips_elapsed_today_and_returns_next_reservation(self):
        past = self.reservation(self.now - timedelta(minutes=1))
        future = self.reservation(self.now + timedelta(minutes=1))
        response = self.client.get("/api/v1/venues/")
        self.assertEqual(response.status_code, 200)
        card = response.data["upcoming_reservation"]
        self.assertEqual(card["id"], future.pk)
        self.assertEqual(datetime.fromisoformat(card["starts_at"]), future.starts_at)
        response = self.client.get("/api/v1/reservations/")
        rows = response.data if isinstance(response.data, list) else response.data["results"]
        by_id = {row["id"]: row for row in rows}
        self.assertFalse(by_id[past.pk]["is_upcoming"])
        self.assertTrue(by_id[future.pk]["is_upcoming"])
        self.assertIn("starts_at", by_id[past.pk])

    def test_quick_card_empty_when_only_elapsed_reservations_exist(self):
        self.reservation(self.now - timedelta(minutes=1))
        self.assertIsNone(self.client.get("/api/v1/venues/").data["upcoming_reservation"])

    def test_past_reservation_cannot_be_rescheduled_with_patch_or_put(self):
        reservation = self.reservation(self.now - timedelta(minutes=1))
        for method in (self.client.patch, self.client.put):
            response = method(f"/api/v1/reservations/{reservation.pk}/",
                {"date": "2026-10-07", "time": "16:00"}, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.data["detail"], "Past reservations cannot be edited.")
        reservation.refresh_from_db()
        self.assertEqual(reservation.date, self.now.date())

    def test_future_reservation_can_still_be_edited(self):
        reservation = self.reservation(self.now + timedelta(minutes=1))
        response = self.client.patch(f"/api/v1/reservations/{reservation.pk}/", {"guests": 3}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["guests"], 3)

    def test_dashboard_buckets_and_counts_use_time_on_the_same_day(self):
        past = self.reservation(self.now - timedelta(minutes=1))
        future = self.reservation(self.now + timedelta(minutes=1))
        past_arrival = self.reservation(self.now - timedelta(hours=1))
        past_arrival.status = "accepted"
        past_arrival.save()
        future_arrival = self.reservation(self.now + timedelta(hours=1))
        future_arrival.status = "accepted"
        future_arrival.save()
        self.assertEqual(list(_dashboard_reservations_queryset(self.venue, "requests")), [future])
        self.assertEqual(list(_dashboard_reservations_queryset(self.venue, "arrivals")), [future_arrival])
        self.assertEqual(list(_dashboard_reservations_queryset(self.venue, "history")), [past, past_arrival])
        self.assertEqual(_dashboard_reservation_counts(self.venue), {
            "requests": 1, "unseen_requests": 1, "arrivals": 1, "history": 2,
        })

