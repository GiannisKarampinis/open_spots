from django.contrib import admin
from .models import Venue, Booking

# Register your models here.
@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ('name', 'kind', 'location', 'capacity', 'available_tables', 'average_rating')
    search_fields = ('name', 'location', 'kind')


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('user', 'venue', 'date', 'time', 'num_people', 'created_at')
    list_filter = ('date', 'venue')
    search_fields = ('user__username', 'venue__name')
    ordering = ('-created_at',)
    
