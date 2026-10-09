from decimal import Decimal
from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from venues.models import Review, Reservation, Table, Venue, VenueVisit, WorkingDay


class Command(BaseCommand):
    help = "Populate Mimoza with realistic reservation, table, review, and visit data for testing."

    def handle(self, *args, **options):
        User = get_user_model()

        owner, _ = User.objects.get_or_create(
            username="mimoza_owner",
            defaults={
                "email": "mimoza.owner@example.com",
                "first_name": "Mimoza",
                "last_name": "Owner",
                "user_type": "venue_admin",
                "is_staff": True,
                "is_superuser": False,
            },
        )

        customers = []
        for idx in range(1, 8):
            user, _ = User.objects.get_or_create(
                username=f"mimoza_guest_{idx}",
                defaults={
                    "email": f"mimoza.guest{idx}@example.com",
                    "first_name": f"Guest{idx}",
                    "last_name": "Mimoza",
                    "user_type": "customer",
                },
            )
            customers.append(user)

        venue, created = Venue.objects.get_or_create(
            name="Mimoza",
            defaults={
                "kind": "restaurant",
                "location": "Athens, Greece",
                "description": "A vibrant dining venue used to test reservations, special requests, and analytics.",
                "phone": "+302101234567",
                "email": "hello@mimoza.example",
                "owner": owner,
                "latitude": Decimal("37.9838"),
                "longitude": Decimal("23.7275"),
                "is_full": False,
            },
        )
        if not created:
            venue.kind = "restaurant"
            venue.location = "Athens, Greece"
            venue.description = "A vibrant dining venue used to test reservations, special requests, and analytics."
            venue.phone = "+302101234567"
            venue.email = "hello@mimoza.example"
            venue.owner = owner
            venue.latitude = Decimal("37.9838")
            venue.longitude = Decimal("23.7275")
            venue.is_full = False
            venue.save(update_fields=[
                "kind",
                "location",
                "description",
                "phone",
                "email",
                "owner",
                "latitude",
                "longitude",
                "is_full",
            ])

        for weekday, open_time, close_time in [
            (0, time(12, 0), time(23, 30)),
            (1, time(12, 0), time(23, 30)),
            (2, time(12, 0), time(23, 30)),
            (3, time(12, 0), time(23, 30)),
            (4, time(12, 0), time(23, 30)),
            (5, time(12, 0), time(23, 30)),
            (6, time(12, 0), time(23, 30)),
        ]:
            WorkingDay.objects.get_or_create(
                venue=venue,
                weekday=weekday,
                defaults={
                    "is_closed": False,
                    "open_time": open_time,
                    "close_time": close_time,
                    "closes_next_day": False,
                },
            )

        for number, seats in [(1, 2), (2, 4), (3, 6), (4, 8), (5, 10)]:
            Table.objects.get_or_create(
                venue=venue,
                number=number,
                defaults={"seats": seats},
            )

        tables = list(venue.tables.all())
        today = timezone.now().date()

        reservation_specs = [
            {
                "user_index": 0,
                "date": today + timedelta(days=1),
                "time": time(19, 0),
                "status": "pending",
                "arrival_status": "pending",
                "special": False,
                "guests": 2,
                "seen": False,
                "comment": "Regular party",
            },
            {
                "user_index": 1,
                "date": today + timedelta(days=2),
                "time": time(20, 0),
                "status": "accepted",
                "arrival_status": "pending",
                "special": True,
                "guests": 4,
                "seen": True,
                "comment": "Wheelchair access and vegan menu",
            },
            {
                "user_index": 2,
                "date": today + timedelta(days=3),
                "time": time(18, 30),
                "status": "accepted",
                "arrival_status": "checked_in",
                "special": False,
                "guests": 3,
                "seen": True,
                "comment": "Guest arrived on time",
            },
            {
                "user_index": 3,
                "date": today + timedelta(days=4),
                "time": time(21, 0),
                "status": "rejected",
                "arrival_status": "pending",
                "special": True,
                "guests": 6,
                "seen": False,
                "comment": "Outdoor seating request",
            },
            {
                "user_index": 4,
                "date": today + timedelta(days=5),
                "time": time(17, 30),
                "status": "cancelled",
                "arrival_status": "pending",
                "special": False,
                "guests": 2,
                "seen": False,
                "comment": "Customer cancelled",
            },
            {
                "user_index": 5,
                "date": today + timedelta(days=6),
                "time": time(19, 30),
                "status": "accepted",
                "arrival_status": "no_show",
                "special": True,
                "guests": 5,
                "seen": True,
                "comment": "Allergy menu request and gluten-free",
            },
            {
                "user_index": 6,
                "date": today - timedelta(days=2),
                "time": time(20, 30),
                "status": "accepted",
                "arrival_status": "checked_in",
                "special": False,
                "guests": 2,
                "seen": True,
                "comment": "Past reservation",
            },
            {
                "user_index": 0,
                "date": today - timedelta(days=5),
                "time": time(18, 0),
                "status": "pending",
                "arrival_status": "pending",
                "special": True,
                "guests": 3,
                "seen": False,
                "comment": "Vegetarian and allergy meal request",
            },
            {
                "user_index": 2,
                "date": today - timedelta(days=8),
                "time": time(21, 30),
                "status": "rejected",
                "arrival_status": "pending",
                "special": False,
                "guests": 4,
                "seen": False,
                "comment": "No table available",
            },
            {
                "user_index": 4,
                "date": today + timedelta(days=8),
                "time": time(22, 0),
                "status": "accepted",
                "arrival_status": "pending",
                "special": False,
                "guests": 2,
                "seen": True,
                "comment": "Late dinner booking",
            },
        ]

        for spec in reservation_specs:
            customer = customers[spec["user_index"]]
            reservation, created = Reservation.objects.get_or_create(
                venue=venue,
                user=customer,
                date=spec["date"],
                time=spec["time"],
                defaults={
                    "firstname": customer.first_name or customer.username,
                    "lastname": customer.last_name or "Reservation",
                    "email": customer.email,
                    "phone": "+302101000000",
                    "guests": spec["guests"],
                    "status": spec["status"],
                    "arrival_status": spec["arrival_status"],
                    "comments": spec["comment"],
                    "seating_preference": "outdoor" if spec["special"] else "none",
                    "has_allergies": spec["special"],
                    "allergies": "Peanuts" if spec["special"] else "",
                    "vegan": spec["special"],
                    "vegetarian": spec["special"],
                    "gluten_free": spec["special"],
                    "wheelchair": spec["special"],
                    "smoking": False,
                    "table": tables[(spec["user_index"] + 1) % len(tables)] if tables else None,
                    "seen": spec["seen"],
                },
            )
            reservation.firstname = customer.first_name or customer.username
            reservation.lastname = customer.last_name or "Reservation"
            reservation.email = customer.email
            reservation.phone = "+302101000000"
            reservation.guests = spec["guests"]
            reservation.status = spec["status"]
            reservation.arrival_status = spec["arrival_status"]
            reservation.comments = spec["comment"]
            reservation.seating_preference = "outdoor" if spec["special"] else "none"
            reservation.has_allergies = spec["special"]
            reservation.allergies = "Peanuts" if spec["special"] else ""
            reservation.vegan = spec["special"]
            reservation.vegetarian = spec["special"]
            reservation.gluten_free = spec["special"]
            reservation.wheelchair = spec["special"]
            reservation.smoking = False
            reservation.table = tables[(spec["user_index"] + 1) % len(tables)] if tables else None
            reservation.seen = spec["seen"]
            reservation.save(editor=owner)

        for index, customer in enumerate(customers[:4]):
            Review.objects.get_or_create(
                venue=venue,
                user=customer,
                defaults={
                    "rating": 4 + (index % 2),
                    "comment": "Lovely atmosphere and great service at Mimoza.",
                },
            )

        for idx in range(20):
            visit_date = today - timedelta(days=idx % 14)
            visit_dt = datetime.combine(visit_date, time(18 + (idx % 4), 15 + (idx % 30)))
            visit_dt = timezone.make_aware(visit_dt)
            visit_user = customers[idx % len(customers)]
            visit_obj = VenueVisit.objects.create(venue=venue, user=visit_user, session_key=f"mimoza-session-{idx}")
            visit_obj.timestamp = visit_dt
            visit_obj.save(update_fields=["timestamp"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded Mimoza with venue, tables, working days, {Reservation.objects.filter(venue=venue).count()} reservations, {Review.objects.filter(venue=venue).count()} reviews, and {VenueVisit.objects.filter(venue=venue).count()} visits."
            )
        )
