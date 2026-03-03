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
from django.core.exceptions             import ValidationError


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
    
    def has_overlapping_reservation(self, date, start_time, duration_hours=1, user=None):
        start_dt = datetime.combine(date, start_time)
        end_dt = start_dt + timedelta(hours=duration_hours)

        base = self.reservations.all()
        if user:
            base = base.filter(user=user)

        # same calendar day
        if end_dt.date() == start_dt.date():
            return base.filter(
                date=date,
                time__gte=start_dt.time(),
                time__lt=end_dt.time(),
            ).exists()

        # crosses midnight -> check [start_time..23:59] on date AND [00:00..end_time) on next day
        next_date = date + timedelta(days=1)

        return (
            base.filter(date=date, time__gte=start_dt.time()).exists()
            or base.filter(date=next_date, time__lt=end_dt.time()).exists()
        )    
        
    def get_first_image(self):
        return self.images.filter(
            approved            = True,
            marked_for_deletion = False
        ).order_by("order").first()
    
    @staticmethod
    def _generate_slot_datetimes(date, open_time, close_time, closes_next_day: bool, step_minutes: int = 30):
        start_dt = datetime.combine(date, open_time)
        end_date = date + timedelta(days=1) if closes_next_day else date
        end_dt = datetime.combine(end_date, close_time)

        slots = []
        cur = start_dt
        while cur < end_dt:
            slots.append(cur)
            cur += timedelta(minutes=step_minutes)
        return slots
        
    @staticmethod
    def _offset_from_open(open_dt: datetime, slot_dt: datetime, step_minutes: int = 30):
        """
        Returns integer offset if slot_dt aligns with open_dt by step_minutes.
        offset=0 -> open_dt, offset=1 -> open_dt+30min, etc.
        Works across midnight because these are full datetimes.
        """
        delta = slot_dt - open_dt
        minutes = int(delta.total_seconds() // 60)
        if minutes < 0:
            return None
        if minutes % step_minutes != 0:
            return None
        return minutes // step_minutes    # In your Venue model

    def get_available_time_slots(self, date):
        """
        Returns computed 30-min slots for the selected *business date* (the day the user clicked).

        Uses:
        - WorkingDay baseline for that weekday (open/close/closed + closes_next_day)
        - Exceptions stored as (date, time) on the *actual calendar date* of each slot
        - Reservations stored as (date, time) on the *actual calendar date* of each slot

        Returns a list of dicts:
        [
            {
            "time": time_obj,
            "slot_date": date_obj,          # actual calendar date of the slot
            "is_next_day": bool,            # slot_date != business date
            "offset": int,                  # 0-based from business opening
            "is_blocked": bool,
            "is_reserved": bool,
            "is_available": bool,
            },
            ...
        ]
        """
        weekday = date.weekday()

        wd = self.working_days.filter(weekday=weekday).first()
        if not wd or wd.is_closed:
            return []

        slot_dts = self._generate_slot_datetimes(
            date            = date,
            open_time       = wd.open_time,
            close_time      = wd.close_time,
            closes_next_day = wd.closes_next_day_effective,
            step_minutes    = 30,
        )
        if not slot_dts:
            return []

        open_dt = slot_dts[0]

        # We only need to query reservations/exceptions for the dates that appear in slot_dts
        relevant_dates = sorted({dt.date() for dt in slot_dts})

        # Reservations that collide with any candidate slot
        reserved_pairs = set(
            self.reservations
                .filter(date__in=relevant_dates)
                .values_list("date", "time")
        )

        # Exceptions: store as (date, time) — model should be like:
        #   venue FK, date DateField, time TimeField, unique(venue,date,time)
        blocked_pairs = set(
            self.closed_times
                .filter(date__in=relevant_dates)
                .values_list("date", "time")
        )

        results = []
        for dt in slot_dts:
            key = (dt.date(), dt.time())

            is_reserved = key in reserved_pairs
            is_blocked  = key in blocked_pairs
            is_available = (not is_reserved) and (not is_blocked)

            results.append({
                "time": dt.time(),
                "slot_date": dt.date(),
                "is_next_day": dt.date() != date,
                "offset": self._offset_from_open(open_dt, dt, step_minutes=30),
                "is_blocked": is_blocked,
                "is_reserved": is_reserved,
                "is_available": is_available,
            })

        return results

    class Meta:
        ordering = ['name']
        
###########################################################################################

###########################################################################################
class WorkingDay(models.Model):
    class Weekday(models.IntegerChoices):
        MONDAY    = 0, "Monday"
        TUESDAY   = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY  = 3, "Thursday"
        FRIDAY    = 4, "Friday"
        SATURDAY  = 5, "Saturday"
        SUNDAY    = 6, "Sunday"

    venue           = models.ForeignKey("Venue", on_delete=models.CASCADE, related_name="working_days")
    weekday         = models.PositiveSmallIntegerField(choices=Weekday.choices)
    is_closed       = models.BooleanField(default=False)
    open_time       = models.TimeField(null=True, blank=True)
    close_time      = models.TimeField(null=True, blank=True)
    closes_next_day = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["venue", "weekday"], name="uniq_venue_weekday_workingday"),
        ]
        ordering = ["weekday"]

    @property
    def closes_next_day_effective(self) -> bool:
        if self.is_closed:
            return False
        if self.open_time is None or self.close_time is None:
            return False
        return self.closes_next_day

    def clean(self):
        if self.is_closed:
            self.open_time = None
            self.close_time = None
            self.closes_next_day = False
            return

        if self.open_time is None or self.close_time is None:
            raise ValidationError("Provide open_time and close_time when is_closed=False.")

        if self.open_time == self.close_time:
            raise ValidationError("open_time and close_time cannot be equal.")

        # Infer crossing midnight
        self.closes_next_day = self.close_time < self.open_time

        # 30-min alignment
        for t, label in [(self.open_time, "open_time"), (self.close_time, "close_time")]:
            if t.minute not in (0, 30):
                raise ValidationError(f"{label} must be aligned to :00 or :30 for 30-min slots.")

    @property
    def close_time_label(self) -> str:
        """
        Returns 'HH:MM' or 'HH:MM (+1 day)' when closes_next_day is True.
        """
        if self.is_closed or self.close_time is None:
            return ""
        suffix = " (+1 day)" if self.closes_next_day else ""
        return f"{self.close_time.strftime('%H:%M')}{suffix}"

    @property
    def closes_next_day_label(self) -> str:
        """
        Useful for a column display (instead of boolean checkbox).
        """
        return "(+1 day)" if self.closes_next_day else ""

    def save(self, *args, **kwargs):
        self.full_clean()  # Validate before saving
        super().save(*args, **kwargs)

    def __str__(self):
        day = self.get_weekday_display()
        if self.is_closed:
            return f"{self.venue.name} - {day}: Closed"
        return f"{self.venue.name} - {day}: {self.open_time.strftime('%H:%M')}–{self.close_time_label}"

class VenueClosedTime(models.Model):
    venue = models.ForeignKey("Venue", on_delete=models.CASCADE, related_name="closed_times")
    date = models.DateField()
    time = models.TimeField()
    note = models.CharField(max_length=120, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["venue", "date", "time"], name="uniq_venue_date_time_closedtime")
        ]
        ordering = ["date", "time"]

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
    
    user                = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reservations') # required by default
    venue               = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='reservations') # required by default
    firstname           = models.CharField(max_length=150)          # required by default
    lastname            = models.CharField(max_length=150)          # required by default
    email               = models.EmailField()                       # required by default
    phone               = models.CharField(max_length=20)           # required by default
    date                = models.DateField()                        # required by default
    time                = models.TimeField()                        # required by default
    guests              = models.PositiveIntegerField()             # required by default
    status              = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    arrival_status      = models.CharField(max_length=20, choices=ARRIVAL_STATUS_CHOICES, default='pending')
    table               = models.ForeignKey(Table, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at          = models.DateTimeField(auto_now=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    comments            = models.TextField(blank=True, null=True)   # optional
    special_requests    = models.CharField(max_length=20, choices=SPECIAL_REQUESTS_CHOICES, default='none') 
    allergies           = models.TextField(blank=True, null=True)   # optional
    objects             = ReservationManager() 
    seen                = models.BooleanField(default=False) # For owner dashboard: has the owner seen this reservation in their dashboard yet?

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
        first = self.firstname or ""
        last  = self.lastname or ""
        return f"{first} {last}".strip() or None 

    class Meta:
        ordering = ['-updated_at', '-created_at', 'time']
        constraints = [
            models.UniqueConstraint(
                fields=['venue', 'user', 'date', 'time'],
                name='unique_user_reservation_per_slot'
            )
        ]


class ReservationOutboxEvent(models.Model):
    CHANNEL_WEBSOCKET = 'websocket'
    CHANNEL_EMAIL = 'email'
    CHANNEL_BOTH = 'both'

    CHANNEL_CHOICES = [
        (CHANNEL_WEBSOCKET, 'WebSocket'),
        (CHANNEL_EMAIL, 'Email'),
        (CHANNEL_BOTH, 'Both'),
    ]

    STATUS_PENDING      = 'pending'     # queued, waiting to be processed
    STATUS_PROCESSING   = 'processing'  # worker currntly processing this event
    STATUS_SENT         = 'sent'        # delivered successfully
    STATUS_FAILED       = 'failed'      # last attempt failed, will retry based on next_retry_at

    STATUS_CHOICES = [
        (STATUS_PENDING,    'Pending'),
        (STATUS_PROCESSING, 'Processing'),
        (STATUS_SENT,       'Sent'),
        (STATUS_FAILED,     'Failed'),
    ]

    reservation = models.ForeignKey(
        'Reservation',
        on_delete=models.CASCADE,
        related_name='outbox_events',
    )
    venue = models.ForeignKey(
        'Venue',
        on_delete=models.CASCADE,
        related_name='outbox_events',
    )
    event_type      = models.CharField(max_length=64)
    channel         = models.CharField(max_length=16, choices=CHANNEL_CHOICES, default=CHANNEL_BOTH)
    payload         = models.JSONField(default=dict)
    idempotency_key = models.CharField(max_length=255, unique=True)
    status          = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    attempts        = models.PositiveIntegerField(default=0)
    next_retry_at   = models.DateTimeField(default=timezone.now)
    last_error      = models.TextField(blank=True, default='')
    sent_at         = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['status', 'next_retry_at']),
            models.Index(fields=['venue', 'created_at']),
        ]

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
# Reviewd at 24-12-2025 - OK
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

    class Meta:
        ordering = ['-submitted_at']
        indexes = [
            models.Index(fields=['venue', 'approval_status']),
        ]
    
    def __str__(self):
        return f"Venue Update Request for {self.venue.name} (status: {self.approval_status})"

    def mark_reviewed(self, *, user, status: str):
        """
            Call this from your admin approval/reject action.
        """
        if status not in {"approved", "rejected"}:
            raise ValueError("status must be 'approved' or 'rejected'")
        self.approval_status = status
        self.reviewed_by = user
        self.reviewed_at = timezone.now()
        self.save(update_fields=["approval_status", "reviewed_by", "reviewed_at"])

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

        # Only report changes if sets differ
        if hasattr(venue, "images"):
            new_images = venue.images.filter(update_request=self, approved=False)
            if new_images.exists():
                changes["new_images"] = [img.image.url for img in new_images]

        # Menu images
        if hasattr(venue, "menu_images"):
            new_menu = venue.menu_images.filter(update_request=self, approved=False)
            if new_menu.exists():
                changes["new_menu_images"] = [img.image.url for img in new_menu]

        return changes

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
        # Keep original directory (relative path)
        original_path = self.image.name  # e.g. "venues/2/abc.jpg"
        dir_name = os.path.dirname(original_path)
        base_name = os.path.splitext(os.path.basename(original_path))[0]

        webp_file = convert_image_to_webp(self.image)
        new_name = os.path.join(dir_name, f"{base_name}.webp") if dir_name else f"{base_name}.webp"

        self.image.save(new_name, webp_file, save=False)

    def save(self, *args, **kwargs):
        if self.image_has_changed():
            self.convert_and_save_webp()
        super().save(*args, **kwargs)
        # Update stored name so future saves behave correctly
        self._original_image_name = self.image.name


###########################################################################################

###########################################################################################
from django.core.exceptions import ValidationError
from PIL                    import Image

MAX_IMAGE_MB            = 8
ALLOWED_CONTENT_TYPES   = {"image/jpeg", "image/png", "image/webp"}

def validate_image_upload(f):
    if f.size > MAX_IMAGE_MB * 1024 * 1024:
        raise ValidationError(f"Max file size is {MAX_IMAGE_MB}MB.")

    ct = getattr(f, "content_type", None)
    if ct and ct.lower() not in ALLOWED_CONTENT_TYPES:
        raise ValidationError("Only JPG, PNG, or WEBP images are allowed.")

    try:
        img = Image.open(f)
        img.verify()  # Verify that it's an image
    except Exception:
        raise ValidationError("Uploaded file is not a valid image.")
    finally:
        f.seek(0)  # Reset file pointer after verificatio

###########################################################################################

###########################################################################################
class VenueImage(BaseWebpImageModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to=venue_image_upload, validators=[validate_image_upload])
    order = models.PositiveIntegerField(default=0)

    # NEW FIELDS
    approved = models.BooleanField(default=False)
    marked_for_deletion = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.venue.name} - Image"
###########################################################################################

###########################################################################################
class VenueMenuImage(BaseWebpImageModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='menu_images')
    image = models.ImageField(upload_to=menu_image_upload, validators=[validate_image_upload])
    order = models.PositiveIntegerField(default=0)

    # NEW FIELDS
    approved = models.BooleanField(default=False)
    marked_for_deletion = models.BooleanField(default=False)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.venue.name} - Menu Image"

###########################################################################################

###########################################################################################