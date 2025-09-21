from django.utils import timezone
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from .models import Venue, Table, Reservation, VenueApplication, VenueUpdateRequest, VenueVisit
from django.utils.html import format_html


class TableInline(admin.TabularInline):
    model = Table
    extra = 1


@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    readonly_fields     = ['image_tag']
    inlines             = [TableInline]

    list_display = ('name', 'kind', 'location', 'available_tables', 'average_rating', 'image_tag', 'owner')
    
    def image_tag(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height: 50px;" />', obj.image.url)
        return "No Image"
    image_tag.short_description = 'Image'

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)

    def has_add_permission(self, request):
        return request.user.is_superuser  # Venue admins can't add venues

    def has_change_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        return obj is None or obj.owner == request.user

    def has_delete_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        return obj is not None and obj.owner == request.user

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}


@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ('venue', 'number', 'seats')
    list_filter = ('venue',)
    search_fields = ('venue__name',)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(venue__owner=request.user)

    def has_change_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_delete_permission(request, obj)

    def has_add_permission(self, request):
        if request.user.is_superuser:
            return True
        # Allow adding if user owns at least one venue
        return Venue.objects.filter(owner=request.user).exists()

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display    = ('venue', 'first_name', 'last_name', 'email', 'date', 'time', 'guests', 'status', 'table')
    list_filter     = ('venue', 'status', 'date')
    search_fields   = ('first_name', 'last_name', 'email', 'venue__name')
    ordering        = ('-date', 'time')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(venue__owner=request.user)

    def has_change_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_delete_permission(request, obj)

    def has_add_permission(self, request):
        return request.user.is_superuser or Venue.objects.filter(owner=request.user).exists()

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}
    
    def save_model(self, request, obj, form, change):
        """
        Override to pass the editor (request.user) to Reservation.save()
        """
        obj.save(editor=request.user)


@admin.register(VenueApplication)
class VenueApplicationAdmin(admin.ModelAdmin):
    list_display = ('venue_name', 'admin_email', 'submitted_at', 'reviewed', 'accepted')
    list_filter = ('reviewed', 'accepted')
    search_fields = ('venue_name', 'admin_email')
    ordering = ('-submitted_at',)
    actions = ['mark_as_accepted']

    @admin.action(description="Mark selected applications as accepted")
    def mark_as_accepted(self, request, queryset):
        updated = queryset.update(reviewed=True, accepted=True)
        self.message_user(request, f"{updated} application(s) marked as accepted.")

    def get_model_perms(self, request):
        # Only superusers should manage applications
        if request.user.is_superuser:
            return super().get_model_perms(request)
        return {}


@admin.register(VenueVisit)
class VenueVisitAdmin(admin.ModelAdmin):
    list_display = ('venue', 'user', 'ip_address', 'timestamp')
    list_filter = ('venue', 'timestamp')
    search_fields = ('venue__name', 'user__username', 'ip_address')
    readonly_fields = ('venue', 'user', 'ip_address', 'timestamp')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(venue__owner=request.user)

    def get_model_perms(self, request):
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return super().get_model_perms(request)
        return {}


@admin.register(VenueUpdateRequest)
class VenueUpdateRequestAdmin(admin.ModelAdmin):
    list_display = ("venue", "submitted_by", "approval_status", "submitted_at", "preview_changes")
    list_filter = ("approval_status",)
    actions = ["approve_requests", "reject_requests"]

    def preview_changes(self, obj):
            changes = obj.get_changes()
            if not changes:
                return "No changes"
            html = "<ul>"
            for field, (old, new) in changes.items():
                html += f"<li><b>{field}</b>: <span style='color:red;'>{old}</span> ➝ <span style='color:green;'>{new}</span></li>"
            html += "</ul>"
            return format_html(html)

    preview_changes.short_description = "Proposed Changes"
    preview_changes.allow_tags = True

    def approve_requests(self, request, queryset):
        for update in queryset.filter(approval_status="pending"):
            venue = update.venue
            # Copy over requested fields
            venue.name = update.name
            venue.kind = update.kind
            venue.location = update.location
            venue.email = update.email
            venue.phone = update.phone
            venue.description = update.description
            venue.available_tables = update.available_tables
            if update.image:
                venue.image = update.image
            venue.save()

            update.approval_status = "approved"
            update.reviewed_by = request.user
            update.reviewed_at = timezone.now()
            update.save()

    approve_requests.short_description = "Approve selected requests"

    def reject_requests(self, request, queryset):
        queryset.filter(approval_status="pending").update(
            approval_status="rejected",
            reviewed_by=request.user,
            reviewed_at=timezone.now()
        )
    reject_requests.short_description = "Reject selected requests"
