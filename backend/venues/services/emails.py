import logging

from django.utils           import timezone
from django.contrib.auth    import get_user_model
from emails_manager.utils   import send_email_with_template, _build_site_url

logger = logging.getLogger(__name__)

User = get_user_model()

###########################################################################################

###########################################################################################
def send_new_venue_application_email(venue_application, async_send = True):
    """
        Purpose:
        Send a notification email to site admins when a new venue application is submitted.
        Uses the shared emails_manager utils to handle rendering and sending.
    """
    try:
        admins = User.objects.filter(is_superuser = True, email__isnull = False).exclude(email = "")

        for admin in admins:
            send_email_with_template(
                subject         =   "New Venue Application Submitted",
                recipient       =   admin.email,
                template_base   =   "venues/new_venue_application",
                context         =   {
                    "venue_application":    venue_application,
                    "applicant_name":       venue_application.name,
                    "applicant_email":      venue_application.email,
                    "submitted_at":         timezone.now(),
                },
                async_send=async_send,
            )

        logger.info("Venue application notification sent to %d admins", admins.count())

    except Exception:
        
        logger.exception("Failed to send venue application email notification.")

###########################################################################################

###########################################################################################
def send_reservation_notification(instance, created=False, editor=None, changes_list=None):
    """
    Handles all reservation-related email notifications.
    This function belongs to the 'venues' app because it knows
    about reservations, venues, and users.
    """
    user        = getattr(instance, "user", None)
    venue       = getattr(instance, "venue", None)
    venue_admin = getattr(venue, "owner", None) if venue else None

    if not venue or not user:
        logger.warning("Reservation missing venue or user — skipping email.")
        return

    emails_to_send = []

    # --- Reservation Created ---
    if created:
        if getattr(venue_admin, "email", None):
            emails_to_send.append({
                "recipient":        venue_admin.email,
                "subject":          f"Reservation Request at {venue.name}",
                "template_base":    "reservation_created",
                "context":          {
                    "title":        "New Reservation Request",
                    "intro":        f"A new reservation has been made by {user.username} ({user.email}).",
                    "venue":        venue.name,
                    "reservation":  instance,
                    "reservation_url": _build_site_url(f"/dashboard/{venue.id}/"),
                },
            })
        if getattr(user, "email", None):
            emails_to_send.append({
                "recipient": user.email,
                "subject": f"Your Reservation Request at {venue.name}",
                "template_base": "reservation_user_confirmation",
                "context": {
                    "title": "Reservation Request Received",
                    "intro": f"Hi {user.get_full_name() or user.username}, your reservation request at {venue.name} has been sent successfully!",
                    "venue": venue.name,
                    "reservation": instance,
                    "reservation_url": _build_site_url("/my-reservations/"),
                },
            })

    # --- Reservation Cancelled ---
    elif instance.status == "cancelled" and venue_admin and getattr(venue_admin, "email", None):
        emails_to_send.append({
            "recipient": venue_admin.email,
            "subject": f"Reservation Cancelled at {venue.name}",
            "template_base": "reservation_cancelled",
            "context": {
                "title": "Reservation Cancelled",
                "intro": f"The reservation from {user.get_full_name() or user.username} ({user.email}) has been cancelled.",
                "venue": venue.name,
                "changes": changes_list,
                "reservation": instance,
            },
        })

    # --- User Updated Reservation ---
    elif editor == user and venue_admin and getattr(venue_admin, "email", None):
        emails_to_send.append({
            "recipient": venue_admin.email,
            "subject": f"Reservation Update for {venue.name}",
            "template_base": "reservation_update",
            "context": {
                "title": "A reservation has been updated",
                "intro": f"The reservation from {user.get_full_name() or user.username} ({user.email}) has been updated:",
                "venue": venue.name,
                "changes": changes_list,
                "reservation": instance,
                "reservation_url": _build_site_url(f"/dashboard/{venue.id}/"),
            },
        })

    # --- Admin Updated Reservation ---
    elif editor == venue_admin and user and getattr(user, "email", None):
        emails_to_send.append({
            "recipient": user.email,
            "subject": f"Your Reservation at {venue.name} Has Been Updated",
            "template_base": "reservation_update",
            "context": {
                "title": "Your reservation has been updated",
                "intro": f"Your reservation at {venue.name} has been updated.",
                "venue": venue.name,
                "changes": changes_list,
                "reservation_url": _build_site_url("/my-reservations/"),
                "reservation": instance,
            },
        })

    # --- Send emails ---
    for email_info in emails_to_send:
        try:
            template_base=email_info["template_base"]
            
            print("Sending email with template:", template_base)
            send_email_with_template(
                subject=email_info["subject"],
                recipient=email_info["recipient"],
                template_base=email_info["template_base"],
                context=email_info["context"],
                async_send=True
            )
        except Exception:
            logger.exception("Failed to send reservation notification email to %s", email_info.get("recipient"))


###########################################################################################

###########################################################################################
def send_venue_verification_code(email, code, async_send=True):
    """
    Reuses the SAME email template used for user email verification.
    Only difference: we pass the code directly, not a user.
    """
    try:
        send_email_with_template(
            subject             =   "Verify your email address",
            recipient           =   email,
            template_base       =   "verification_code",  # SAME TEMPLATE            
            context             =   {
                "code"          :   code,  # template expects {{ code }}
            },
            async_send          =   async_send,
        )
        logger.info("Sent venue verification code to %s", email)
    
    except Exception:
        logger.exception("Failed to send venue verification code to %s", email)
        
###########################################################################################

###########################################################################################
