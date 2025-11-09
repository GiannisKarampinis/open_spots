from django.test import TestCase
from venues.models import Reservation, Table
from django.utils import timezone
from datetime import timedelta

class ReservationModelTests(TestCase):
    def setUp(self):
        self.table = Table.objects.create(number=1, capacity=4)
        self.reservation = Reservation.objects.create(
            table=self.table,
            name="John Doe",
            date=timezone.now().date(),
            time=timezone.now().time(),
            duration=60,
        )

    def test_reservation_is_available(self):
        overlapping = self.reservation.is_available(self.reservation.date, self.reservation.time)
        self.assertFalse(overlapping)
