from django.contrib import admin
from .models import Venue, Table, Reservation, VenueApplication, VenueVisit
from django.utils.html import format_html

@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'location', 'capacity', 'available_tables', 'average_rating', 'image_tag')
    readonly_fields = ['image_tag']

    def image_tag(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height: 50px;" />', obj.image.url)
        return "No Image"

    image_tag.short_description = 'Image'


@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ('venue', 'number', 'seats')
    list_filter = ('venue',)
    search_fields = ('venue__name',)


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('venue', 'name', 'email', 'date', 'time', 'guests', 'status', 'table')
    list_filter = ('venue', 'status', 'date')
    search_fields = ('name', 'email', 'venue__name')
    ordering = ('-date', 'time')


@admin.register(VenueApplication)
class VenueApplicationAdmin(admin.ModelAdmin):
    list_display = ('venue_name', 'admin_email', 'submitted_at', 'reviewed', 'accepted')
    list_filter = ('reviewed', 'accepted')
    search_fields = ('venue_name', 'admin_email')
    ordering = ('-submitted_at',)

@admin.register(VenueVisit)
class VenueVisitAdmin(admin.ModelAdmin):
    list_display = ('venue', 'user', 'ip_address', 'timestamp')
    list_filter = ('venue', 'timestamp')