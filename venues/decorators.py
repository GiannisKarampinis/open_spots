from functools import wraps
from django.shortcuts import get_object_or_404
from django.http import HttpResponseForbidden
from .models import Venue, Reservation

def venue_admin_required(view_func):
    """
    Decorator to ensure that the current user is the owner of the venue.
    Works with views that accept either:
    - `venue_id` as a parameter, or
    - `reservation_id` as a parameter (fetches venue via reservation)
    """
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        venue = None

        # Check if venue_id is passed
        venue_id = kwargs.get('venue_id')
        if venue_id:
            venue = get_object_or_404(Venue, id=venue_id)
        
        # Check if reservation_id is passed
        reservation_id = kwargs.get('reservation_id')
        if reservation_id:
            reservation = get_object_or_404(Reservation, id=reservation_id)
            venue = reservation.venue

        if not venue:
            return HttpResponseForbidden("Access denied: venue not found.")

        if venue.owner != request.user:
            return HttpResponseForbidden("Access denied: you are not authorized to manage this venue.")

        return view_func(request, *args, **kwargs)

    return _wrapped_view
