from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from emails_manager.models import VenueEmailVerificationCode
from venues.models import Reservation, Venue, WorkingDay

User = get_user_model()


class VenuesAPITestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reservation_user",
            email="reservation_user@example.com",
            password="pass1234",
        )
        self.venue = Venue.objects.create(
            name="Test Venue",
            kind="cafe",
            location="123 Api Street",
            description="Test venue for API",
            is_full=False,
        )
        self.list_url = "/api/v1/venues/"
        self.detail_url = f"/api/v1/venues/{self.venue.id}/"
        self.reservation_url = "/api/v1/reservations/"
        self.send_venue_code_url = "/api/v1/venues/verification/send/"
        self.verify_venue_code_url = "/api/v1/venues/verification/confirm/"
        self.apply_venue_url = "/api/v1/venues/apply/"

    def test_venue_list_is_public(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data["results"]), 1)

    def test_venue_detail_returns_venue(self):
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Test Venue")

    def test_owned_venue_uses_jwt_user_when_session_cookie_is_stale(self):
        stale_session_user = User.objects.create_user(
            username="stale_session_user",
            email="stale_session_user@example.com",
            password="pass1234",
        )
        owner = User.objects.create_user(
            username="venue_owner",
            email="venue_owner@example.com",
            password="pass1234",
            user_type="customer",
        )
        owned_venue = Venue.objects.create(
            name="Owned Venue",
            kind="restaurant",
            location="Owner Street",
            description="Owned by JWT user",
            owner=owner,
        )

        self.client.login(username=stale_session_user.username, password="pass1234")
        access = RefreshToken.for_user(owner).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.get("/api/v1/venues/owned/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], owned_venue.id)

    def test_venue_slots_endpoint_returns_slots(self):
        response = self.client.get(f"{self.detail_url}slots/?date=2030-01-01")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_create_reservation_requires_authentication(self):
        payload = {
            "venue_id": self.venue.id,
            "firstname": "Jane",
            "lastname": "Doe",
            "email": "jane.doe@example.com",
            "phone": "+1234567890",
            "date": "2030-01-01",
            "time": "18:00",
            "guests": 2,
        }
        response = self.client.post(self.reservation_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_create_reservation(self):
        self.client.login(username="reservation_user", password="pass1234")
        payload = {
            "venue_id": self.venue.id,
            "firstname": "Jane",
            "lastname": "Doe",
            "email": "jane.doe@example.com",
            "phone": "+1234567890",
            "date": "2030-01-01",
            "time": "18:00",
            "guests": 2,
        }
        response = self.client.post(self.reservation_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["venue_id"], self.venue.id)
        self.assertEqual(response.data["firstname"], "Jane")
        self.assertEqual(Reservation.objects.count(), 1)

    def test_reservation_detail_is_retrievable_by_owner(self):
        self.client.login(username="reservation_user", password="pass1234")
        reservation = Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
        )
        detail_url = f"/api/v1/reservations/{reservation.id}/"
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], reservation.id)
        self.assertEqual(response.data["venue_id"], self.venue.id)

    def test_send_venue_verification_code_sets_session(self):
        response = self.client.post(self.send_venue_code_url, {"email": "owner@example.com"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        session = self.client.session
        self.assertEqual(session["venue_pending_email"], "owner@example.com")
        self.assertFalse(session["venue_email_verified"])

    def test_verify_venue_code_marks_email_verified(self):
        code_obj = VenueEmailVerificationCode.objects.create(email="owner@example.com", code="123456")
        session = self.client.session
        session["venue_pending_email"] = "owner@example.com"
        session.save()
        response = self.client.post(self.verify_venue_code_url, {"code": "123456"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        session = self.client.session
        self.assertTrue(session["venue_email_verified"])
        self.assertEqual(session["venue_verified_email"], "owner@example.com")

    def test_apply_venue_requires_verified_email(self):
        self.client.post(self.send_venue_code_url, {"email": "owner@example.com"}, format="json")
        code_obj = VenueEmailVerificationCode.objects.filter(email="owner@example.com").first()
        session = self.client.session
        session["venue_pending_email"] = "owner@example.com"
        session.save()
        self.client.post(self.verify_venue_code_url, {"code": code_obj.code}, format="json")
        application_payload = {
            "venue_name": "New Venue",
            "venue_type": "restaurant",
            "location": "123 Main St",
            "description": "A new venue",
            "phone": "+1234567890",
            "admin_username": "venueadmin",
            "admin_email": "owner@example.com",
            "admin_firstname": "Owner",
            "admin_lastname": "Example",
            "admin_phone": "+1234567890",
            "password": "StrongPass123",
        }
        response = self.client.post(self.apply_venue_url, application_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_toggle_venue_full_requires_owner(self):
        owner = User.objects.create_user(
            username="venueowner",
            email="owner@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()

        toggle_url = f"/api/v1/venues/{self.venue.id}/toggle-full/"
        self.client.login(username="venueowner", password="pass1234")
        response = self.client.post(toggle_url, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.venue.refresh_from_db()
        self.assertTrue(self.venue.is_full)

    def test_reservation_owner_can_cancel_reservation(self):
        self.client.login(username="reservation_user", password="pass1234")
        reservation = Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
        )
        cancel_url = f"/api/v1/reservations/{reservation.id}/cancel/"
        response = self.client.post(cancel_url, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, "cancelled")

    def test_venue_admin_can_update_reservation_status(self):
        owner = User.objects.create_user(
            username="venueowner",
            email="owner@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        reservation = Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
        )
        self.client.login(username="venueowner", password="pass1234")
        response = self.client.post(f"/api/v1/reservations/{reservation.id}/status/", {"status": "accepted"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, "accepted")

    def test_venue_admin_can_update_arrival_status(self):
        owner = User.objects.create_user(
            username="venueowner2",
            email="owner2@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        reservation = Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
            status="accepted",
        )
        self.client.login(username="venueowner2", password="pass1234")
        response = self.client.post(f"/api/v1/reservations/{reservation.id}/arrival/", {"arrival_status": "checked_in"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        self.assertEqual(reservation.arrival_status, "checked_in")

    def test_venue_admin_can_move_reservation_to_requests(self):
        owner = User.objects.create_user(
            username="venueowner3",
            email="owner3@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        reservation = Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
            status="accepted",
            arrival_status="checked_in",
        )
        self.client.login(username="venueowner3", password="pass1234")
        response = self.client.post(f"/api/v1/reservations/{reservation.id}/move-to-requests/", format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        self.assertEqual(reservation.status, "pending")
        self.assertEqual(reservation.arrival_status, "pending")

    def test_venue_admin_can_mark_reservation_seen_and_unseen(self):
        owner = User.objects.create_user(
            username="venueowner4",
            email="owner4@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        reservation = Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
            status="pending",
        )
        self.client.login(username="venueowner4", password="pass1234")
        response = self.client.post(f"/api/v1/reservations/{reservation.id}/seen/", {"state": "seen"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        self.assertTrue(reservation.seen)

        response = self.client.post(f"/api/v1/reservations/{reservation.id}/seen/", {"state": "unseen"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        self.assertFalse(reservation.seen)

    def test_venue_dashboard_bootstrap_is_compact(self):
        owner = User.objects.create_user(
            username="dashboardowner",
            email="dashboardowner@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
            status="pending",
        )

        self.client.login(username="dashboardowner", password="pass1234")
        response = self.client.get(f"/api/v1/venues/{self.venue.id}/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("venue", response.data)
        self.assertIn("working_days", response.data)
        self.assertIn("analytics", response.data)
        self.assertIn("series", response.data["analytics"])
        self.assertIn("reservation_counts", response.data)
        self.assertNotIn("upcoming_reservations", response.data)
        self.assertNotIn("past_reservations", response.data)
        self.assertNotIn("reviews", response.data["venue"])

    def test_dashboard_reservations_are_paginated_and_slim(self):
        owner = User.objects.create_user(
            username="dashboardowner2",
            email="dashboardowner2@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        for index in range(12):
            Reservation.objects.create(
                user=self.user,
                venue=self.venue,
                firstname=f"Jane{index}",
                lastname="Doe",
                email=f"jane{index}@example.com",
                phone="+1234567890",
                date="2030-01-01",
                time="18:00",
                guests=2,
                status="pending",
            )

        self.client.login(username="dashboardowner2", password="pass1234")
        response = self.client.get(
            f"/api/v1/venues/{self.venue.id}/dashboard-reservations/",
            {"bucket": "requests", "page": 1, "page_size": 10},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 12)
        self.assertEqual(len(response.data["results"]), 10)
        self.assertNotIn("email", response.data["results"][0])
        self.assertNotIn("special_requests", response.data["results"][0])

    def test_reservation_details_returns_sensitive_fields_on_demand(self):
        owner = User.objects.create_user(
            username="dashboardowner3",
            email="dashboardowner3@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        reservation = Reservation.objects.create(
            user=self.user,
            venue=self.venue,
            firstname="Jane",
            lastname="Doe",
            email="jane.doe@example.com",
            phone="+1234567890",
            date="2030-01-01",
            time="18:00",
            guests=2,
            special_requests="Window table",
            allergies="Peanuts",
            comments="Anniversary",
        )

        self.client.login(username="dashboardowner3", password="pass1234")
        response = self.client.get(f"/api/v1/reservations/{reservation.id}/details/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["customer_name"], "Jane Doe")
        self.assertEqual(response.data["email"], "jane.doe@example.com")
        self.assertEqual(response.data["special_requests"], "Window table")
        self.assertEqual(response.data["allergies"], "Peanuts")
        self.assertEqual(response.data["comments"], "Anniversary")

    def test_venue_working_hours_endpoint_updates_hours(self):
        owner = User.objects.create_user(
            username="venueowner5",
            email="owner5@example.com",
            password="pass1234",
            user_type="venue_admin",
        )
        self.venue.owner = owner
        self.venue.save()
        self.client.login(username="venueowner5", password="pass1234")
        response = self.client.post(
            f"/api/v1/venues/{self.venue.id}/working-hours/",
            {
                "working_days": [
                    {"weekday": 0, "is_closed": False, "open_time": "08:00", "close_time": "16:00"},
                    {"weekday": 1, "is_closed": True},
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(0, response.data["updated_weekdays"])
        self.assertIn(1, response.data["updated_weekdays"])
        monday = WorkingDay.objects.get(venue=self.venue, weekday=0)
        tuesday = WorkingDay.objects.get(venue=self.venue, weekday=1)
        self.assertEqual(monday.open_time.strftime("%H:%M"), "08:00")
        self.assertEqual(monday.close_time.strftime("%H:%M"), "16:00")
        self.assertTrue(tuesday.is_closed)
