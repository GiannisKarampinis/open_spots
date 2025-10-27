from django.db                  import models
from django.contrib.auth.models import AbstractUser

class CustomUser(AbstractUser):
    USER_TYPE_CHOICES = (
        ('customer', 'Customer'),
        ('venue_admin', 'Venue Admin'),
    )

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
