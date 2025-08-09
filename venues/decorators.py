from django.http        import HttpResponseForbidden
from django.shortcuts   import get_object_or_404
from functools          import wraps
from .models            import Venue

def venue_admin_required(view_func):
    @wraps(view_func)
    def _wrapped_view(request, venue_id, *args, **kwargs):
        venue = get_object_or_404(Venue, id=venue_id)
        if venue.owner != request.user:
            return HttpResponseForbidden("Access denied: you are not authorized to manage this venue.")
        return view_func(request, venue_id, *args, **kwargs)
    return _wrapped_view