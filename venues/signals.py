from .utils                     import send_reservation_emails
from .models                    import Reservation
from accounts.middleware        import get_current_user

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
    current_user = get_current_user()
    user = instance.user            # customer
    venue_admin = instance.venue.owner

    if created:
        send_reservation_emails(instance)
        return

    old_values = getattr(instance, "_old_values", None)
    if not old_values:
        return

    changes = {
        field: (old_val, getattr(instance, field))
        for field, old_val in old_values.items()
        if old_val != getattr(instance, field)
    }
    if not changes:
        return

    # Decide recipient based on who made the change
    if current_user == user:
        # Customer made the change → notify venue admin
        subject = f"Reservation Update for {instance.venue.name}"
        message_lines = [f"The reservation from {user.email} has been updated:", ""]
        for field, (old, new) in changes.items():
            message_lines.append(f" - {field.replace('_', ' ').title()}: {old} → {new}")
        send_mail(subject, "\n".join(message_lines), settings.DEFAULT_FROM_EMAIL, [venue_admin.email])

    elif current_user == venue_admin:
        # Venue admin made the change → notify customer
        subject = f"Your Reservation at {instance.venue.name} Has Been Updated"
        message_lines = [f"Your reservation at {instance.venue.name} has been updated:", ""]
        for field, (old, new) in changes.items():
            message_lines.append(f" - {field.replace('_', ' ').title()}: {old} → {new}")
        send_mail(subject, "\n".join(message_lines), settings.DEFAULT_FROM_EMAIL, [user.email])