from django.db.models.signals       import pre_save, post_save
from django.dispatch                import receiver
from django.utils                   import timezone
from django.urls                    import reverse
from django.conf                    import settings
from django.core.mail               import EmailMultiAlternatives
from django.template.loader         import render_to_string
from .models                        import Reservation
from .notifications                 import notify_venue_admin

import threading # For production consider using Celery or Django Queued Tasks

###########################################################################################

###########################################################################################
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

###########################################################################################

###########################################################################################
def send_reservation_email(instance, changes_list=None, editor=None, created=False):
    """
    Send emails for reservations:
      - created == True → new reservation notification to venue admin
      - changes_list + editor → update or cancellation notifications
    """

    user            = instance.user
    venue_admin     = instance.venue.owner

    print(editor, user, venue_admin )

    if created:
        # NOTE: New Reservation --> send to venue admin
        reservation_url     = settings.SITE_URL + '/dashboard/' + str(instance.venue.id) + '/'
        subject             = f"Reservation Request at {instance.venue.name}"
        recipient           = venue_admin.email
        context             = {
            "title":            "New Reservation Request",
            "intro":            f"A new reservation has been made by {user.username} profile for {instance.full_name} ({instance.email}).",
            "venue":            instance.venue.name,
            "reservation":      instance,
            "reservation_url":  reservation_url,
        }
        html_content        = render_to_string("emails/reservation_created.html",  context)
        text_content        = render_to_string("emails/reservation_created.txt",   context)


    elif instance.status == "cancelled":
        # NOTE: Customer cancelled reservation --> notify venue admin
        subject             = f"Reservation Cancelled at {instance.venue.name}"
        recipient           = venue_admin.email
        context             = {
            "title":        "Reservation Cancelled",
            "intro":        f"The reservation from {instance.full_name} ({instance.email}) made by {user.username} has been cancelled.",
            "venue":        instance.venue.name,
            "changes":      changes_list,
            "reservation":  instance,
        }
        html_content        = render_to_string("emails/reservation_cancelled.html",    context)
        text_content        = render_to_string("emails/reservation_cancelled.txt",     context)


    elif editor == user:
        # NOTE: Customer updated reservation --> notify venue admin
        reservation_url     = settings.SITE_URL + '/dashboard/' + str(instance.venue.id) + '/'
        subject             = f"Reservation Update for {instance.venue.name}"
        recipient           = venue_admin.email
        context             = {
            "title":            "A reservation has been updated",
            "intro":            f"The reservation from {instance.full_name} ({instance.email}) made by {user.username} has been updated:",
            "venue":            instance.venue.name,
            "changes":          changes_list,
            "reservation_url":  reservation_url,
            "reservation":      instance,
        }
        html_content        = render_to_string("emails/reservation_update.html",    context)
        text_content        = render_to_string("emails/reservation_update.txt",     context)


    elif editor == venue_admin:
        print("BHKE")
        # Venue admin updated reservation → notify customer
        reservation_url     = settings.SITE_URL + reverse("my_reservations")
        subject             = f"Your Reservation at {instance.venue.name} Has Been Updated"
        recipient           = user.email
        context             = {
            "title":            "Your reservation has been updated",
            "intro":            f"Your reservation at {instance.venue.name} has been updated:",
            "venue":            instance.venue.name,
            "changes":          changes_list,
            "reservation_url":  reservation_url,
            "reservation":      instance,
        }
        html_content        = render_to_string("emails/reservation_update.html",   context)
        text_content        = render_to_string("emails/reservation_update.txt",    context)
        
        
    else:
        # Unknown editor --> skip sending
        return

    email = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [recipient])
    email.attach_alternative(html_content, "text/html")
    send_async_email(email)  # Assumes you have an async email sender

###########################################################################################

###########################################################################################
@receiver(pre_save, sender=Reservation)
def detect_reservation_changes(sender, instance, **kwargs):
    # --- Track old values before saving ---

    if not instance.pk:
        instance._old_values = None
        return

    try:
        old_instance = Reservation.objects.get(pk=instance.pk)
        instance._old_values = {
            'date':             old_instance.date,
            'time':             old_instance.time,
            'guests':           old_instance.guests,
            'status':           old_instance.status,
            'arrival_status':   old_instance.arrival_status,
        }
    except Reservation.DoesNotExist:
        instance._old_values = None

###########################################################################################

###########################################################################################
def build_reservation_payload(instance):
    # --- Build payload for WebSocket notification ---
    return {
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

###########################################################################################

###########################################################################################
def get_instance_changes(instance):
    old_values = getattr(instance, "_old_values", None)
    if not old_values:
        return []

    return [
        {"field": field.replace("_", " ").title(), "old": old, "new": getattr(instance, field)}
        for field, old in old_values.items()
        if old != getattr(instance, field)
    ]

###########################################################################################

###########################################################################################
@receiver(post_save, sender=Reservation)
def reservation_created_or_updated(sender, instance: Reservation, created, **kwargs):
    # --- Handle post-save: send emails + live notifications ---
    """
    Trigger both email notifications and WebSocket notifications
    when a Reservation is created or updated.
    """

    venue_id        = instance.venue_id
    
    if created:
        event_name = "reservation.created"
    elif instance.status == "cancelled":
        event_name = "reservation.cancelled"
    elif instance.status == "pending":
        event_name = "reservation.edited"
    else:
        event_name = "reservation.updated"
    
    reservation_data = build_reservation_payload(instance)
    payload = { "event":        event_name, 
                "reservation":  reservation_data }
    
    notify_venue_admin(venue_id, payload) # WebSocket push
    # FIXME: Optional: for high-volume updates, consider a message queue for WebSocket pushes (like Redis pub/sub)
    
    if created:
        editor = getattr(instance, "_editor", None)
        send_reservation_email(instance, created=True, editor=editor)
        return

    changes_list = get_instance_changes(instance)
    if not changes_list:
        return  # No changes detected, skip email
    
    editor = getattr(instance, "_editor", None)
    send_reservation_email(instance, changes_list=changes_list, editor=editor)
    
###########################################################################################

###########################################################################################
