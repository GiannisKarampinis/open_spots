from datetime                   import timedelta
from django.core.paginator      import EmptyPage, Paginator
from django.db.models           import Count, Q
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek, TruncYear
from django.utils               import timezone
from venues.models              import Reservation, VenueVisit
from venues.utils               import get_today
from .serializers               import VenueImageSerializer


DASHBOARD_PAGE_SIZE     = 10
DASHBOARD_MAX_PAGE_SIZE = 100
DASHBOARD_GROUPINGS     = {"daily", "weekly", "monthly", "yearly"}



def _dashboard_venue_payload(venue, request):
    context = {"request": request}
    first_image = (
        venue.images.filter(approved=True, marked_for_deletion=False).order_by("order").first()
    )
    return {
        "id": venue.id,
        "name": venue.name,
        "kind": venue.kind,
        "location": venue.location,
        "description": venue.description,
        "average_rating": venue.average_rating,
        "is_full": venue.is_full,
        "latitude": venue.latitude,
        "longitude": venue.longitude,
        "email": venue.email,
        "phone": venue.phone,
        "owner_id": venue.owner_id,
        "first_image": VenueImageSerializer(first_image, context=context).data["url"] if first_image else None,
        "images": VenueImageSerializer(
            venue.images.filter(approved=True, marked_for_deletion=False).order_by("order"),
            many=True,
            context=context,
        ).data,
        "menu_images": VenueImageSerializer(
            venue.menu_images.filter(approved=True, marked_for_deletion=False).order_by("order"),
            many=True,
            context=context,
        ).data,
    }


def _working_day_payload(day):
    return {
        "id": day.id,
        "weekday": day.weekday,
        "weekday_display": day.get_weekday_display(),
        "is_closed": day.is_closed,
        "open_time": day.open_time.strftime("%H:%M") if day.open_time else "",
        "close_time": day.close_time.strftime("%H:%M") if day.close_time else "",
        "closes_next_day": day.closes_next_day,
    }


def _analytics_payload(venue, grouping):
    if grouping == "weekly":
        trunc_fn = TruncWeek
        days_back = 84
        date_fmt = "%Y-%m-%d"
    elif grouping == "monthly":
        trunc_fn = TruncMonth
        days_back = 365
        date_fmt = "%Y-%m"
    elif grouping == "yearly":
        trunc_fn = TruncYear
        days_back = 365 * 3
        date_fmt = "%Y"
    else:
        trunc_fn = TruncDay
        days_back = 30
        date_fmt = "%Y-%m-%d"

    start_date = get_today() - timedelta(days=days_back)

    visits = (
        VenueVisit.objects
        .filter(venue=venue, timestamp__date__gte=start_date)
        .annotate(period=trunc_fn("timestamp"))
        .values("period")
        .annotate(count=Count("id"))
        .order_by("period")
    )
    reservations = (
        Reservation.objects
        .filter(venue=venue, created_at__date__gte=start_date)
        .annotate(period=trunc_fn("created_at"))
        .values("period")
        .annotate(count=Count("id"))
        .order_by("period")
    )

    rows_by_period = {}
    visit_values = []
    reservation_values = []

    for item in visits:
        period = item["period"].strftime(date_fmt)
        rows_by_period.setdefault(period, {"period": period, "visits": 0, "reservations": 0})
        rows_by_period[period]["visits"] = item["count"]
        visit_values.append(item["count"])

    for item in reservations:
        period = item["period"].strftime(date_fmt)
        rows_by_period.setdefault(period, {"period": period, "visits": 0, "reservations": 0})
        rows_by_period[period]["reservations"] = item["count"]
        reservation_values.append(item["count"])

    rows = [rows_by_period[key] for key in sorted(rows_by_period)]
    total_visits = sum(visit_values)
    total_reservations = sum(reservation_values)
    days_count = max((get_today() - start_date).days, 1)

    return {
        "grouping": grouping,
        "total_visits": total_visits,
        "avg_daily_visits": round(total_visits / days_count, 2),
        "peak_visits": max(visit_values) if visit_values else 0,
        "total_reservations": total_reservations,
        "series": rows,
    }


# OK - REVIEWED
def _parse_positive_int(value, default, *, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    
    parsed = max(parsed, 1)
    
    if maximum is not None:
        parsed = min(parsed, maximum)
    
    return parsed


# OK - REVIEWED
def _reservation_payload(reservation, *, include_details=True):
    payload = {
        "id":               reservation.id,
        "customer_name":    reservation.full_name,
        "date":             reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time":             reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests":           getattr(reservation, "guests", None),
        "seen":             bool(reservation.seen),
        "status":           reservation.status,
        "arrival_status":   reservation.arrival_status,
        "special_requests": bool(reservation.special_requests),
        "updated_at":       timezone.now().isoformat(),
    }

    if not include_details:
        return payload

    payload.update(
        {
            "firstname":        reservation.firstname,
            "lastname":         reservation.lastname,
            "email":            reservation.email,
            "phone":            reservation.phone,
            "seating_preference": reservation.seating_preference,
            "has_allergies":    reservation.has_allergies,
            "allergies":        reservation.allergies,
            "vegan":            reservation.vegan,
            "vegetarian":       reservation.vegetarian,
            "gluten_free":      reservation.gluten_free,
            "wheelchair":       reservation.wheelchair,
            "smoking":          reservation.smoking,
            "comments":         reservation.comments,
        }
    )

    return payload


# OK - REVIEWED
def _dashboard_reservations_queryset(venue, bucket):
    # THIS FUNCTION DOES NOT HIT THE DATABASE

    today        = get_today()
    reservations = venue.reservations.all() # In Django QuerySets are lazy evaluated, so this doesn't hit the database yet.

    if bucket == "requests":
        return reservations.filter(date__gte=today, status="pending").order_by("date", "time", "id")
    
    if bucket == "arrivals":
        return reservations.filter(date__gte=today, status__in=["accepted", "rejected", "cancelled"]).order_by("date", "time", "id")
    
    if bucket == "history":
        return reservations.filter(date__lt=today).order_by("-date", "-time", "-id")
    
    return Reservation.objects.none()


# OK - REVIEWED
def _filter_dashboard_reservations(queryset, request):
    # THIS FUNCTION DOES NOT HIT THE DATABASE

    # This part reads query parameters from the built URL from axios built
    # /api/v1/venues/42/dashboard-reservations/?bucket=requests&start=2026-06-01&end=2026-06-20&search=maria&sort=date&direction=desc
    start     = request.GET.get("start")
    end       = request.GET.get("end")
    search    = (request.GET.get("search") or "").strip()
    sort      = request.GET.get("sort")
    direction = request.GET.get("direction")

    if start:
        queryset = queryset.filter(date__gte=start) # keep only reservations whose date is greater than or equal to start
    
    if end:
        queryset = queryset.filter(date__lte=end) # keep only reservations whose date is less than or equal to end
    
    if search:
        queryset = queryset.filter(Q(firstname__icontains=search) | Q(lastname__icontains=search)
                                 | Q(email__icontains=search)     | Q(phone__icontains=search)
                                 | Q(status__icontains=search)    | Q(arrival_status__icontains=search)
        )

    sort_fields = {
        # Mapping from frontend table column names to the actual model fields to sort by.

        # key: frontend table | value: list of fields to sort by in order of priority 
        # column names        |
        
        "customer_name":    ["firstname", "lastname", "id"],
        "date":             ["date", "time", "id"],
        "time":             ["time", "date", "id"],
        "guests":           ["guests", "date", "time", "id"],
        "seen":             ["seen", "date", "time", "id"],
        "status":           ["status", "arrival_status", "date", "time", "id"],
    }

    if sort in sort_fields:
        prefix = "-" if direction == "desc" else ""
        queryset = queryset.order_by(*[f"{prefix}{field}" for field in sort_fields[sort]])

    return queryset


# OK - REVIEWED
def _paginated_reservation_payload(queryset, request):
    page_size   = _parse_positive_int(request.GET.get("page_size"), DASHBOARD_PAGE_SIZE, maximum=DASHBOARD_MAX_PAGE_SIZE)
    page_number = _parse_positive_int(request.GET.get("page"), 1)
    paginator   = Paginator(queryset, page_size) 
            # queryset has 47 reservations and page_size = 10
            # total pages = 5 (10, 10, 10, 10, 7)
    try:
        page = paginator.page(page_number)
    except EmptyPage:
        page = paginator.page(paginator.num_pages or 1)

    return {
        "count":        paginator.count,     # Total number of reservations in the queryset (e.g., 47)
        "page":         page.number,         # Current page number (e.g., 1, 2, 3, 4, 5)
        "page_size":    page_size,           # Number of reservations per page (e.g., 10)
        "total_pages":  paginator.num_pages, # Total number of pages e.g. 5.
        "results":      [_reservation_payload(item, include_details=False) for item in page.object_list], # This serializes the reservations on the current page.
        # page.object_list is a list of Reservation objects for the current page, and we serialize each one using _reservation_payload.
        # The code converts those model objects into JSON-ready dictionaries.
    }

    # Example of the paginated reservation payload returned by _paginated_reservation_payload:
    # {
    #   "count": 47,
    #   "page": 2,
    #   "page_size": 10,
    #   "total_pages": 5,
    #   "results": [
    #     {
    #       "id": 123,
    #       "customer_name": "Maria Smith",
    #       "date": "2026-06-20",
    #       "time": "19:30",
    #       "guests": 4,
    #       "seen": false,
    #       "status": "pending",
    #       "arrival_status": "pending",
    #       "updated_at": "2026-06-20T12:15:00+03:00"
    #     }
    #   ]
    # }
