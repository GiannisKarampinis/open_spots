from django.db import migrations, models


def migrate_special_requests(apps, schema_editor):
    Reservation = apps.get_model("venues", "Reservation")

    for reservation in Reservation.objects.all().iterator():
        legacy_special_request = getattr(reservation, "legacy_special_requests", "none")
        legacy_allergies = (reservation.allergies or "").strip()
        legacy_smoking = getattr(reservation, "legacy_smoking", "no_preference")

        reservation.vegan = legacy_special_request == "vegan"
        reservation.vegetarian = legacy_special_request == "vegetarian"
        reservation.gluten_free = legacy_special_request == "gluten_free"
        reservation.wheelchair = legacy_special_request == "wheelchair"
        reservation.has_allergies = bool(legacy_allergies)
        reservation.smoking = legacy_smoking == "smoking"
        reservation.special_requests = any(
            [
                legacy_special_request not in ("", "none", None),
                bool(legacy_allergies),
                reservation.smoking,
            ]
        )
        reservation.save(
            update_fields=[
                "vegan",
                "vegetarian",
                "gluten_free",
                "wheelchair",
                "has_allergies",
                "smoking",
                "special_requests",
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("venues", "0006_reservation_smoking"),
    ]

    operations = [
        migrations.RenameField(
            model_name="reservation",
            old_name="special_requests",
            new_name="legacy_special_requests",
        ),
        migrations.RenameField(
            model_name="reservation",
            old_name="smoking",
            new_name="legacy_smoking",
        ),
        migrations.AddField(
            model_name="reservation",
            name="special_requests",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="reservation",
            name="seating_preference",
            field=models.CharField(
                choices=[
                    ("none", "No preference"),
                    ("indoor", "Indoor"),
                    ("outdoor", "Outdoor"),
                ],
                default="none",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="reservation",
            name="has_allergies",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="reservation",
            name="vegan",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="reservation",
            name="vegetarian",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="reservation",
            name="gluten_free",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="reservation",
            name="wheelchair",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="reservation",
            name="smoking",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(migrate_special_requests, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="reservation",
            name="legacy_special_requests",
        ),
        migrations.RemoveField(
            model_name="reservation",
            name="legacy_smoking",
        ),
    ]
