from django.shortcuts                import render, get_object_or_404, redirect
from django.contrib                  import messages
from django.contrib.auth             import get_user_model
from django.contrib.auth.decorators  import login_required
from django.views.decorators.http    import require_POST
from django.db.models                import Count
from django.db.models.functions      import TruncDay, TruncWeek, TruncMonth, TruncYear
from django.utils.timezone           import now
from datetime                        import timedelta, datetime
from django.utils                    import timezone
from django.http                     import HttpResponse, Http404, JsonResponse, HttpResponseForbidden
from django.template.loader          import render_to_string
from django.db                       import transaction, IntegrityError
from django.urls                     import reverse
from .models                         import Venue, VenueUpdateRequest, VenueVisit, Reservation, VenueImage, VenueMenuImage
from emails_manager.models           import VenueEmailVerificationCode
from .forms                          import ReservationForm, VenueApplicationForm, ArrivalStatusForm, ReviewForm
from .utils                          import *
from .decorators                     import venue_admin_required
from venues.services.emails          import send_reservation_notification, send_new_venue_application_email, send_venue_verification_code
from django.http                     import JsonResponse
from django.utils.translation        import gettext as _
import  json
import  plotly.graph_objs            as go
from django.conf                     import settings



User = get_user_model()

###########################################################################################

###########################################################################################
def about(request):
    return render(request, "venues/about.html")

def apply_venue(request):
    verified_email   = (request.session.get("venue_verified_email") or "").strip().lower()
    session_verified = bool(request.session.get("venue_email_verified", False))

    def clear_verification_session():
        request.session.pop("venue_email_verified", None)
        request.session.pop("venue_verified_email", None)
        request.session.pop("venue_pending_email", None)
        
        
    if request.method == "POST":
        action = (request.POST.get("action") or "").strip()
        form   = VenueApplicationForm(request.POST)

        
        if not form.is_valid():
            # Email verified status should be based on posted + normalized email if possible
            posted_admin_email = (request.POST.get("admin_email") or "").strip().lower()
            email_verified = bool(session_verified and verified_email and posted_admin_email and verified_email == posted_admin_email)
            return render(request, "venues/apply_venue.html", {"form": form, "email_verified": email_verified})

        if action != "submit_application":
            messages.error(request, _("Invalid action."))
            # compute verified against validated email
            admin_email_clean   = form.cleaned_data.get("admin_email", "").strip().lower()
            email_verified      = bool(session_verified and verified_email and admin_email_clean and verified_email == admin_email_clean)
            return render(request, "venues/apply_venue.html", {"form": form, "email_verified": email_verified})
            
        admin_email     = form.cleaned_data["admin_email"].strip().lower()
        username        = (form.cleaned_data.get("admin_username") or "").strip()
        owner_phone     = (form.cleaned_data.get("admin_phone") or "").strip()
        first_name      = (form.cleaned_data.get("admin_firstname") or "").strip()
        last_name       = (form.cleaned_data.get("admin_lastname") or "").strip()
        password        = form.cleaned_data.get("password1") or ""
            
        email_verified = bool(session_verified and verified_email and admin_email and verified_email == admin_email)
        if not email_verified:
            form.add_error("admin_email", _("You must verify this email before submitting the application."))
            return render(request, "venues/apply_venue.html", {"form": form, "email_verified": False})
        
        # Optional (recommended): also ensure the session verified email isn't blank
        if not admin_email:
            form.add_error("admin_email", _("Admin email is required."))
            return render(request, "venues/apply_venue.html", {"form": form, "email_verified": False})

        try:
            with transaction.atomic():
                # Prefer DB unique constraints; keep these checks as user-friendly pre-validation
                if User.objects.filter(email__iexact=admin_email).exists():
                    form.add_error("admin_email", _("An account with this email already exists."))
                    return render(request, "venues/apply_venue.html", {"form": form, "email_verified": email_verified})

                if User.objects.filter(username__iexact=username).exists():
                    form.add_error("admin_username", _("This username is already taken."))
                    return render(request, "venues/apply_venue.html", {"form": form, "email_verified": email_verified})

                user = User(
                    username=username,
                    email=admin_email,
                    user_type="venue_admin",
                    phone_number=owner_phone or None,
                    is_active=False,
                    email_verified=True,
                    unverified_email=None,
                    # FIXME: Are there those info while creating a new user?
                    # first_name=first_name,
                    # last_name=last_name,
                )

                user.set_password(password)
                user.save()

                venue_application = form.save(commit=False)
                venue_application.owner_user = user
                venue_application.status = "pending"
                venue_application.save()
                
                transaction.on_commit(lambda: send_new_venue_application_email(venue_application))

        except IntegrityError:
            # Handles race conditions if unique constraints are enforced at DB level
            form.add_error(None, _("Something went wrong while creating your account. Please try again."))
            return render(request, "venues/apply_venue.html", {"form": form, "email_verified": email_verified})
            
        messages.success(request, _("Your venue application has been submitted. We will contact you shortly."))
        clear_verification_session()
        return redirect("venue_list")

    # GET: prefill from session (helps UX and consistent email_verified logic)
    initial = {}
    if verified_email:
        initial["admin_email"] = verified_email

    form = VenueApplicationForm(initial=initial)
    email_verified = bool(session_verified and verified_email)

    return render(request, "venues/apply_venue.html", {"form": form, "email_verified": email_verified})

###########################################################################################

###########################################################################################
def venue_list(request):
    VALID_KINDS         = [k[0] for k in Venue.VENUE_TYPES]
    VALID_AVAILABILITY  = ['available', 'full']
    
    kind = request.GET.get("kind")    
    if kind not in VALID_KINDS:
        kind = None

    availability = request.GET.get("availability")
    if availability not in VALID_AVAILABILITY:
        availability = None

    venues = Venue.objects.all()

    # Kind filtering (support cafes+bars grouping)
    if kind:
        if kind == "cafe":
            venues = venues.filter(kind__in=["cafe", "bar"])
        else:
            venues = venues.filter(kind=kind)

    # Availability filtering
    if availability == "available":
        venues = venues.filter(is_full=False)
    elif availability == "full":
        venues = venues.filter(is_full=True)

    # Ordering (optional but recommended)
    venues = venues.order_by("name")

    # If a kind is selected, show more items (grid mode)
    GRID_LIMIT = 20
    DEFAULT_LIMIT = 200  # you can keep high since default layout is grouped anyway
    if kind:
        venues = venues[:GRID_LIMIT]
    else:
        venues = venues[:DEFAULT_LIMIT]

    # Prepare data for map
    venue_data = [
        {"name": v.name, "lat": v.latitude, "lng": v.longitude, "id": v.id}
        for v in venues
        if v.latitude and v.longitude
    ]

    # Default: no venue_id
    venue_id = None
    if request.user.is_authenticated and request.user.user_type == "venue_admin":
        venue = Venue.objects.filter(owner=request.user).first()
        if venue:
            venue_id = venue.id

    upcoming_reservation = None
    if request.user.is_authenticated:
        upcoming_reservation = (
            Reservation.objects
            .filter(user=request.user)
            .exclude(status="cancelled")
            .select_related("venue")
            .order_by("date", "time")
            .upcoming()
            .first()
        )

    return render(request, "venues/venue_list.html", {
        "venues": venues,
        "venue_data": venue_data,
        "selected_kind": kind,
        "selected_availability": availability,
        "venue_id": venue_id,
        "upcoming_reservation": upcoming_reservation,
    })


###########################################################################################

###########################################################################################
def venue_detail(request, pk):
        
    venue = get_object_or_404(Venue, pk=pk)
    
    log_venue_visit(venue, request)
    
    # --- Description split ---
    DESC_PREVIEW_CHARS = 180
    desc = venue.description or ""

    if len(desc) <= DESC_PREVIEW_CHARS:
        preview_text, remaining_text = desc, ""
    else:
        cut = desc.rfind(" ", 0, DESC_PREVIEW_CHARS)
        if cut == -1:
            cut = DESC_PREVIEW_CHARS
        preview_text = desc[:cut]
        remaining_text = desc[cut:].lstrip()


    # --- Determine selected date (POST or default today) ---
    selected_date = request.POST.get("date") if request.method == "POST" else None
    if not selected_date:
        selected_date = now().date()
    else:
        selected_date = datetime.strptime(selected_date, "%Y-%m-%d").date()

    # --- Fetch available time slots for that date ---
    available_slots = venue.get_available_time_slots(selected_date)
    time_choices = [(t.strftime("%H:%M"), t.strftime("%H:%M")) for t in available_slots]

    # ------------------------------------------------------
    # ALWAYS create both forms so template never breaks
    # ------------------------------------------------------
    form = ReservationForm()
    form.fields["time"].choices = time_choices
    review_form = ReviewForm()

    # --- Reservation logic ---
    if request.method == "POST":
        if not request.user.is_authenticated:
            messages.error(request, "Please log in to make a reservation.")
            return redirect("login")

        if "submit_reservation" in request.POST:
            form = ReservationForm(request.POST)
            form.fields["time"].choices = time_choices  # <-- override choices dynamically

            if form.is_valid():
                reservation = form.save(commit=False)
                reservation.venue = venue
                reservation.status = "pending"
                reservation.user = request.user

                if venue.has_overlapping_reservation(reservation.date, reservation.time, user=request.user):
                    messages.error(request, "You already have a reservation for this time.")
                else:
                    try:
                        with transaction.atomic():
                            reservation.save(editor=request.user)
                    except IntegrityError:
                        messages.error(request, "You already have a reservation for this time.")
                        return redirect("venue_detail", pk=pk)
                            
                    return render(request, "venues/reservation_pending.html", {"venue": venue, "reservation": reservation})

        elif "submit_review" in request.POST:
            review_form = ReviewForm(request.POST)

            if review_form.is_valid():
                review = review_form.save(commit=False)
                review.user = request.user
                review.venue = venue

                try:
                    review.save()
                    messages.success(request, "Your review has been submitted.")
                    return redirect("venue_detail", pk=pk)

                except IntegrityError:
                    messages.error(request, "You have already submitted a review for this venue.")
        else:
            # Unknown POST: show page normally
            form = ReservationForm()
            form.fields["time"].choices = time_choices
    else:
        # --------------------------------------
        # Get prefill from user
        # --------------------------------------
        initial = {}
        if request.user.is_authenticated:
            initial = {
                "firstname":    request.user.first_name or "",
                "lastname":     request.user.last_name or "",
                "email":        request.user.email,
                "phone":        getattr(request.user, "phone_number", ""),
            }
            form = ReservationForm(initial=initial)
            form.fields["time"].choices = time_choices
            review_form = ReviewForm()
    
    return render(
        request,
        "venues/venue_detail.html",
        {
            "venue":            venue,
            "form":             form,
            "review_form":      review_form,
            "preview_text":     preview_text,
            "remaining_text":   remaining_text,
            "time_choices":     time_choices,
            "reviews":          venue.reviews.all().order_by('-created_at'),
        },
    )


###########################################################################################

###########################################################################################
def get_venue_visits_analytics_json(request, venue_id, grouping = 'daily'):
    if not venue_id:
        return JsonResponse({'error': 'Venue ID missing'}, status=400)

    try:
        venue = Venue.objects.get(id=venue_id)
    except Venue.DoesNotExist:
        return JsonResponse({'error': 'Venue not found'}, status=404)

    # Grouping selection
    if grouping == 'weekly':
        trunc_fn = TruncWeek
        days_back = 60
        date_fmt = "%Y-%m-%d"  # week start date
    elif grouping == 'monthly':
        trunc_fn = TruncMonth
        days_back = 180
        date_fmt = "%Y-%m"     # e.g. 2023-07
    elif grouping == 'yearly':
        trunc_fn = TruncYear
        days_back = 365 * 3 # Last 3 years
        date_fmt = "%Y"        # just the year
    else:
        trunc_fn = TruncDay
        days_back = 30
        date_fmt = "%Y-%m-%d"  # full date

    start_date = now().date() - timedelta(days=days_back)

    # Visits query
    visits = (
        VenueVisit.objects
        .filter(venue = venue, timestamp__date__gte = start_date)
        .annotate(period = trunc_fn('timestamp'))
        .values('period')
        .annotate(count = Count('id'))
        .order_by('period')
    )
    visit_labels = [v['period'].strftime(date_fmt) for v in visits]
    visit_values = [v['count'] for v in visits]

    # Reservations query
    reservations = (
        Reservation.objects
        .filter(venue = venue, created_at__date__gte = start_date)
        .annotate(period = trunc_fn('created_at'))
        .values('period')
        .annotate(count = Count('id'))
        .order_by('period')
    )
    reservation_labels = [r['period'].strftime(date_fmt) for r in reservations]
    reservation_values = [r['count'] for r in reservations]

    # Build Plotly figure
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x    =  visit_labels, 
        y    =  visit_values,
        mode =  'lines+markers', name='Visits',
        line =  dict(color='royalblue')
    ))
    
    fig.add_trace(go.Scatter(
        x    = reservation_labels, y=reservation_values,
        mode = 'lines+markers', name='Reservations',
        line = dict(color='orange')
    ))
    
    fig.update_layout(
        title       = f"Visits and Reservations for {venue.name}",
        xaxis_title = 'Date',
        yaxis_title = 'Count',
        template    = 'plotly_dark',
        height      = 550
    )

    # Keep config so frontend can use it in Plotly.newPlot
    config = {
        'displayModeBar':   True,
        'displaylogo':      False,
        'modeBarButtonsToRemove': [
            'pan2d', 
            'lasso2d', 
            'select2d', 
            'autoScale2d',
            'resetScale2d', 
            'toggleSpikelines'
        ],
        'toImageButtonOptions': {
            'format':       'png',
            'filename':     f'{venue.name}_{grouping}_analytics',
            'height':       450,
            'width':        800,
            'scale':        1
        }
    }

    # Stats
    total_visits        = sum(visit_values)
    total_reservations  = sum(reservation_values)
    days_count          = max((now().date() - start_date).days, 1)
    avg_daily_visits    = round(total_visits / days_count, 2)
    peak_visits         = max(visit_values) if visit_values else 0

    data = {
        'grouping':             grouping,
        'total_visits':         total_visits,
        'avg_daily_visits':     avg_daily_visits,
        'peak_visits':          peak_visits,
        'total_reservations':   total_reservations,
        'figure':               fig.to_json(),  # serialized Plotly figure
        'config':               config          # send config separately
    }
    return data

###########################################################################################

###########################################################################################
@login_required
@venue_admin_required
def venue_dashboard(request, venue_id):
    venue   = get_object_or_404(Venue, id=venue_id)
    now     = timezone.now().date()

    reservations = venue.reservations.all()
    
    # OPTIMIZATION: 
    # 1. use select_related() or prefetch_related() 
    # 2. Hit one query and do the filtering in python for small datasets,
    # 3. Consider converting each reservation queryset to .values() or .values_list() if you're rendering to a JS frontend and want lighter payloads.
    # Alternatively, serialize and send as JSON (if using AJAX).

    upcoming_reservations = reservations.filter(
        date__gte   = now,
        status      = 'pending'
    ).order_by('date', 'time')

    past_reservations = reservations.filter(
        date__lt    = now
    ).order_by('-date', '-time')

    arrivals = reservations.filter( # Accepted reservations that are waiting for the guest to arrive
        date__gte   = now,
        status__in  = ['accepted', 'rejected', 'cancelled'], #FIXME: include rejected for now to show history
        # arrival_status='pending'
    ).order_by('date', 'time')

    grouping        = request.GET.get('group', 'daily')
    analytics_data  = get_venue_visits_analytics_json(request, venue_id = venue_id, grouping = grouping)

    context = {
        'venue':                    venue,
        'venue_images':             venue.images.filter(approved=True, marked_for_deletion=False).order_by("order"),
        'menu_images':              venue.menu_images.filter(approved=True, marked_for_deletion=False).order_by("order"),
        'upcoming_reservations':    upcoming_reservations,
        'past_reservations':        past_reservations,
        'arrivals':                 arrivals,
        **analytics_data,
    }

    return render(request, 'venues/venue_dashboard.html', context)

###########################################################################################

###########################################################################################
def venue_visits_analytics_api(request, venue_id):
    venue           = get_object_or_404(Venue, id=venue_id)
    # Get grouping param from query string (default to 'daily')
    grouping        = request.GET.get('group', 'daily')
    # Get analytics data dict
    analytics_data  = get_venue_visits_analytics_json(request, venue_id=venue_id, grouping=grouping)

    # if request.GET.get('format') == 'json' or request.headers.get("X-Requested-With") == "XMLHttpRequest":
    #     return JsonResponse({
    #         "chart_div": analytics_data['chart_div'],
    #         "total_visits": analytics_data['total_visits'],
    #         "avg_daily_visits": analytics_data['avg_daily_visits'],
    #         "peak_visits": analytics_data['peak_visits'],
    #         "grouping": grouping,
    #         "total_reservations": analytics_data['total_reservations'],
    #     })
    
    if request.headers.get("X-Requested-With") == "XMLHttpRequest" or request.GET.get('format') == 'json':
        # html = render_to_string("venues/_analytics_tab_content.html", context, request=request)
        # return HttpResponse(html)
        return JsonResponse(analytics_data)

    # If not AJAX, render the full analytics page (or redirect to dashboard)
    context = {
        "venue": venue,
        **analytics_data
    }
        
    return render(request, "venues/_analytics_tab_content.html", context)

###########################################################################################

###########################################################################################
@login_required
@venue_admin_required
@require_POST
def toggle_venue_full(request, venue_id):
    # transaction.atomic() + select_for_update() locks 
    # that venue row for the duration of the transaction.
    # So Request B will wait until Request A commits, then 
    # it will read the new value and toggle from there.
    with transaction.atomic():
        venue = (
            Venue.objects
            .select_for_update()
            .filter(id=venue_id, owner=request.user)
            .first()
        )
        if not venue:
            # 404 behavior without leaking existence
            raise Http404

        venue.is_full = not venue.is_full
        venue.save(update_fields=["is_full"])

    return redirect("venue_dashboard", venue_id=venue.id)

###########################################################################################

###########################################################################################
@login_required
@venue_admin_required
@require_POST
def update_reservation_status(request, reservation_id, status):
    reservation = get_object_or_404(Reservation, id = reservation_id)
    
    if reservation.venue.owner != request.user:
        # Ownership of venue check
        # Insecure Direct Object Reference (IDOR) protection
        return JsonResponse({'error': 'permission denied'}, status=403)
    if status not in ['accepted', 'rejected']:
        # Only 2 legal state changes via this endpoint
        return JsonResponse({'error': 'invalid status'}, status=400)

    # Backend:  last one wins. There is no protection like “only allow Accept if status is still pending”.
    # Frontend: you disable the button ($btn.prop('disabled', true)), so single user double-click is mostly handled.
    # But two different admins could still fight over a reservation and override each other.
    if reservation.status != 'pending':
        return JsonResponse({'error': 'only pending reservations can be accepted or rejected'}, status=400)

    # Actual update
    with transaction.atomic():
        if reservation.status != status:
            reservation.status = status
            reservation.save(editor = request.user, update_fields = ['status'])

    # Build json payload for frontend
    reservation_data = {
        "id":               reservation.id,
        "customer_name":    reservation.full_name,
        "date":             reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time":             reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests":           getattr(reservation, 'guests', None),
        "status":           reservation.status,
        "arrival_status":   reservation.arrival_status,
        "urls": {
            "move":         reverse('move_reservation_to_requests_ajax', args=[reservation.id]),
            "checkin":      reverse('update_arrival_status', args=[reservation.id, 'checked_in']),
            "no_show":      reverse('update_arrival_status', args=[reservation.id, 'no_show']),
            "accept":       reverse('update_reservation_status', args=[reservation.id, 'accepted']),
            "reject":       reverse('update_reservation_status', args=[reservation.id, 'rejected']),
        },
        "updated_at":       timezone.now().isoformat(),
    }

    # Optionally broadcast this same reservation_data using Channels:
    # notify_venue_admin(venue=reservation.venue, event='reservation.status_updated', reservation=reservation_data)

    return JsonResponse({"reservation": reservation_data}, status=200)

###########################################################################################

###########################################################################################
@login_required
@venue_admin_required
@require_POST
def update_arrival_status(request, reservation_id, arrival_status):
    reservation = get_object_or_404(Reservation, id=reservation_id)

    if reservation.venue.owner != request.user:
        return JsonResponse({'error': 'Permission denied'}, status=403)

    if arrival_status not in ('checked_in', 'no_show'):
        return JsonResponse({'error': 'Invalid arrival status'}, status=400)

    if reservation.status != 'accepted':
        return JsonResponse(
            {'error': 'Arrival status can only be updated for accepted reservations'},
            status=400
        )
    
    with transaction.atomic():
        reservation.arrival_status = arrival_status
        reservation.save(editor=request.user, update_fields=['arrival_status'])

    reservation_data = {
        "id":               reservation.id,
        "customer_name":    reservation.full_name,
        "date":             reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time":             reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests":           getattr(reservation, 'guests', None),
        "status":           reservation.status,
        "arrival_status":   reservation.arrival_status,
        "urls": {
            "move":     reverse('move_reservation_to_requests_ajax',    args=[reservation.id]),
            "checkin":  reverse('update_arrival_status',                args=[reservation.id, 'checked_in']),
            "no_show":  reverse('update_arrival_status',                args=[reservation.id, 'no_show']),
            "accept":   reverse('update_reservation_status',            args=[reservation.id, 'accepted']),
            "reject":   reverse('update_reservation_status',            args=[reservation.id, 'rejected']),
        },
        "updated_at": timezone.now().isoformat(),
    }

    # Optionally broadcast reservation_data via channels
    # notify_venue_admin(venue=reservation.venue, event='reservation.arrival_updated', reservation=reservation_data)

    return JsonResponse(
        {
            "updated": True,
            "reservation": reservation_data,
        }
    )

###########################################################################################

###########################################################################################
@login_required
@venue_admin_required
@require_POST
def move_reservation_to_requests_ajax(request, reservation_id):
    """
        AJAX endpoint: move a reservation back to 'pending' (requests).
        Returns JSON with 'reservation' dict (no HTML).
    """
    reservation = get_object_or_404(Reservation, id=reservation_id)

    if reservation.venue.owner != request.user:
        return JsonResponse({'error': 'Permission denied'}, status=403)

    moved = False
    with transaction.atomic():
        if reservation.status != 'pending' or reservation.arrival_status != 'pending':
            reservation.status = 'pending'
            reservation.arrival_status = 'pending'
            reservation.save(editor=request.user, update_fields=['status', 'arrival_status'])
            moved = True

    # Build a compact reservation dict for the frontend
    reservation_data = {
        "id":               reservation.id,
        "customer_name":    reservation.full_name,
        "date":             reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time":             reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests":           getattr(reservation, 'guests', None),
        "status":           reservation.status,
        "arrival_status":   reservation.arrival_status,
        # Optional: include action URLs (recommended)
        "urls": {
            "accept":       reverse('update_reservation_status',            args = [reservation.id, 'accepted']),
            "reject":       reverse('update_reservation_status',            args = [reservation.id, 'rejected']),
            "move":         reverse('move_reservation_to_requests_ajax',    args = [reservation.id]),
            "checkin":      reverse('update_arrival_status',                args = [reservation.id, 'checked_in']),
            "no_show":      reverse('update_arrival_status',                args = [reservation.id, 'no_show']),
        },
        "updated_at": timezone.now().isoformat(),
    }

    # Optional: broadcast over channels here (use the same shape)
    # notify_venue_admin(venue=reservation.venue, event='reservation.moved_to_requests', reservation=reservation_data)

    return JsonResponse({
        'moved':        moved,
        'reservation':  reservation_data
    })

###########################################################################################

###########################################################################################
@login_required
def my_reservations(request):
    now_dt = timezone.now()

    all_reservations = Reservation.objects.filter(user=request.user)

    upcoming_reservations = [
        r for r in all_reservations if r.is_upcoming() and r.status != "cancelled"
    ]
    past_reservations = [
        r for r in all_reservations if not r.is_upcoming() and r.status != "cancelled"
    ]
    cancelled_reservations = all_reservations.filter(status="cancelled")

    context = {
        "upcoming_reservations": upcoming_reservations,
        "past_reservations": past_reservations,
        "cancelled_reservations": cancelled_reservations,
    }
    return render(request, "venues/my_reservations.html", context)

###########################################################################################

###########################################################################################
@login_required
def cancel_reservation(request, reservation_id):
    reservation = get_object_or_404(Reservation, id=reservation_id, user=request.user)
    if request.method == 'POST':
        reservation.status = 'cancelled'
        reservation.save(editor=request.user)
        messages.success(request, 'Reservation cancelled.')
        return redirect('my_reservations')
    return render(request, 'venues/confirm_cancel.html', {'reservation': reservation})

###########################################################################################

###########################################################################################
def make_reservation(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)

    # Log visit (optional: do you want to log visit here as well? If yes, uncomment)
    # if not request.session.session_key:
    #     request.session.save()
    # VenueVisit.objects.create(
    #     venue=venue,
    #     user=request.user if request.user.is_authenticated else None,
    #     session_key=request.session.session_key,
    #     ip_address=get_client_ip(request),
    #     timestamp=now()
    # )

    if request.method == 'POST':
        form = ReservationForm(request.POST)
        if form.is_valid():
            reservation = form.save(commit=False)
            reservation.venue = venue
            if request.user.is_authenticated:
                reservation.user = request.user

# time is a TimeField,
# reservations last exactly 1 hour,
# only compares by .time() not datetime.
# This works but can break if:
# a reservation spans midnight,
# different durations allowed,
# timezone mismatch.

            if venue.has_overlapping_reservation(reservation.date, reservation.time):
                messages.error(request, 'Sorry, that time slot is already reserved.')
                return render(request, 'venues/make_reservation.html', {'form': form, 'venue': venue})

            reservation.save(editor=request.user)
            
            send_reservation_notification(reservation)
            messages.success(request, 'Reservation submitted. Await confirmation.')

            return redirect('my_reservations')
    else:
        form = ReservationForm()

    return render(request, 'venues/make_reservation.html', {'form': form, 'venue': venue})

###########################################################################################

###########################################################################################
@login_required
# @venue_admin_required
def edit_reservation_status(request, reservation_id):
    reservation = get_object_or_404(Reservation, id=reservation_id)

    # ✅ Block edit if it's still waiting admin decision
    if reservation.status == 'pending':
        messages.warning(request, "You must accept or reject the reservation before editing its status.")
        return redirect('venue_dashboard', venue_id=reservation.venue.id)

    if request.method == 'POST':
        form = ArrivalStatusForm(request.POST, instance=reservation)
        if form.is_valid():
            updated_reservation = form.save(commit=False)

            # ✅ Additional logic to move back to requests
            if form.cleaned_data.get('move_to_requests'):
                updated_reservation.status = 'pending'
                updated_reservation.arrival_status = 'pending'

            updated_reservation.save(editor=request.user)
            messages.success(request, "Reservation status updated successfully.")
            return redirect('venue_dashboard', venue_id=reservation.venue.id)
    else:
        form = ArrivalStatusForm(instance=reservation)

    context = {
        'form':         form,
        'reservation':  reservation
    }
    return render(request, 'venues/edit_reservation_status.html', context)

###########################################################################################

###########################################################################################
@login_required
def edit_reservation(request, pk):
    reservation = get_object_or_404(Reservation, pk=pk, user=request.user)

    if reservation.status == "cancelled":
        return redirect('my_reservations')  # Can't edit cancelled reservations

    if request.method == "POST":
        form = ReservationForm(request.POST, instance=reservation)
        if form.is_valid():
            updated_reservation = form.save(commit=False)
            updated_reservation.status = 'pending'
            updated_reservation.arrival_status = 'pending'
            updated_reservation.save(editor=request.user)
            messages.success(request, "Reservation updated successfully and is now pending approval.")
            return redirect('my_reservations')
    else:
        form = ReservationForm(instance=reservation)

    return render(request, "venues/edit_reservation.html", {"form": form, "reservation": reservation})

# @login_required
# def update_arrival_status(request, reservation_id, arrival_status):
#     reservation = get_object_or_404(Reservation, id=reservation_id)

#     # Check if current user owns the venue
#     if reservation.venue.owner != request.user:
#         messages.error(request, "You do not have permission to update this arrival status.")
#         return redirect('venue_dashboard', venue_id=reservation.venue.id)

#     # Check if reservation is accepted and arrival_status is still pending
#     if reservation.status != 'accepted':
#         messages.warning(request, "Only accepted reservations can have their arrival status updated.")
#         return redirect('venue_dashboard', venue_id=reservation.venue.id)

#     if reservation.arrival_status != 'pending':
#         messages.warning(request, f"This reservation's arrival status is already set to '{reservation.arrival_status.replace('_', ' ')}'.")
#         return redirect('venue_dashboard', venue_id=reservation.venue.id)

#     # Optional: prevent updating arrival status of past reservations
#     if not reservation.is_upcoming():
#         messages.warning(request, "You cannot update the arrival status of past reservations.")
#         return redirect('venue_dashboard', venue_id=reservation.venue.id)

#     # Check that the arrival_status passed is valid
#     if arrival_status not in ['checked_in', 'no_show']:
#         messages.error(request, "Invalid arrival status.")
#         return redirect('venue_dashboard', venue_id=reservation.venue.id)

#     if request.method == 'POST':
#         form = ArrivalStatusForm(request.POST, instance=reservation)
#         if form.is_valid():
#             reservation.arrival_status = arrival_status
#             reservation.save()
#             messages.success(request, f"Arrival status updated to '{arrival_status.replace('_', ' ').title()}'.")
#             return redirect('venue_dashboard', venue_id=reservation.venue.id)
#     else:
#         form = ArrivalStatusForm(instance=reservation)

#     context = {
#         'form': form,
#         'reservation': reservation,
#         'selected_status': arrival_status,
#     }
#     return render(request, 'venues/update_arrival_status.html', context)

###########################################################################################

###########################################################################################
@login_required
def partial_reservation_row(request, pk: int):
    """
        Return one reservation row (for upcoming requests table).
    """
    
    try:
        r = Reservation.objects.select_related('user', 'venue').get(pk=pk)
    except Reservation.DoesNotExist:
        raise Http404
    html = render_to_string(
        'venues/partials/_reservation_row.html',
        {'r': r},
        request=request
    )
    return HttpResponse(html)

###########################################################################################

###########################################################################################
@login_required
@venue_admin_required
def partial_arrival_row(request, pk: int):
    """
        Return one arrival row (special table), but still Reservation object.
    """
    
    try:
        r = Reservation.objects.select_related('user', 'venue').get(pk=pk)
    except Reservation.DoesNotExist:
        raise Http404
    html = render_to_string(
        'venues/partials/_arrival_row.html',
        {
            'r':        r,
            'today':    timezone.now().date() 
        },
        request=request
    )
    
    return HttpResponse(html)

###########################################################################################

###########################################################################################
@login_required
@transaction.atomic
@require_POST       # practically if someone trys to access via GET (using the link directly), just block it
def submit_venue_update(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)

    if not user_can_manage_venue(request.user, venue):
        return HttpResponseForbidden("You do not have permission to manage this venue.")

    # Collect changes once
    venue_fields = {
        "name": request.POST.get("name"),
        "kind": request.POST.get("kind"),
        "location": request.POST.get("location"),
        "email": request.POST.get("email"),
        "phone": request.POST.get("phone"),
        "description": request.POST.get("description"),
    }

    def handle_image_group(model, files_field, visible_field, *, auto_approve:bool):
        visible_ids = request.POST.get(visible_field, None)
        files       = request.FILES.getlist(files_field)
        file_map    = {f"new-{i}": f for i, f in enumerate(files)}

        # If front-end didn't submit sequence, you can still accept uploads but avoid touching existing
        if visible_ids is None:
            for f in files:
                model.objects.create(venue=venue, image=f, approved=auto_approve, marked_for_deletion=False)
            return

        sequence = [x for x in visible_ids.split(",") if x]
        updated_ids = []
        updated = []
        
        for order_index, token in enumerate(sequence):
            if token.startswith("new-"):
                f = file_map.get(token)
                if f:
                    obj = model.objects.create(
                        venue=venue, image=f, approved=auto_approve, marked_for_deletion=False, order=order_index
                    )
                    
                    updated.append(obj)
                    updated_ids.append(obj.id)
            else:
                try:
                    img = model.objects.get(pk=int(token), venue=venue)
                except (ValueError, model.DoesNotExist):
                    continue
                img.order = order_index
                img.marked_for_deletion = False
                if auto_approve:
                    img.approved = True
                img.save(update_fields=["order", "marked_for_deletion"] + (["approved"] if auto_approve else []))
                updated.append(img)
                updated_ids.append(img.id)

        model.objects.filter(venue=venue, approved=True) \
            .exclude(id__in=updated_ids) \
            .update(marked_for_deletion=True)
    
    require_approval = getattr(settings, "VENUE_UPDATES_REQUIRE_APPROVAL", True)

    if require_approval:
        # OLD BEHAVIOR: create update request only
        VenueUpdateRequest.objects.create(
            venue=venue,
            submitted_by=request.user,
            **venue_fields,
        )

        # Images uploaded/ordered as unapproved (stays pending)
        handle_image_group(VenueImage, "venue_images", "visible_venue_image_ids[]", auto_approve=False)
        handle_image_group(VenueMenuImage, "menu_images", "visible_menu_image_ids[]", auto_approve=False)

        return render(request, "venues/_update_venue_success.html")

    for field, value in venue_fields.items():
        setattr(venue, field, value)
    venue.save(update_fields=list(venue_fields.keys()))

    handle_image_group(VenueImage, "venue_images", "visible_venue_image_ids[]", auto_approve=True)
    handle_image_group(VenueMenuImage, "menu_images", "visible_menu_image_ids[]", auto_approve=True)

    return redirect('venue_dashboard', venue_id=venue.id)

###########################################################################################

###########################################################################################
def _reorder_images(request, venue_id, model_cls):
    if request.resolver_match is not None:
        raise RuntimeError("_reorder_images must not be used as a view")
    if request.method != "POST": # Wrappers already enforce POST, but keeping this doesn't hurt if you ever reuse it elsewhere.
        return JsonResponse({"status": "invalid request"}, status=405)
    if request.content_type is None or not request.content_type.startswith("application/json"):
        return JsonResponse({"status":"invalid request"}, status=400)
    
    try:
        data = json.loads(request.body or b"{}") # Parse JSON
    except json.JSONDecodeError:
        return JsonResponse({"status": "invalid JSON"}, status=400)

    sequence = data.get("sequence", None)
    if not isinstance(sequence, list):
        return JsonResponse({"status": "invalid payload", "message": "`sequence` must be a list"}, status=400)

    if len(sequence) > 500:
        return JsonResponse({"status": "invalid payload", "message": "Too many ids in sequence"}, status=400)
    
    # Normalize IDs (and dedupe while preserving order)
    normalized = []
    seen = set()
    for x in sequence:
        try:
            i = int(x)
        except (TypeError, ValueError):
            continue
        if i not in seen:
            seen.add(i)
            normalized.append(i)

    # 🚦 Throttle Check
    throttle_key = f"reorder:{request.user.pk}:{model_cls.__name__}:{venue_id}"
    if is_throttled(request.user, throttle_key, limit=10, period=60):
        return JsonResponse({
            "status": "throttled",
            "message": "Too many reorder attempts. Please try again in a minute."
        }, status=429)

    # Ensure the venue exists and belongs to user (assuming Venue has owner)
    Venue = model_cls._meta.get_field("venue").remote_field.model
    venue = get_object_or_404(Venue, id=venue_id)
    if not user_can_manage_venue(request.user, venue):
        return JsonResponse({"status": "permission denied"}, status=403)
    
    # Fetch all eligible images for these IDs in one query
    with transaction.atomic():
        qs          = model_cls.objects.select_for_update().filter(id__in=normalized, venue_id=venue_id, approved=True, marked_for_deletion=False)
        imgs_by_id  = {img.id: img for img in qs} # Map by id for O(1) lookup

        updated_ids = []
        to_update   = []

        for index, img_id in enumerate(normalized):
            img = imgs_by_id.get(img_id)
            if not img:
                continue
            img.order = index
            to_update.append(img)
            updated_ids.append(img_id)

        if to_update:
            model_cls.objects.bulk_update(to_update, ["order"])

    logger.info("[ImageOrder] user=%s model=%s venue=%s updated=%s", request.user.pk, model_cls.__name__, venue_id, updated_ids)

    return JsonResponse({"status": "success", "updated_order": updated_ids})

@require_POST
@login_required
@venue_admin_required
def update_image_order(request, venue_id):
    return _reorder_images(request, venue_id, VenueImage)


@require_POST
@login_required
@venue_admin_required
def update_menu_image_order(request, venue_id):
    return _reorder_images(request, venue_id, VenueMenuImage)

###########################################################################################

###########################################################################################
from django.http                    import JsonResponse
from django.views.decorators.http   import require_POST
from django.views.decorators.csrf   import csrf_protect
from django.core.validators         import validate_email
from django.core.exceptions         import ValidationError
from django.utils                   import timezone
from emails_manager.models          import VenueEmailVerificationCode
from venues.services.emails         import send_venue_verification_code

SEND_COOLDOWN_SECONDS = 45

@require_POST
@csrf_protect
def ajax_send_venue_code(request):
    raw     = request.POST.get("email") or ""
    email   = raw.strip().lower() # consider using casefold()
    
    if not email:
        return JsonResponse({
                                "ok":       False, 
                                "error":    "Email is required."
                            }, status=400)

    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({
                                "ok":       False, 
                                "error":    "Enter a valid email address."
                            }, status=400)

    # Session cooldown
    last_sent_ts = request.session.get("venue_code_last_sent_at")
    now          = timezone.now().timestamp()
    if last_sent_ts and (now - float(last_sent_ts) < SEND_COOLDOWN_SECONDS):
        return JsonResponse({
                                "ok":       False, 
                                "error":    f"Please wait before requesting another code."
                            }, status=429)

    # reset session state
    request.session["venue_email_verified"] = False
    request.session["venue_pending_email"]  = email
    request.session.pop("venue_verified_email", None)

    code_obj = VenueEmailVerificationCode.create_for_email(email)

    try:
        # If you ever wrap DB writes in transactions, do:
        # transaction.on_commit(lambda: send_venue_verification_code(email, code_obj.code))
        send_venue_verification_code(email, code_obj.code)
    except Exception:
        # Best-effort cleanup so users aren't stuck with an unseen code
        VenueEmailVerificationCode.objects.filter(id=code_obj.id).delete()
        return JsonResponse({"ok": False, "error": "Could not send email right now. Try again."}, status=503)
    
    request.session["venue_code_last_sent_at"] = str(now)
    return JsonResponse({
                            "ok":       True, 
                            "message":  "Code sent."
                        })

###########################################################################################

###########################################################################################
MAX_ATTEMPTS = 5
LOCK_MINUTES = 10

@require_POST
@csrf_protect
def ajax_verify_venue_code(request):
    email = request.session.get("venue_pending_email")
    if not email:
        return JsonResponse({
                                "ok":       False, 
                                "error":    "No email in session. Send code first."
                            }, status=400)

  # Lockout (session-based baseline)
    locked_until = request.session.get("venue_code_locked_until")
    if locked_until and timezone.now().timestamp() < float(locked_until):
        return JsonResponse({
                                "ok":       False, 
                                "error":    "Too many attempts. Try again later."
                            }, status=429)

    code = (request.POST.get("code") or "").strip()
    if len(code) != 6 or not code.isdigit():
        return JsonResponse({
                                "ok":       False, 
                                "error":    "Enter a valid 6-digit code."
                            }, status=400)

    try:
        code_obj = VenueEmailVerificationCode.objects.get(email=email, code=code)
    except VenueEmailVerificationCode.DoesNotExist:
        attempts = int(request.session.get("venue_code_attempts", 0)) + 1
        request.session["venue_code_attempts"] = attempts

        if attempts >= MAX_ATTEMPTS:
            lock_until = timezone.now() + timezone.timedelta(minutes=LOCK_MINUTES)
            request.session["venue_code_locked_until"] = str(lock_until.timestamp())
            return JsonResponse({
                                    "ok":       False, 
                                    "error":    "Too many attempts. Try again later."
                                }, status=429)

        return JsonResponse({   "ok":       False, 
                                "error":    "Invalid code."
                            }, status=400)

    if code_obj.is_expired():
        code_obj.delete()
        return JsonResponse({   "ok":       False, 
                                "error":    "Code expired. Please resend."
                            }, status=400)

    # success
    code_obj.delete()
    request.session["venue_email_verified"] = True
    request.session["venue_verified_email"] = email
    request.session.pop("venue_pending_email", None)
    request.session.pop("venue_code_attempts", None)
    request.session.pop("venue_code_locked_until", None)

    return JsonResponse({   "ok":       True, 
                            "message":  "Email verified."
                        })
###########################################################################################

###########################################################################################