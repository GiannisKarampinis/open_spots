from django.db.models.signals       import pre_save, post_save
from django.dispatch                import receiver
from django.utils                   import timezone
from django.urls                    import reverse
from django.conf                    import settings
from django.core.mail               import EmailMultiAlternatives
from django.template.loader         import render_to_string
from django.template                import TemplateDoesNotExist
from .models                        import Reservation
from .notifications                 import notify_venue_admin
from typing                         import Optional

import logging
import threading # For production consider using Celery or Django Queued Tasks

logger = logging.getLogger(__name__)

###########################################################################################

def send_async_email(email):
    """
    Run email.send() in a background thread so it doesn't block the request.
    """
    def _send():
        try:
            email.send()
            logger.debug("Email sent to %s", email.to)
        except Exception as e:
            logger.exception("Failed to send email to %s", email.to)

    threading.Thread(target=_send, daemon=True).start()

###########################################################################################

def _build_site_url(path: str) -> str:
    base = getattr(settings, "SITE_URL", "").rstrip("/")
    
    if not base:
        return path  # fallback; ideally SITE_URL is configured
    
    if not path.startswith("/"):
        path = f"/{path}"
    
    return f"{base}{path}"

###########################################################################################

def send_email_with_template(subject: str, recipient: str, template_base: str, context: dict, async_send: bool = True):
    """
    Render text + HTML template and send email.
    """
    text_content = ""
    html_content = None

    try:
        text_content = render_to_string(f"emails/{template_base}.txt", context)
    except TemplateDoesNotExist:
        text_content = context.get("intro", "You have a notification.")

    try:
        html_content = render_to_string(f"emails/{template_base}.html", context)
    except TemplateDoesNotExist:
        logger.debug("HTML template %s not found. Sending text-only email.", template_base)

    email = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [recipient])
    if html_content:
        email.attach_alternative(html_content, "text/html")

    if async_send:
        send_async_email(email)
    else:
        try:
            email.send()
            logger.debug("Email sent synchronously to %s", recipient)
        except Exception:
            logger.exception("Synchronous email sending failed for %s", recipient)

###########################################################################################

def send_reservation_email(
    instance,
    changes_list: Optional[list] = None,
    editor = None,
    created: bool = False,
    async_send: bool = True,
) -> None:
    """
    Send emails for reservations:

    - created == True → new reservation notification to both venue admin and user
    - changes_list + editor → update or cancellation notifications
    """
    user = getattr(instance, "user", None)
    venue = getattr(instance, "venue", None)
    venue_admin = getattr(venue, "owner", None) if venue else None

    username = getattr(user, "username", "Unknown")
    full_name = getattr(instance, "full_name", None) or getattr(user, "get_full_name", None) or ""
    user_email = getattr(user, "email", None) or getattr(instance, "email", None)

    emails_to_send = []

    print("Editor:", editor)
    print("User:", user)

    try:
        # --- New reservation ---
        if created:
            # Admin notification
            if getattr(venue_admin, "email", None):
                emails_to_send.append({
                    "recipient": venue_admin.email,
                    "subject": f"Reservation Request at {venue.name}",
                    "template_base": "reservation_created",
                    "context": {
                        "title": "New Reservation Request",
                        "intro": f"A new reservation has been made by {username} for {full_name} ({instance.email}).",
                        "venue": venue.name,
                        "reservation": instance,
                        "reservation_url": _build_site_url(f"/dashboard/{venue.id}/"),
                    },
                })
            # User confirmation
            if user_email:
                emails_to_send.append({
                    "recipient": user_email,
                    "subject": f"Your Reservation Request at {venue.name}",
                    "template_base": "reservation_user_confirmation",
                    "context": {
                        "title": "Reservation Request Received",
                        "intro": f"Hi {full_name}, your reservation request at {venue.name} has been sent successfully!",
                        "venue": venue.name,
                        "reservation": instance,
                        "reservation_url": _build_site_url("/my-reservations/"),
                    },
                })

        # --- Cancelled reservation ---
        elif instance.status == "cancelled":
            if getattr(venue_admin, "email", None):
                emails_to_send.append({
                    "recipient": venue_admin.email,
                    "subject": f"Reservation Cancelled at {venue.name}",
                    "template_base": "reservation_cancelled",
                    "context": {
                        "title": "Reservation Cancelled",
                        "intro": f"The reservation from {full_name} ({instance.email}) made by {username} has been cancelled.",
                        "venue": venue.name,
                        "changes": changes_list,
                        "reservation": instance,
                    },
                })

        # --- Customer updated reservation (notify admin) ---
        elif editor == user:
            print("BHKE12132123123123123")
            print(getattr(venue_admin, "email", None))
            if getattr(venue_admin, "email", None):
                emails_to_send.append({
                    "recipient": venue_admin.email,
                    "subject": f"Reservation Update for {venue.name}",
                    "template_base": "reservation_update",
                    "context": {
                        "title": "A reservation has been updated",
                        "intro": f"The reservation from {full_name} ({instance.email}) made by {username} has been updated:",
                        "venue": venue.name,
                        "changes": changes_list,
                        "reservation_url": _build_site_url(f"/dashboard/{venue.id}/"),
                        "reservation": instance,
                    },
                })

        # --- Venue admin updated reservation (notify user) ---
        elif editor == venue_admin:
            if user_email:
                emails_to_send.append({
                    "recipient": user_email,
                    "subject": f"Your Reservation at {venue.name} Has Been Updated",
                    "template_base": "reservation_update",
                    "context": {
                        "title": "Your reservation has been updated",
                        "intro": f"Your reservation at {venue.name} has been updated:",
                        "venue": venue.name,
                        "changes": changes_list,
                        "reservation_url": _build_site_url(reverse("my_reservations")),
                        "reservation": instance,
                    },
                })

        else:
            logger.debug("send_reservation_email: unknown editor, skipping email (editor=%r)", editor)
            return

        # --- Send all queued emails ---
        for email_info in emails_to_send:
            if email_info["recipient"]:
                send_email_with_template(
                    subject=email_info["subject"],
                    recipient=email_info["recipient"],
                    template_base=email_info["template_base"],
                    context=email_info["context"],
                    async_send=async_send
                )

    except Exception:
        logger.exception("Unexpected error while preparing reservation email for reservation=%s", getattr(instance, "pk", "<unknown>"))

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

def get_instance_changes(instance):
    old_values = getattr(instance, "_old_values", None)
    print("DEBUG → _old_values:", old_values)

    if not old_values:
        print("No old values found")
        return []

    changes = []
    for field, old in old_values.items():
        new = getattr(instance, field, None)
        print(f"Checking {field}: old={old}, new={new}")
        if old != new:
            print(f"CHANGE DETECTED for {field}")
            changes.append({
                "field": field.replace("_", " ").title(),
                "old": old,
                "new": new,
            })

    print("Final changes list:", changes)
    return changes


###########################################################################################

@receiver(post_save, sender=Reservation)
def reservation_created_or_updated(sender, instance: Reservation, created, **kwargs):
    """
    Trigger both email notifications and WebSocket notifications
    when a Reservation is created or updated.
    """
    
    # --- prevent double-triggering ---
    if getattr(instance, "_signal_processed", False):
        return
    instance._signal_processed = True

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
    
    editor = getattr(instance, "_editor", None)
    
    print("Editor in signal:", editor)
    
    if created:
        send_reservation_email(instance, created=True, editor=editor)
        return

    changes_list = get_instance_changes(instance)
    print(changes_list)
    if not changes_list:
        return  # No changes detected, skip email
    
    send_reservation_email(instance, changes_list=changes_list, editor=editor)

###########################################################################################
