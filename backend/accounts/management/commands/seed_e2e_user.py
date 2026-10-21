import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from venues.models import Table, Venue, WorkingDay


class Command(BaseCommand):
    help = "Create or refresh the isolated user and venue fixtures used by Playwright E2E tests."

    def handle(self, *args, **options):
        e2e_mode = getattr(settings, "E2E_TEST_MODE", False) or os.environ.get("E2E_TEST_MODE") == "1"
        if not settings.DEBUG or not e2e_mode:
            raise CommandError(
                "E2E fixtures can only be seeded in the isolated Playwright environment."
            )

        user_model = get_user_model()
        with transaction.atomic():
            user, user_created = user_model.objects.get_or_create(
                username="test_user1",
                defaults={
                    "email": "test_user1@example.test",
                    "firstname": "Test",
                    "lastname": "User",
                    "user_type": "customer",
                    "email_verified": True,
                    "is_active": True,
                },
            )
            user.email = "test_user1@example.test"
            user.firstname = "Test"
            user.lastname = "User"
            user.user_type = "customer"
            user.email_verified = True
            user.is_active = True
            user.set_password("pass_word1!")
            user.save(
                update_fields=[
                    "email",
                    "firstname",
                    "lastname",
                    "user_type",
                    "email_verified",
                    "is_active",
                    "password",
                ]
            )

            venue, venue_created = Venue.objects.get_or_create(
                pk=1,
                defaults={
                    "name": "Playwright Test Venue",
                    "kind": "restaurant",
                    "location": "Athens, Greece",
                    "description": "A venue for isolated Playwright E2E tests.",
                    "latitude": "37.9838",
                    "longitude": "23.7275",
                    "owner": None,
                },
            )
            venue.name = "Playwright Test Venue"
            venue.kind = "restaurant"
            venue.location = "Athens, Greece"
            venue.description = "A venue for isolated Playwright E2E tests."
            venue.latitude = "37.9838"
            venue.longitude = "23.7275"
            venue.owner = None
            venue.save()
            for weekday in range(7):
                WorkingDay.objects.update_or_create(
                    venue=venue,
                    weekday=weekday,
                    defaults={
                        "is_closed": False,
                        "open_time": "12:00",
                        "close_time": "23:30",
                    },
                )
            Table.objects.get_or_create(venue=venue, number=1, defaults={"seats": 4})

        self.stdout.write(
            f"{'Created' if user_created else 'Updated'} Playwright E2E user: test_user1"
        )
        self.stdout.write(
            f"{'Created' if venue_created else 'Updated'} Playwright E2E venue: {venue.name} (id={venue.pk})"
        )
