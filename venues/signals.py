from .models                    import Reservation
from django.conf                import settings
from django.dispatch            import receiver
from django.core.mail           import send_mail
from django.db.models.signals   import pre_save, post_save

@receiver(pre_save, sender=Reservation)
def detect_reservation_changes(sender, instance, **kwargs):
    if not instance.pk:
        instance._old_values = None
        return

    try:
        old_instance = Reservation.objects.get(pk=instance.pk)
        instance._old_values = {
            'date': old_instance.date,
            'time': old_instance.time,
            'guests': old_instance.guests,
            'status': old_instance.status,
            'arrival_status': old_instance.arrival_status,
        }
    except Reservation.DoesNotExist:
        instance._old_values = None


@receiver(post_save, sender=Reservation)
def send_reservation_update_email(sender, instance, created, **kwargs):
    venue = instance.venue
    owner = venue.owner
    if not owner or not owner.email:
        return

    if created:
        subject = f"New Reservation for {venue.name}"
        message = (
            f"A new reservation was created:\n\n"
            f"Name: {instance.name}\n"
            f"Date: {instance.date}\n"
            f"Time: {instance.time}\n"
            f"Guests: {instance.guests}\n"
            f"Status: {instance.status}\n"
            f"Arrival Status: {instance.arrival_status}\n"
        )
    else:
        old_values = getattr(instance, "_old_values", None)
        if not old_values:
            return

        changes = {}
        for field, old_val in old_values.items():
            new_val = getattr(instance, field)
            if old_val != new_val:
                changes[field] = (old_val, new_val)

        if not changes:
            return

        subject = f"Reservation Updated for {venue.name}"
        message_lines = [
            f"The reservation for {instance.name} has been updated:",
            ""
        ]
        for field, (old, new) in changes.items():
            message_lines.append(f" - {field.replace('_', ' ').title()}: {old} → {new}")
        message = "\n".join(message_lines)

    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [owner.email],
        fail_silently=False,
    )
