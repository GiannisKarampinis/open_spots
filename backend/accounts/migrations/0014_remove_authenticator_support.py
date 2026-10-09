from django.db import migrations, models
from django.conf import settings
from importlib import import_module
from django.utils import timezone


def remove_obsolete_data(apps, schema_editor):
    Challenge = apps.get_model("accounts", "VerificationChallenge")
    database = schema_editor.connection.alias
    Challenge.objects.using(database).filter(reason="two_factor_login").delete()
    # The removed third-party app is no longer installed, so clean its table here.
    tables = schema_editor.connection.introspection.table_names()
    if "otp_totp_totpdevice" in tables:
        schema_editor.execute("DROP TABLE " + schema_editor.quote_name("otp_totp_totpdevice"))
    ContentType = apps.get_model("contenttypes", "ContentType")
    ContentType.objects.using(database).filter(app_label__in=["django_otp", "otp_totp"]).delete()
    Session = apps.get_model("sessions", "Session")
    SessionStore = import_module(settings.SESSION_ENGINE).SessionStore
    for session in Session.objects.using(database).all().iterator():
        store = SessionStore(session_key=session.session_key)
        data = store.decode(session.session_data)
        obsolete_keys = {"social_two_factor_challenge", "pending_social_link", "verified_two_factor_device"}
        if obsolete_keys.intersection(data):
            if session.expire_date <= timezone.now():
                store.delete()
                continue
            for key in obsolete_keys:
                store.pop(key, None)
            store.set_expiry(session.expire_date)
            store.save()


class Migration(migrations.Migration):
    dependencies = [("accounts", "0013_unify_completion_token_hash"), ("sessions", "0001_initial")]

    operations = [
        migrations.RunPython(remove_obsolete_data, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="verificationchallenge", name="one_open_login_challenge_per_user",
        ),
        migrations.RemoveConstraint(
            model_name="verificationchallenge", name="one_open_verification_per_user",
        ),
        migrations.AlterField(
            model_name="verificationchallenge", name="reason",
            field=models.CharField(max_length=24, choices=[
                ("signup", "Signup"), ("email_update", "Email update"),
                ("password_change", "Password change"), ("password_recovery", "Password recovery"),
                ("venue_email", "Venue email"),
            ]),
        ),
        migrations.AddConstraint(
            model_name="verificationchallenge",
            constraint=models.UniqueConstraint(
                fields=("user",), condition=models.Q(closed_at__isnull=True),
                name="one_open_verification_per_user",
            ),
        ),
    ]
