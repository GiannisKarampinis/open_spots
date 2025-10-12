from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from .models import EmailVerificationCode
from venues.utils import send_async_email, _build_site_url  # reuse existing helpers


# def send_verification_code(user):
#     # 1. Remove old codes
#     EmailVerificationCode.objects.filter(user=user).delete()

#     # 2. Generate and save new code
#     code = EmailVerificationCode.generate_code()
#     EmailVerificationCode.objects.create(user=user, code=code)

#     # 3. Prepare template context
#     title = "Verify your email"
#     intro = "Use the code below to verify your OpenSpots account email."
#     verify_url = _build_site_url("/accounts/confirm-code/")

#     context = {
#         "title": title,
#         "intro": intro,
#         "code": code,
#         "verify_url": verify_url,
#     }

#     # 4. Render templates
#     html_content = render_to_string("emails/verification_code.html", context)
#     text_content = render_to_string("emails/verification_code.txt", context)

#     # 5. Build the email
#     subject = f"Your OpenSpots Verification Code"
#     recipient = user.unverified_email or user.email

#     email = EmailMultiAlternatives(subject, text_content, settings.DEFAULT_FROM_EMAIL, [recipient])
#     email.attach_alternative(html_content, "text/html")

#     # 6. Send asynchronously
#     send_async_email(email)


def send_verification_code(user):
    # Import locally to avoid circular imports
    from venues.signals import send_email_with_template
    from .models import EmailVerificationCode
    from venues.utils import _build_site_url

    # 1. Remove old codes
    EmailVerificationCode.objects.filter(user=user).delete()

    # 2. Generate and save new code
    code = EmailVerificationCode.generate_code()
    EmailVerificationCode.objects.create(user=user, code=code)

    # 3. Prepare template context
    context = {
        "title": "Verify your email",
        "intro": "Use the code below to verify your OpenSpots account email.",
        "code": code,
        "verify_url": _build_site_url("/accounts/confirm-code/"),
    }

    # 4. Determine email target
    subject = "Your OpenSpots Verification Code"
    recipient = user.unverified_email or user.email

    # 5. Send email using the common helper
    send_email_with_template(
        subject=subject,
        recipient=recipient,
        template_base="verification_code",
        context=context,
        async_send=True,  # keep async sending
    )
