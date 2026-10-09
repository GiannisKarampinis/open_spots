from django.db import connection
from django.contrib.sessions.backends.db import SessionStore
from django.contrib.sessions.models import Session
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class CompletionTokenMigrationTests(TransactionTestCase):
    def test_authenticator_cleanup_preserves_account_verification(self):
        before = [("accounts", "0013_unify_completion_token_hash")]
        after = [("accounts", "0014_remove_authenticator_support")]
        executor = MigrationExecutor(connection)
        executor.migrate(before)
        try:
            apps = executor.loader.project_state(before).apps
            User = apps.get_model("accounts", "CustomUser")
            Challenge = apps.get_model("accounts", "VerificationChallenge")
            user = User.objects.create(username="migration-user", email="migration@example.com", password="unused")
            now = timezone.now()
            fields = dict(user=user, email=user.email, expires_at=now + timezone.timedelta(minutes=10),
                          code_expires_at=now, last_sent_at=now)
            obsolete = Challenge.objects.create(reason="two_factor_login", **fields)
            account = Challenge.objects.create(reason="email_update", **fields)
            session = SessionStore()
            session["social_two_factor_challenge"] = str(obsolete.pk)
            session["_auth_user_id"] = str(user.pk)
            session.set_expiry(now + timezone.timedelta(minutes=15))
            session.save()
            original_expiry = Session.objects.get(pk=session.session_key).expire_date
            with connection.cursor() as cursor:
                cursor.execute("CREATE TABLE otp_totp_totpdevice (id integer PRIMARY KEY, key varchar(80))")
            executor = MigrationExecutor(connection)
            executor.migrate(after)
            Challenge = executor.loader.project_state(after).apps.get_model("accounts", "VerificationChallenge")
            self.assertFalse(Challenge.objects.filter(pk=obsolete.pk).exists())
            self.assertTrue(Challenge.objects.filter(pk=account.pk).exists())
            self.assertNotIn("otp_totp_totpdevice", connection.introspection.table_names())
            cleaned_session = Session.objects.get(pk=session.session_key)
            self.assertNotIn("social_two_factor_challenge", cleaned_session.get_decoded())
            self.assertEqual(cleaned_session.get_decoded()["_auth_user_id"], str(user.pk))
            self.assertEqual(cleaned_session.expire_date, original_expiry)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())

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
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
