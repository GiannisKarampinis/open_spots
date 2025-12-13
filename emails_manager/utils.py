# emails_manager/utils.py
import threading
import logging

from django.core.mail           import EmailMultiAlternatives
from django.template.loader     import render_to_string
from django.template            import TemplateDoesNotExist
from django.conf                import settings

logger = logging.getLogger(__name__)

def send_async_email(email):
    """
        Send email asynchronously in a background thread.
    """
    
    def _send():
        try:
            email.send()
            logger.debug("Email sent to %s", email.to)
        except Exception as e:
            logger.exception("Failed to send email to %s", email.to)

    threading.Thread(target=_send, daemon=True).start()

def _build_site_url(path: str) -> str:
    """
        Build a full URL based on SITE_URL in settings.
    """
    base = getattr(settings, "SITE_URL", "").rstrip("/")
    
    if not base:
        return path
    if not path.startswith("/"):
        path = f"/{path}"
    
    return f"{base}{path}"


def send_email_with_template(subject: str, recipient: str, template_base: str, context: dict, async_send: bool = True, request=None):
    """
        Generic email sender: render templates and send.
    """

    text_content        = ""
    html_content        = None
    text_template_found = False
    html_template_found = False

    try:
        text_content            = render_to_string(f"emails/{template_base}.txt", context)
        text_template_found     = True
    except TemplateDoesNotExist:
        text_content = context.get("intro", "You have a notification.")

    try:
        html_content            = render_to_string(f"emails/{template_base}.html", context, request=request)
        html_template_found     = True
    except TemplateDoesNotExist:
        logger.debug("HTML template %s not found. Sending text-only email.", template_base)

    email = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [recipient])

    if html_content:
        email.attach_alternative(html_content, "text/html")

    is_html_email = any(alt[1] == "text/html" for alt in getattr(email, "alternatives", []))

    logger.debug(
        "Email prepared: text_template_found=%s, html_template_found=%s, is_html_email=%s",
        text_template_found,
        html_template_found,
        is_html_email,
    )

    if async_send:
        send_async_email(email)
    else:
        try:
            email.send()
            logger.debug("Email sent synchronously to %s", recipient)
        except Exception:
            logger.exception("Synchronous email sending failed for %s", recipient)
