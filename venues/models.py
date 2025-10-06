import logging
import os
from django.db                          import models
from django.conf                        import settings
from django.utils                       import timezone
from datetime                           import datetime
from django.db.models.signals           import post_save
from django.dispatch                    import receiver
from django.core.mail                   import send_mail
from django.contrib.auth                import get_user_model
from django.utils.crypto                import get_random_string
from django.contrib.auth.models         import Permission
from django.contrib.contenttypes.models import ContentType
from accounts.tools                     import send_verification_code
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
    available_tables    = models.PositiveIntegerField()
    image               = models.ImageField(upload_to='media/venues/', blank=True, null=True)
    average_rating      = models.FloatField(default=0.0)
    is_full             = models.BooleanField(default=False)
    latitude            = models.DecimalField(max_digits=18, decimal_places=12, blank=True, null=True)
    longitude           = models.DecimalField(max_digits=18, decimal_places=12, blank=True, null=True)
    email               = models.EmailField(null=True, blank=True)   
    phone               = models.CharField(max_length=20, blank=True)
    owner               = models.ForeignKey(
                                                settings.AUTH_USER_MODEL,
                                                on_delete=models.SET_NULL,
                                                null=True,
                                                blank=True,
                                                related_name='owned_venues'
                                            )
    
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']
        
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
    first_name      = models.CharField(max_length=100)
    last_name       = models.CharField(max_length=100)
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
        return f"{self.first_name} {self.last_name}" 

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
    capacity        = models.PositiveIntegerField()
    admin_name      = models.CharField(max_length=100)
    admin_email     = models.EmailField()
    phone           = models.CharField(max_length=20, blank=True)
    submitted_at    = models.DateTimeField(auto_now_add=True)
    reviewed        = models.BooleanField(default=False)
    accepted        = models.BooleanField(null=True, blank=True)  # None = pending

    def __str__(self):
        return f"{self.venue_name} ({self.admin_email})"

    class Meta:
        ordering = ['-submitted_at']

###########################################################################################

###########################################################################################        
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
    
def assign_venue_permissions(user):
    content_type = ContentType.objects.get_for_model(Venue)
    perms = Permission.objects.filter(content_type=content_type, codename__in=[
        'view_venue', 'change_venue'
    ])
    user.user_permissions.set(perms)
    user.save()

User = get_user_model()
logger = logging.getLogger(__name__)

@receiver(post_save, sender=Venue)
def create_admin_user_for_venue(sender, instance, created, **kwargs):
    logger.info(f"Signal triggered for venue '{instance.name}', created={created}")

    if not created:
        return

    if not instance.email:
        logger.warning(f"No email provided for venue '{instance.name}', skipping admin user creation.")
        return

    try:
        raw_password = get_random_string(12)
        username = instance.name.lower().replace(" ", "_") + "_admin"

        if not User.objects.filter(username=username).exists():
            user = User.objects.create_user(
                username=username,
                email='',
                password=raw_password
            )
            user.is_staff = True
            user.user_type = 'venue_admin'
            user.unverified_email = instance.email
            user.email_verified = False
            user.save()
            assign_venue_permissions(user)

            instance.owner = user
            instance.save(update_fields=["owner"])

            send_verification_code(user)  # Send verification code to unverified_email

            send_mail(
                subject='Your OpenSpots Venue Admin Account',
                message=(
                    f"Welcome to OpenSpots!\n\nYour admin account is ready:\n"
                    f"Username: {username}\n"
                    f"Email: {instance.email}\n"
                    f"Password: {raw_password}\n\n"
                    f"Login and change your password ASAP."
                ),
                from_email='openspots.application@gmail.com',
                recipient_list=[instance.email],
                fail_silently=False,
            )

            logger.info(f"Admin user created and email sent for venue '{instance.name}'.")

    except Exception as e:
        logger.error(f"Failed to create admin user or send email for venue '{instance.name}': {e}")

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
    available_tables    = models.PositiveIntegerField(default=0)
    
    APPROVAL_STATUS_CHOICES = [
        ('pending',     'Pending'),
        ('approved',    'Approved'),
        ('rejected',    'Rejected'),
    ]
    
    approval_status     = models.CharField(max_length=20, choices=APPROVAL_STATUS_CHOICES, default='pending')
    reviewed_by         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_update_requests')
    reviewed_at         = models.DateTimeField(null=True, blank=True)
    submitted_at        = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Venue Update Request for {self.venue.name} (status: {self.approval_status})"

    def get_changes(self):
        """Return a dict of changed fields {field: (old, new)}"""
        venue   = self.venue
        changes = {}

        # List fields you want to track
        fields_to_check = [
            "name", "kind", "location", "email",
            "phone", "description", "available_tables"
        ]

        for field in fields_to_check:
            old_value = getattr(venue, field)
            new_value = getattr(self, field)
            if old_value != new_value:
                changes[field] = (old_value, new_value)

        # Track images
        old_images = [img.image.url for img in venue.images.all()]
        new_images = [img.image.url for img in self.images.all()]
        if old_images != new_images:
            changes["images"] = (old_images, new_images)

        # Track menu images
        old_menu = [img.image.url for img in venue.menu_images.all()]
        new_menu = [img.image.url for img in self.menu_images.all()]
        if old_menu != new_menu:
            changes["menu_images"] = (old_menu, new_menu)

        return changes
    
    class Meta:
        unique_together = ("venue", "approval_status")
    
###########################################################################################

###########################################################################################
def venue_image_upload(instance, filename):
    if hasattr(instance, 'update_request'):
        # For VenueUpdateImage
        venue_id = instance.update_request.venue.id
    else:
        # For VenueImage
        venue_id = instance.venue.id
    return f'media/venues/{venue_id}/images/{filename}'

def menu_image_upload(instance, filename):
    if hasattr(instance, 'update_request'):
        venue_id = instance.update_request.venue.id
    else:
        venue_id = instance.venue.id
    return f'media/venues/{venue_id}/menu/{filename}'

class VenueImage(models.Model):
    venue = models.ForeignKey(
        Venue, on_delete=models.CASCADE, related_name='images'
    )
    image = models.ImageField(upload_to=venue_image_upload)

    def save(self, *args, **kwargs):
        if self.image:
            original_name = os.path.splitext(self.image.name)[0]
            webp_file = convert_image_to_webp(self.image)
            self.image.save(f"{original_name}.webp", webp_file, save=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.venue.name} - Image"


class VenueMenuImage(models.Model):
    venue = models.ForeignKey(
        Venue, on_delete=models.CASCADE, related_name='menu_images'
    )
    image = models.ImageField(upload_to=menu_image_upload)

    def save(self, *args, **kwargs):
        if self.image:
            original_name = os.path.splitext(self.image.name)[0]
            webp_file = convert_image_to_webp(self.image)
            self.image.save(f"{original_name}.webp", webp_file, save=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.venue.name} - Menu Image"

class VenueUpdateImage(models.Model):
    update_request  = models.ForeignKey(VenueUpdateRequest, on_delete=models.CASCADE, related_name='images')
    image           = models.ImageField(upload_to=venue_image_upload)

    def save(self, *args, **kwargs):
        if self.image:
            original_name   = os.path.splitext(self.image.name)[0]
            webp_file       = convert_image_to_webp(self.image)
            self.image.save(f"{original_name}.webp", webp_file, save=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.update_request.venue.name} - Image"


class VenueUpdateMenuImage(models.Model):
    update_request  = models.ForeignKey(VenueUpdateRequest, on_delete=models.CASCADE, related_name='menu_images')
    image           = models.ImageField(upload_to=menu_image_upload)

    def save(self, *args, **kwargs):
        if self.image:
            original_name   = os.path.splitext(self.image.name)[0]
            webp_file       = convert_image_to_webp(self.image)
            self.image.save(f"{original_name}.webp", webp_file, save=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.update_request.venue.name} - Menu Image"    