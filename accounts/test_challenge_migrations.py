from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class CompletionTokenMigrationTests(TransactionTestCase):
    def test_existing_tokens_survive_forward_and_reverse_migration(self):
        before = [("accounts", "0012_two_factor_and_venue_challenges")]
        after = [("accounts", "0013_unify_completion_token_hash")]
        executor = MigrationExecutor(connection)
        executor.migrate(before)
        try:
            Challenge = executor.loader.project_state(before).apps.get_model("accounts", "VerificationChallenge")
            now = timezone.now()
            fields = dict(email="migration@example.com", expires_at=now + timezone.timedelta(minutes=10),
                          code_expires_at=now, last_sent_at=now, verified_at=now)
            recovery = Challenge.objects.create(reason="password_recovery", reset_token_hash="a" * 64, **fields)
            venue = Challenge.objects.create(reason="venue_email", proof_hash="b" * 64, **fields)
            executor = MigrationExecutor(connection)
            executor.migrate(after)
            Challenge = executor.loader.project_state(after).apps.get_model("accounts", "VerificationChallenge")
            self.assertEqual(Challenge.objects.get(pk=recovery.pk).completion_token_hash, "a" * 64)
            self.assertEqual(Challenge.objects.get(pk=venue.pk).completion_token_hash, "b" * 64)
            executor = MigrationExecutor(connection)
            executor.migrate(before)
            Challenge = executor.loader.project_state(before).apps.get_model("accounts", "VerificationChallenge")
            self.assertEqual(Challenge.objects.get(pk=recovery.pk).reset_token_hash, "a" * 64)
            self.assertEqual(Challenge.objects.get(pk=venue.pk).proof_hash, "b" * 64)
            self.assertEqual(Challenge.objects.get(pk=venue.pk).reset_token_hash, "")
        finally:
            MigrationExecutor(connection).migrate(after)
