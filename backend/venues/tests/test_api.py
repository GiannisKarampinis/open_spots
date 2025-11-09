from rest_framework.test import APITestCase
from django.urls import reverse
from venues.models import Table

class ReservationAPITests(APITestCase):
    def setUp(self):
        self.table = Table.objects.create(number=1, capacity=4)

    def test_get_availability(self):
        url = reverse("availability-list")
        response = self.client.get(url, {"date": "2025-11-07"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("tables", response.data)
