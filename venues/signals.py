from django.db.models.signals       import pre_save, post_save
from django.dispatch                import receiver
from django.utils                   import timezone
from django.urls                    import reverse
from django.conf                    import settings
from django.core.mail               import EmailMultiAlternatives
from django.template.loader         import render_to_string

from .models                        import Reservation
from .utils                         import send_reservation_emails
from .notifications                 import notify_venue_admin
from accounts.middleware            import get_current_user

import threading # For production consider using Celery or Django Queued Tasks

def send_async_email(email):
    """
    Run email.send() in a background thread so it doesn't block the request.
    """
    def _send():
        try:
            email.send()
        except Exception as e:
             # TODO: log error properly (e.g. Sentry, logging)
            print(f"Email sending failed: {e}")

    threading.Thread(target=_send, daemon=True).start()


# --- Track old values before saving ---
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


# --- Handle post-save: send emails + live notifications ---
@receiver(post_save, sender=Reservation)
def reservation_created_or_updated(sender, instance: Reservation, created, **kwargs):
    """
    Trigger both email notifications and WebSocket notifications
    when a Reservation is created or updated.
    """

    current_user    = get_current_user()
    user            = instance.user
    venue_admin     = instance.venue.owner

    # ✅ Always send WebSocket notification
    venue_id = instance.venue_id
    reservation_data = {
        "id":             instance.id,
        "customer_name":  instance.user.username,
        "date":           instance.date.strftime("%Y-%m-%d") if instance.date else None,
        "time":           instance.time.strftime("%H:%M") if instance.time else None,
        "guests":         getattr(instance, "guests", None),
        "status":         instance.status,
        "arrival_status": instance.arrival_status,
        "urls": {
            "accept":   reverse('update_reservation_status', args=[instance.id, 'accepted']),
            "reject":   reverse('update_reservation_status', args=[instance.id, 'rejected']),
            "move":     reverse('move_reservation_to_requests_ajax', args=[instance.id]),
            "checkin":  reverse('update_arrival_status', args=[instance.id, 'checked_in']),
            "no_show":  reverse('update_arrival_status', args=[instance.id, 'no_show']),
        },
        "updated_at": (instance.updated_at.isoformat()
                       if hasattr(instance, 'updated_at') and instance.updated_at
                       else timezone.now().isoformat()),
    }
    event_name = "reservation.created" if created else "reservation.updated"
    payload = {"event": event_name, "reservation": reservation_data}
    notify_venue_admin(venue_id, payload) # channels / WebSocket
    # Optional: for high-volume updates, consider a message queue for WebSocket pushes (like Redis pub/sub)
    
    # ✅ Send emails (only if email context applies)
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

    changes_list = [
        {"field": field.replace("_", " ").title(), "old": old, "new": new}
        for field, (old, new) in changes.items()
    ]

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
    text_content = render_to_string("emails/reservation_update.txt", context)

    email = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [recipient])
    email.attach_alternative(html_content, "text/html")
    send_async_email(email)   # 🚀 now runs in background
