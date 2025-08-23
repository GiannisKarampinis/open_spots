from .utils                     import send_reservation_emails
from .models                    import Reservation
from accounts.middleware        import get_current_user

from django.conf                import settings
from django.dispatch            import receiver
from django.core.mail           import send_mail, EmailMultiAlternatives
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

    # Build change list for template
    change_list = [
        {"field": field.replace("_", " ").title(), "old": old, "new": new}
        for field, (old, new) in changes.items()
    ]

    # Decide recipient based on who made the change
    if current_user == user:
        # Customer made the change → notify venue admin
        subject = f"Reservation Update for {instance.venue.name}"
        recipient = venue_admin.email
        context = {
            "title": "Reservation Update",
            "intro": f"The reservation from {user.username} has been updated.",
            "venue": instance.venue.name,
            "changes": change_list,
        }
    elif current_user == venue_admin:
        # Venue admin made the change → notify customer
        subject = f"Your Reservation at {instance.venue.name} Has Been Updated"
        recipient = user.email
        context = {
            "title": "Reservation Update",
            "intro": f"Your reservation at {instance.venue.name} has been updated.",
            "venue": instance.venue.name,
            "changes": change_list,
        }
    else:
        # Unknown user made the change, do not send email
        return
    
    # Render both text + HTML
    text_content = render_to_string("emails/reservation_update.txt", context)
    html_content = render_to_string("emails/reservation_update.html", context)

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_content,  # fallback plain text
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    email.attach_alternative(html_content, "text/html")
    email.send()