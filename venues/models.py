from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.contrib.auth import get_user_model


class Venue(models.Model):
    VENUE_TYPES = [
        ('restaurant', 'Restaurant'),
        ('cafe', 'Cafe'),
        ('bar', 'Bar'),
        ('beach_bar', 'Beach Bar'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=20, choices=VENUE_TYPES, default='other')
    location = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    available_tables = models.PositiveIntegerField()
    image = models.ImageField(upload_to='venues/', blank=True, null=True)
    average_rating = models.FloatField(default=0.0)
    is_full = models.BooleanField(default=False)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    email = models.EmailField(null=True, blank=True)   
    phone = models.CharField(max_length=20, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='owned_venues'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']



class Table(models.Model):
    venue = models.ForeignKey('Venue', on_delete=models.CASCADE, related_name='tables')
    number = models.PositiveIntegerField()
    seats = models.PositiveIntegerField()

    class Meta:
        unique_together = ('venue', 'number')
        ordering = ['number']

    def __str__(self):
        return f"Table {self.number} ({self.seats} seats) at {self.venue.name}"


class Reservation(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reservations')
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='reservations')
    name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)  # Optional phone number
    date = models.DateField()
    time = models.TimeField()
    guests = models.PositiveIntegerField()
    status = models.CharField(max_length=10, choices=[
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected')
    ], default='pending')
    table = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.name} - {self.date} at {self.time} ({self.venue.name})"

    def is_upcoming(self):
        reservation_datetime = datetime.combine(self.date, self.time)
        return reservation_datetime >= timezone.now()

    class Meta:
        ordering = ['-date', 'time']

class VenueApplication(models.Model):
    VENUE_TYPES = [
        ('restaurant', 'Restaurant'),
        ('cafe', 'Cafe'),
        ('bar', 'Bar'),
        ('beach_bar', 'Beach Bar'),
        ('other', 'Other'),
    ]

    venue_name = models.CharField(max_length=100)
    venue_type = models.CharField(max_length=20, choices=VENUE_TYPES, default='other')
    location = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    capacity = models.PositiveIntegerField()
    admin_name = models.CharField(max_length=100)
    admin_email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    reviewed = models.BooleanField(default=False)
    accepted = models.BooleanField(null=True, blank=True)  # None = pending

    def __str__(self):
        return f"{self.venue_name} ({self.admin_email})"

    class Meta:
        ordering = ['-submitted_at']
        
class VenueVisit(models.Model):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    session_key = models.CharField(max_length=40, blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.user:
            return f"{self.user.username} visited {self.venue.name} at {self.timestamp}"
        return f"Anonymous visit to {self.venue.name} at {self.timestamp}"
    


User = get_user_model()

@receiver(post_save, sender=Venue)
def create_admin_user_for_venue(sender, instance, created, **kwargs):
    if created and not instance.owner and instance.email:
        username = instance.email
        raw_password = User.objects.make_random_password()

        if not User.objects.filter(username=username).exists():
            user = User.objects.create_user(username=username, email=instance.email, password=raw_password)
            user.is_staff = True
            user.save()

            instance.owner = user
            instance.save(update_fields=['owner'])

            try:
                send_mail(
                    subject='Venue Admin Account Created',
                    message=(
                        f'Admin account created for venue "{instance.name}".\n'
                        f'Login: {username}\nPassword: {raw_password}'
                    ),
                    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'openspots.application@gmail.com'),
                    recipient_list=[instance.email],
                    fail_silently=False,
                )
            except Exception as e:
                # Handle case where email sending fails (log or ignore)
                print(f"Failed to send email: {e}")
