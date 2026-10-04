from django.db import migrations


def merge_venue_tokens(apps, schema_editor):
    Challenge = apps.get_model("accounts", "VerificationChallenge")
    from django.db.models import F

    Challenge.objects.using(schema_editor.connection.alias).filter(reason="venue_email").update(
        completion_token_hash=F("proof_hash"),
    )


def restore_venue_tokens(apps, schema_editor):
    Challenge = apps.get_model("accounts", "VerificationChallenge")
    from django.db.models import F

    Challenge.objects.using(schema_editor.connection.alias).filter(reason="venue_email").update(
        proof_hash=F("completion_token_hash"), completion_token_hash="",
    )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0012_two_factor_and_venue_challenges")]

    operations = [
        migrations.RenameField(
            model_name="verificationchallenge",
            old_name="reset_token_hash",
            new_name="completion_token_hash",
        ),
        migrations.RunPython(merge_venue_tokens, restore_venue_tokens),
        migrations.RemoveField(model_name="verificationchallenge", name="proof_hash"),
    ]
