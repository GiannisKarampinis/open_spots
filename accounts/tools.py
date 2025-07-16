# utils.py or in views.py
from .models import EmailVerificationCode
from django.core.mail import send_mail

def send_verification_code(user):
    # Remove old codes
    EmailVerificationCode.objects.filter(user=user).delete()

    code = EmailVerificationCode.generate_code()
    EmailVerificationCode.objects.create(user=user, code=code)

    send_mail(
        subject="Your OpenSpots Verification Code",
        message=f"Use this code to verify your email: {code}",
        from_email="OpenSpots <ioanniskarampinis.prf@gmail.com>",
        recipient_list=[user.unverified_email or user.email],
        fail_silently=False,
    )

