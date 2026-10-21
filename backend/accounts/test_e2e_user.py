from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import TestCase, override_settings

from venues.models import Table, Venue, WorkingDay


class SeedE2EUserCommandTests(TestCase):
    @override_settings(DEBUG=True, E2E_TEST_MODE=True)
    def test_command_creates_verified_customer_and_is_repeatable(self):
        call_command("seed_e2e_user")
        call_command("seed_e2e_user")

        user = get_user_model().objects.get(username="test_user1")
        self.assertEqual(user.email, "test_user1@example.test")
        self.assertEqual(user.user_type, "customer")
        self.assertTrue(user.email_verified)
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password("pass_word1!"))
        self.assertEqual(get_user_model().objects.filter(username="test_user1").count(), 1)
        venue = Venue.objects.get(pk=1)
        self.assertEqual(venue.name, "Playwright Test Venue")
        self.assertEqual(WorkingDay.objects.filter(venue=venue, is_closed=False).count(), 7)
        self.assertTrue(Table.objects.filter(venue=venue, number=1, seats=4).exists())

    @override_settings(DEBUG=False, E2E_TEST_MODE=True)
    def test_command_refuses_to_seed_when_debug_is_disabled(self):
        with self.assertRaises(CommandError):
            call_command("seed_e2e_user")

        self.assertFalse(get_user_model().objects.filter(username="test_user1").exists())

    @override_settings(DEBUG=True, E2E_TEST_MODE=False)
    def test_command_refuses_to_seed_outside_isolated_e2e_mode(self):
        with self.assertRaises(CommandError):
            call_command("seed_e2e_user")

        self.assertFalse(get_user_model().objects.filter(username="test_user1").exists())
