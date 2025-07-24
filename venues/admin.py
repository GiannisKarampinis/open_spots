from    django.contrib              import admin
from    .models                     import Venue, Table, Reservation, VenueApplication, VenueVisit
from    django.utils.html           import format_html
from    django.urls                 import path, reverse
from    django.template.response    import TemplateResponse
from    django.contrib.admin        import AdminSite
from    django.utils.html           import format_html
from    django.contrib.auth.decorators import user_passes_test

class TableInline(admin.TabularInline):  # or StackedInline if you prefer
    model = Table
    extra = 1  # How many blank inlines to show

@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    readonly_fields     = ['image_tag']
    inlines             = [TableInline]  # your existing inline

    @admin.display(description="Venue Dashboard")
    def open_dashboard(self, obj):
        try:
            url = reverse('venue_dashboard', kwargs={'venue_id': obj.id})
        except Exception as e:
            url = '#'
        print(url)
        return format_html('<a href="{}" target="_blank">Open Dashboard</a>', url)
    # dashboard_link.short_description = "Venue Dashboard"

    def image_tag(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height: 50px;" />', obj.image.url)
        return "No Image"
    image_tag.short_description = 'Image'

    list_display        = ('name', 'kind', 'location', 'available_tables', 'average_rating', 'image_tag', 'open_dashboard',)
    
    def save_model(self, request, obj, form, change):
        created = not change
        super().save_model(request, obj, form, change)
        # Your existing code for auto-creating owner user, etc.

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}  # Hide model completely for other users

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.user_type == 'venue_admin':
            return qs.filter(owner=request.user)  # Use 'owner' field from your model
        return qs


@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ('venue', 'number', 'seats')
    list_filter = ('venue',)
    search_fields = ('venue__name',)
    # autocomplete_fields = ['venue']

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

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}  # Hide this model completely from dashboard for other users





@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('venue', 'name', 'email', 'date', 'time', 'guests', 'status', 'table')
    list_filter = ('venue', 'status', 'date')
    search_fields = ('name', 'email', 'venue__name')
    ordering = ('-date', 'time')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # Superusers see all reservations
        if request.user.is_superuser:
            return qs
        # Venue owners only see reservations for their venues
        return qs.filter(venue__owner=request.user)

    def has_change_permission(self, request, obj=None):
        # Prevent venue admins from editing others' reservations
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        # Same logic for deletion
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_delete_permission(request, obj)
    
    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}  # Hide this model completely from dashboard for other users


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


@admin.register(VenueVisit)
class VenueVisitAdmin(admin.ModelAdmin):
    list_display = ('venue', 'user', 'ip_address', 'timestamp')
    list_filter = ('venue', 'timestamp')
    search_fields = ('venue__name', 'user__username', 'ip_address')
    readonly_fields = ('venue', 'user', 'ip_address', 'timestamp')

