import uuid

from django.db                  import models
from django.contrib.auth.models import AbstractUser

class CustomUser(AbstractUser):
    USER_TYPE_CHOICES = (
        ('customer', 'Customer'),
        ('venue_admin', 'Venue Admin'),
    )

    firstname          = models.CharField(max_length=30, blank=True)
    lastname           = models.CharField(max_length=30, blank=True)
    user_type           = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='customer')
    phone_number        = models.CharField(max_length=20, blank=True, null=True)
    email_verified      = models.BooleanField(default=False)
    unverified_email    = models.EmailField(blank=True, null=True) # FIXME: A wrapper class could be developed to handle Emails as an separate entity.
    #FIXME - tsevre: Do not call unverified_email the variable 'cause it handles both states.

    def __str__(self):
        return f"{self.username} ({self.user_type})"

    @property
    def full_name_or_username(self):
        full_name = self.get_full_name()
        return full_name if full_name else self.username
    
    # FIXME - tsevre: Uncomment if phone number validation is needed.
    # from django.core.validators import RegexValidator
    # phone_regex = RegexValidator(
    #     regex=r'^\+?\d{9,15}$',
    #     message="Phone number must be entered in the format: '+999999999'. Up to 15 digits allowed."
    # )
    # phone_number = models.CharField(validators=[phone_regex], max_length=17, blank=True, null=True)


class DeviceSession(models.Model):
    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user            = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="device_sessions")
    device_name     = models.CharField(max_length=255, blank=True)
    user_agent      = models.TextField(blank=True)
    ip_address      = models.GenericIPAddressField(blank=True, null=True)
    first_seen_at   = models.DateTimeField(auto_now_add=True)
    last_seen_at    = models.DateTimeField(auto_now=True)
    last_refresh_at = models.DateTimeField(blank=True, null=True)
    revoked_at      = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-last_seen_at"]

    def __str__(self):
        return f"{self.user} - {self.device_name or 'Unknown device'}"

    @property
    def is_active(self):
        return self.revoked_at is None


class VerificationReason(models.TextChoices):
    SIGNUP              = "signup", "Signup"
    EMAIL_UPDATE        = "email_update", "Email update"
    PASSWORD_CHANGE     = "password_change", "Password change"
    PASSWORD_RECOVERY   = "password_recovery", "Password recovery"
    TWO_FACTOR_LOGIN    = "two_factor_login", "Two-factor login"
    VENUE_SIGNUP_EMAIL_VERIFY = "venue_email", "Venue email"


class VerificationChallenge(models.Model):
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user                = models.ForeignKey(CustomUser, null=True, on_delete=models.CASCADE, related_name="verification_challenges")
    reason              = models.CharField(max_length=24, choices=VerificationReason.choices)
    email               = models.EmailField()
    payload             = models.JSONField(default=dict) # Extra info used to finish action, after verification
    code_hash           = models.CharField(max_length=128, blank=True) # 6digits verification code hash
    created_at          = models.DateTimeField(auto_now_add=True)
    expires_at          = models.DateTimeField()
    code_expires_at     = models.DateTimeField()
    last_sent_at        = models.DateTimeField()
    attempts            = models.PositiveIntegerField(default=0) # incorrect code submissions
    locked_until        = models.DateTimeField(null=True, blank=True)
    verified_at         = models.DateTimeField(null=True, blank=True)
    completion_token_hash = models.CharField(max_length=64, blank=True) # Authorizes the verified flow's final action.
    closed_at           = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["user"], condition=models.Q(closed_at__isnull=True) & ~models.Q(reason=VerificationReason.TWO_FACTOR_LOGIN),
            name="one_open_verification_per_user",
        ), models.UniqueConstraint(
            fields=["user"], condition=models.Q(closed_at__isnull=True, reason=VerificationReason.TWO_FACTOR_LOGIN),
            name="one_open_login_challenge_per_user",
        )]
