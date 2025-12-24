import logging
import os

from django.db                          import models, transaction
from django.conf                        import settings
from django.utils                       import timezone
from datetime                           import datetime, timedelta, time
from django.db.models.signals           import post_save
from django.dispatch                    import receiver
from django.db.models                   import Q
from django.core.mail                   import send_mail
from django.contrib.auth                import get_user_model
from django.utils.crypto                import get_random_string
from django.contrib.auth.models         import Permission
from django.contrib.contenttypes.models import ContentType
#from emails_manager.utils               import send_verification_code
from django.db.models                   import JSONField  # Django 3.1+ has models.JSONField; import whichever is appropriate
from .utils                             import get_coords_nominatim, convert_image_to_webp


###########################################################################################

###########################################################################################
class Venue(models.Model):
    VENUE_TYPES = [
                    ('restaurant',  'Restaurant'),
                    ('cafe',        'Cafe'),
                    ('bar',         'Bar'),
                    ('beach_bar',   'Beach Bar'),
                    ('other',       'Other'),
                ]

    name                = models.CharField(max_length=100)
    kind                = models.CharField(max_length=20, choices=VENUE_TYPES, default='other')
    location            = models.CharField(max_length=255)
    description         = models.TextField(blank=True)
    average_rating      = models.FloatField(default=0.0)
    is_full             = models.BooleanField(default=False)
    latitude            = models.DecimalField(max_digits=18, decimal_places=12, blank=True, null=True)
    longitude           = models.DecimalField(max_digits=18, decimal_places=12, blank=True, null=True)
    email               = models.EmailField(null=True, blank=True)   
    phone               = models.CharField(max_length=20, blank=True)
    owner               = models.ForeignKey(
                                                settings.AUTH_USER_MODEL,
                                                on_delete       = models.SET_NULL,
                                                null            = True,
                                                blank           = True,
                                                related_name    = 'owned_venues'
                                            )
    
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
    
    def has_overlapping_reservation(self, date, start_time, duration_hours=1):
        start_dt = datetime.combine(date, start_time)
        end_dt = start_dt + timedelta(hours=duration_hours)

        overlap_start = start_dt - timedelta(hours=2) #FIXME
        overlap_end = end_dt

        return self.reservations.filter(
            date=date,
            time__gte=overlap_start.time(),
            time__lt=overlap_end.time()
        ).exists()

    def get_first_image(self):
        return self.images.filter(
            approved            = True,
            marked_for_deletion = False
        ).order_by("order").first()
    
    def get_available_time_slots(self, date):
        """
        Returns available 15-minute time slots for the selected date.
        Removes slots already reserved for this venue on that date.
        Covers 06:00 → 04:00 next day (22 hours total).
        """

        # Define default operating hours
        start_time = time(6, 0)   # 06:00
        end_time   = time(4, 0)   # 04:00 (next day)

        start_dt = datetime.combine(date, start_time)
        end_dt   = datetime.combine(date + timedelta(days=1), end_time)

        # Generate all 15-minute time slots
        slots = []
        current = start_dt
        while current < end_dt:
            slots.append(current.time())
            current += timedelta(minutes=30)

        # Fetch booked times for this date
        booked = set(
            self.reservations.filter(date=date).values_list("time", flat=True)
        )

        # Remove booked slots
        available = [t for t in slots if t not in booked]

        return available

    class Meta:
        ordering = ['name']
        
###########################################################################################

###########################################################################################

User = settings.AUTH_USER_MODEL

class Review(models.Model):
    venue = models.ForeignKey(
        "Venue",
        on_delete=models.CASCADE,
        related_name="reviews",
        help_text="Venue this review belongs to",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="venue_reviews",
        help_text="Author of the review",
    )

    rating = models.PositiveSmallIntegerField(
        choices=[(i, str(i)) for i in range(1, 6)],
        help_text="Rating from 1 (worst) to 5 (best)",
    )
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("venue", "user")  # one review per user per venue
        ordering = ["-created_at"]
        verbose_name = "Review"
        verbose_name_plural = "Reviews"

    def __str__(self):
        return f"Review {self.rating} — {self.user} @ {self.venue}"

###########################################################################################

###########################################################################################

@receiver(post_save, sender=Venue)
def update_venue_coordinates(sender, instance, created, **kwargs):
    # Only fetch if latitude or longitude are missing and location is set
    if instance.location and (instance.latitude is None or instance.longitude is None):
        lat, lon = get_coords_nominatim(instance.location)
        if lat and lon:
            # Update instance with fetched coordinates
            instance.latitude = lat
            instance.longitude = lon
            # Avoid recursion by updating without sending signal again
            Venue.objects.filter(pk=instance.pk).update(latitude=lat, longitude=lon)

###########################################################################################

###########################################################################################
class Table(models.Model):
    venue = models.ForeignKey('Venue', on_delete=models.CASCADE, related_name='tables')
    number = models.PositiveIntegerField()
    seats = models.PositiveIntegerField()

    class Meta:
        unique_together = ('venue', 'number')
        ordering = ['number']

    def __str__(self):
        return f"Table {self.number} ({self.seats} seats) at {self.venue.name}"

###########################################################################################

###########################################################################################
class ReservationQuerySet(models.QuerySet):
    def upcoming(self):
        now = timezone.now()
        today = now.date()
        now_time = now.time()
        # Reservations after today OR today and time >= now
        return self.filter(
            Q(date__gt=today) |
            Q(date=today, time__gte=now_time)
        )

class ReservationManager(models.Manager):
    def get_queryset(self):
        return ReservationQuerySet(self.model, using=self._db)

    def upcoming(self):
        return self.get_queryset().upcoming()

class Reservation(models.Model):
    STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('accepted',    'Accepted'),
        ('rejected',    'Rejected'),
        ('cancelled',   'Cancelled'),
    ]
    
    ARRIVAL_STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('checked_in',  'Checked-in'),
        ('no_show',     'No-show'),
    ]

    SPECIAL_REQUESTS_CHOICES = [
        ('none',        'None'),
        ('vegan',       'Vegan'),
        ('vegetarian',  'Vegetarian'),
        ('gluten_free', 'Gluten-free'),
        ('wheelchair',  'Wheelchair accessible'),
        ('other',       'Other'),
    ]
    
    user            = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reservations')
    venue           = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='reservations')
    name            = models.CharField(max_length=100)
    email           = models.EmailField()
    phone           = models.CharField(max_length=20)
    date            = models.DateField()
    time            = models.TimeField()
    guests          = models.PositiveIntegerField()
    status          = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    arrival_status  = models.CharField(max_length=20, choices=ARRIVAL_STATUS_CHOICES, default='pending')
    table           = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at      = models.DateTimeField(auto_now=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    comments        = models.TextField(blank=True, null=True)
    special_requests = models.CharField(max_length=20, choices=SPECIAL_REQUESTS_CHOICES, default='none')
    allergies       = models.TextField(blank=True, null=True)
    objects         = ReservationManager()

    def __str__(self):
        return f"{self.full_name} - {self.date} at {self.time} ({self.venue.name})"


    def is_upcoming(self):
        reservation_datetime = timezone.make_aware(
            datetime.combine(self.date, self.time),
            timezone.get_current_timezone()
        )
        
        return reservation_datetime >= timezone.now()

    def save(self, *args, editor=None, **kwargs):
        self._editor = editor  # Store editor for potential use in signals
        print("Editor in save:", editor)
        # If status is accepted and arrival_status is not pending, reset arrival_status to pending
        if self.status == 'accepted' and self.arrival_status not in ['pending', 'checked_in', 'no_show']:
            self.arrival_status = 'pending'
        
        super().save(*args, **kwargs)

    @property
    def editor(self):
        """
        Returns the user who last edited the reservation if set.
        """
        return getattr(self, "_editor", None)

    @property
    def time_display(self):
        try: 
            return self.time.strftime("%I:%M %p")
        except Exception:
            return str(self.time)
        
    @property
    def full_name(self):
        return f"{self.name}" 

    class Meta:
        ordering = ['-updated_at', '-created_at', 'time']

###########################################################################################

###########################################################################################
class VenueApplication(models.Model):
    VENUE_TYPES = [
        ('restaurant', 'Restaurant'),
        ('cafe', 'Cafe'),
        ('bar', 'Bar'),
        ('beach_bar', 'Beach Bar'),
        ('other', 'Other'),
    ]

    venue_name      = models.CharField(max_length=100)
    venue_type      = models.CharField(max_length=20, choices=VENUE_TYPES, default='other')
    location        = models.CharField(max_length=255)
    description     = models.TextField(blank=True)
    phone           = models.CharField(max_length=20, blank=True)
    submitted_at    = models.DateTimeField(auto_now_add=True)
    
    # Venue owner/admin details
    admin_username  = models.CharField(max_length=100)
    admin_email     = models.EmailField()
    admin_firstname = models.CharField(max_length=150, blank=True)
    admin_lastname  = models.CharField(max_length=150, blank=True)
    admin_phone     = models.CharField(max_length=20, blank=True)

    owner_user = models.ForeignKey(
            settings.AUTH_USER_MODEL,
            on_delete=models.SET_NULL,
            null=True,
            blank=True,
            related_name="venue_applications",
    )
    
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    def __str__(self):
        return f"{self.venue_name} ({self.admin_email})"

    class Meta:
        ordering = ['-submitted_at']

###########################################################################################

###########################################################################################        
class VenueVisit(models.Model):
    venue           = models.ForeignKey(Venue, on_delete=models.CASCADE)
    user            = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    session_key     = models.CharField(max_length=40, blank=True, null=True)
    ip_address      = models.GenericIPAddressField(blank=True, null=True)
    timestamp       = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.user:
            return f"{self.user.username} visited {self.venue.name} at {self.timestamp}"
        return f"Anonymous visit to {self.venue.name} at {self.timestamp}"
    
def assign_venue_permissions(user):
    content_type = ContentType.objects.get_for_model(Venue)
    perms = Permission.objects.filter(content_type=content_type, codename__in=[
        'view_venue', 'change_venue'
    ])
    user.user_permissions.set(perms)
    user.save()

User = get_user_model()
logger = logging.getLogger(__name__)

###########################################################################################

###########################################################################################
class VenueUpdateRequest(models.Model):
    venue               = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='update_requests')
    submitted_by        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    name                = models.CharField(max_length=255)
    kind                = models.CharField(max_length=50, choices=Venue.VENUE_TYPES)
    location            = models.CharField(max_length=255)
    email               = models.EmailField(null=True, blank=True)
    phone               = models.CharField(max_length=20, blank=True, null=True)
    description         = models.TextField(blank=True, null=True)
    
    APPROVAL_STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('approved',    'Approved'),
        ('rejected',    'Rejected'),
    ]
    
    approval_status     = models.CharField(max_length=20, choices=APPROVAL_STATUS_CHOICES, default='pending')
    reviewed_by         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_update_requests')
    reviewed_at         = models.DateTimeField(null=True, blank=True)
    submitted_at        = models.DateTimeField(auto_now_add=True)
        
    # Backup snapshot to allow rollback. Requires migration.
    backup_data         = JSONField(null=True, blank=True)    
        
    def __str__(self):
        return f"Venue Update Request for {self.venue.name} (status: {self.approval_status})"

    def get_changes(self):
        """
            Return a dict of changed fields {field: (old, new)}
        """
        venue   = self.venue
        changes = {}

        # List fields you want to track
        fields_to_check = [ "name", "kind", "location", "email", "phone", "description" ]

        for field in fields_to_check:
            old_value = getattr(venue, field)
            new_value = getattr(self, field)
            if old_value != new_value:
                changes[field] = (old_value, new_value)


        existing_images = venue.images.filter(approved=True, marked_for_deletion=False)
        new_images      = venue.images.filter(approved=False)   # Newly uploaded
        deleted_images  = venue.images.filter(marked_for_deletion=True)
        
        # Only report changes if sets differ
        if new_images.exists():
            changes["new_images"] = [img.image.url for img in new_images]

        if deleted_images.exists():
            changes["deleted_images"] = [img.image.url for img in deleted_images]

        # Menu images
        existing_menu = venue.menu_images.filter(approved=True, marked_for_deletion=False)
        new_menu      = venue.menu_images.filter(approved=False)
        deleted_menu  = venue.menu_images.filter(marked_for_deletion=True)

        if new_menu.exists():
            changes["new_menu_images"] = [img.image.url for img in new_menu]

        if deleted_menu.exists():
            changes["deleted_menu_images"] = [img.image.url for img in deleted_menu]

        return changes
    
    #class Meta:
        #unique_together = ("venue", "approval_status")
    
###########################################################################################

###########################################################################################
def venue_image_upload(instance, filename):
    return f"venues/{instance.venue.id}/images/{filename}"

def menu_image_upload(instance, filename):
    return f"venues/{instance.venue.id}/menu/{filename}"

###########################################################################################

###########################################################################################
class BaseWebpImageModel(models.Model):
    """
    Abstract base model that ensures images are converted to webp only if changed.
    Child models must declare their own `image = models.ImageField(upload_to=...)`.
    """
    image = models.ImageField(upload_to="")  # overridden by children

    class Meta:
        abstract = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._original_image_name = self.image.name # Store initial name to detect changes

    def image_has_changed(self):
        """
        Detect real file changes:
        - New file? convert.
        - Same file name? No conversion.
        - Already a .webp file coming from copying? No conversion.
        """
        if not self.image:
            return False

        new_name = os.path.basename(self.image.name)
        old_name = os.path.basename(self._original_image_name or "")

        # Case 1: New object → convert once
        if not old_name:
            return True

        # Case 2: Same basename → same file → NO conversion
        if new_name == old_name:
            return False

        # Case 3: Already .webp → do NOT reconvert
        if new_name.endswith(".webp"):
            return False

        return True

    def convert_and_save_webp(self):
        uploaded_name = os.path.basename(self.image.name)
        base_name = os.path.splitext(uploaded_name)[0]

        webp_file = convert_image_to_webp(self.image)

        # Save using cleaned filename (no directories!)
        self.image.save(f"{base_name}.webp", webp_file, save=False)

    def save(self, *args, **kwargs):
        if self.image_has_changed():
            self.convert_and_save_webp()
        super().save(*args, **kwargs)
        # Update stored name so future saves behave correctly
        self._original_image_name = self.image.name

###########################################################################################

###########################################################################################
class VenueImage(BaseWebpImageModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to=venue_image_upload)
    order = models.PositiveIntegerField(default=0)

    # NEW FIELDS
    approved = models.BooleanField(default=True)
    marked_for_deletion = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.venue.name} - Image"
###########################################################################################

###########################################################################################
class VenueMenuImage(BaseWebpImageModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='menu_images')
    image = models.ImageField(upload_to=menu_image_upload)
    order = models.PositiveIntegerField(default=0)

    # NEW FIELDS
    approved = models.BooleanField(default=True)
    marked_for_deletion = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.venue.name} - Menu Image"

###########################################################################################

###########################################################################################