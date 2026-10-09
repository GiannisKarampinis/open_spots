from venues.models import WorkingDay

def ensure_working_days(venue, *, default_closed=True):
    """
    Ensures a venue has exactly one WorkingDay per weekday (0..6).
    Creates missing rows only.
    No signals.
    """
    existing = set(venue.working_days.values_list("weekday", flat=True))
    to_create = [
        WorkingDay(
            venue=venue,
            weekday=w,
            is_closed=default_closed,
            open_time=None,
            close_time=None,
            closes_next_day=False,
        )
        for w, _ in WorkingDay.Weekday.choices
        if w not in existing
    ]
    if to_create:
        WorkingDay.objects.bulk_create(to_create)