from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from venues.models import Reservation, Venue


class ReservationSlotTests(APITestCase):
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

    def test_slots_hide_elapsed_times_and_preserve_next_day_slots(self):
        starts = [self.now - timedelta(minutes=30), self.now + timedelta(minutes=30),
                  (self.now + timedelta(days=1)).replace(hour=0)]
        slots = [{"time": start.time(), "slot_date": start.date(),
                  "is_next_day": start.date() != self.now.date(), "offset": index,
                  "is_blocked": False, "is_reserved": False, "is_available": True}
                 for index, start in enumerate(starts)]
        with patch.object(Venue, "get_available_time_slots", return_value=slots):
            response = self.client.get(f"/api/v1/venues/{self.venue.pk}/slots/", {"date": self.now.date().isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([slot["time"] for slot in response.data["slots"]], ["15:30", "00:00"])
        self.assertTrue(response.data["slots"][1]["is_next_day"])
        self.assertEqual(datetime.fromisoformat(response.data["slots"][0]["starts_at"]), starts[1])
