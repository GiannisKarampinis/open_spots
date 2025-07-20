from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import datetime

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
    capacity = models.PositiveIntegerField()
    available_tables = models.PositiveIntegerField()
    image = models.ImageField(upload_to='venues/', blank=True, null=True)
    average_rating = models.FloatField(default=0.0)  # If reviews are added later, make this computed
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='owned_venues'
    )

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
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('cancelled', 'Cancelled'),
    )

    venue = models.ForeignKey('Venue', on_delete=models.CASCADE, related_name='reservations')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
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