from .utils                     import send_reservation_emails
from .models                    import Reservation
from accounts.middleware        import get_current_user

from django.conf                import settings
from django.urls                import reverse
from django.dispatch            import receiver
from django.core.mail           import EmailMultiAlternatives
from django.template.loader     import render_to_string
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

    # Build context for email
    changes_list = [
        {"field": field.replace("_", " ").title(), "old": old, "new": new}
        for field, (old, new) in changes.items()
    ]

    # Decide recipient based on who made the change
    if current_user == user:
        # Customer updated reservation → notify venue admin
        reservation_url = settings.SITE_URL + '/dashboard/' + str(instance.venue.id) + '/'
        subject = f"Reservation Update for {instance.venue.name}"
        recipient = venue_admin.email
        context = {
            "title": "A reservation has been updated",
            "intro": f"The reservation from {instance.name} ({user.email}) has been updated:",
            "venue": instance.venue.name,
            "changes": changes_list,
            "reservation_url": reservation_url,
        }

    elif current_user == venue_admin:
        # Venue admin updated reservation → notify customer
        reservation_url = settings.SITE_URL + reverse("my_reservations")
        subject = f"Your Reservation at {instance.venue.name} Has Been Updated"
        recipient = user.email
        context = {
            "title": "Your reservation has been updated",
            "intro": f"Your reservation at {instance.venue.name} has been updated:",
            "venue": instance.venue.name,
            "changes": changes_list,
            "reservation_url": reservation_url,
        }
    else:
        return  # Neither user nor venue admin changed → skip

    # Render templates
    html_content = render_to_string("emails/reservation_update.html", context)
    text_content = render_to_string("emails/reservation_update.txt", context)  # plain fallback

    # Send email with HTML + plain fallback
    email = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [recipient])
    email.attach_alternative(html_content, "text/html")
    email.send()