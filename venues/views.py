from django.shortcuts                import render, get_object_or_404, redirect
from django.contrib                  import messages
from django.contrib.auth             import get_user_model
from django.contrib.auth.models      import User 
from django.contrib.auth.decorators  import login_required
from django.contrib                  import messages
from django.views.decorators.http    import require_POST
from django.db.models                import Count
from django.db.models.functions      import TruncDay, TruncWeek, TruncMonth
from django.utils.timezone           import now, localtime
from datetime                        import datetime, timedelta
from django.utils                    import timezone
from django.core.mail                import send_mail
from django.conf                     import settings
from django.contrib.auth.models      import User  # For admin email in venue signup
from django.core.serializers.json    import DjangoJSONEncoder
from django.utils.safestring         import mark_safe
from django.contrib.auth             import get_user_model
from django.core.exceptions          import PermissionDenied
from django.http                     import HttpResponse, Http404, JsonResponse
from django.template.loader          import render_to_string
from plotly.offline                  import plot
import plotly.graph_objs             as go
from django.db                       import transaction
from django.urls                     import reverse
from .models                         import Venue, VenueVisit, Reservation
from .forms                          import ReservationForm, VenueApplicationForm, ArrivalStatusForm
from .utils                          import *
from .decorators                     import venue_admin_required
from .notifications                  import notify_venue_admin
import json



User = get_user_model()

###########################################################################################

###########################################################################################
def venue_list(request):
    kind = request.GET.get("kind")  # e.g. ?kind=restaurant
    availability = request.GET.get("availability")  # e.g. ?availability=available

    venues = Venue.objects.all()

    if kind:
        venues = venues.filter(kind=kind)

    if availability == "available":
        venues = venues.filter(is_full=False)
    elif availability == "full":
        venues = venues.filter(is_full=True)

    # Keep only venues with coordinates for map
    venue_data = [
        {
            "name": v.name,
            "lat": v.latitude,
            "lng": v.longitude,
            "id": v.id,
        }
        for v in venues if v.latitude and v.longitude
    ]

    return render(request, "venues/venue_list.html", {
        "venues": venues,
        "venue_data_json": mark_safe(json.dumps(venue_data, cls=DjangoJSONEncoder)),
        "selected_kind": kind,
        "selected_availability": availability,
    })
    
###########################################################################################

###########################################################################################
def venue_detail(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)

    # Log visit
    if not request.session.session_key:
        request.session.save()
    
    VenueVisit.objects.create(
        venue=venue,
        user=request.user if request.user.is_authenticated else None,
        session_key=request.session.session_key,
        ip_address=get_client_ip(request),
        timestamp=now()
    )

    # Reservation handling
    if request.method == 'POST':
        if not request.user.is_authenticated:
            messages.error(request, "Please Log in to make a reservation.")
            return redirect('login')  # or use 'login' if that's your login URL name

        form = ReservationForm(request.POST)
        if form.is_valid():
            reservation = form.save(commit=False)
            reservation.venue = venue
            reservation.status = 'pending'
            reservation.user = request.user if request.user.is_authenticated else None

            start_time = datetime.combine(reservation.date, reservation.time)
            end_time = start_time + timedelta(hours=1)

            overlapping = venue.reservations.filter(
                date=reservation.date,
                time__gte=(start_time - timedelta(hours=1)).time(),
                time__lt=end_time.time()
            )
            if overlapping.exists():
                messages.error(request, 'Sorry, that time slot is already reserved.')
            else:
                reservation.save()
                #send_reservation_emails(reservation)
                return render(request, 'venues/reservation_pending.html', {
                    'venue': venue,
                    'reservation': reservation
                })
    else:
        form = ReservationForm()

    return render(request, 'venues/venue_detail.html', {
        'venue': venue,
        'form': form
    })
    
###########################################################################################

###########################################################################################
def apply_venue(request):
    if request.method == 'POST':
        form = VenueApplicationForm(request.POST)
        if form.is_valid():
            venue_application = form.save()

            print("Form data:", form.cleaned_data)  # Debugging

            send_mail(
                'New Venue Application',
                f'New venue application submitted:\n\n{venue_application}',
                settings.DEFAULT_FROM_EMAIL,
                [admin.email for admin in User.objects.filter(is_superuser=True)],
            )
            messages.success(request, 'Your venue application has been submitted. We will contact you shortly.')
            return redirect('venue_list')
    else:
        form = VenueApplicationForm()
    return render(request, 'venues/apply_venue.html', {'form': form})

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
    elif grouping == 'monthly':
        trunc_fn = TruncMonth
        days_back = 180
    else:
        trunc_fn = TruncDay
        days_back = 30

    start_date = now().date() - timedelta(days=days_back)

    # Visits query
    visits = (
        VenueVisit.objects
        .filter(venue=venue, timestamp__date__gte=start_date)
        .annotate(period=trunc_fn('timestamp'))
        .values('period')
        .annotate(count=Count('id'))
        .order_by('period')
    )
    visit_labels = [v['period'].strftime('%Y-%m-%d') for v in visits]
    visit_values = [v['count'] for v in visits]

    # Reservations query
    reservations = (
        Reservation.objects
        .filter(venue=venue, date__gte=start_date)
        .annotate(period=trunc_fn('date'))
        .values('period')
        .annotate(count=Count('id'))
        .order_by('period')
    )
    reservation_labels = [r['period'].strftime('%Y-%m-%d') for r in reservations]
    reservation_values = [r['count'] for r in reservations]

    # Build Plotly figure
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=visit_labels, y=visit_values,
        mode='lines+markers', name='Visits',
        line=dict(color='royalblue')
    ))
    fig.add_trace(go.Scatter(
        x=reservation_labels, y=reservation_values,
        mode='lines+markers', name='Reservations',
        line=dict(color='orange')
    ))
    fig.update_layout(
        title=f"Visits and Reservations for {venue.name}",
        xaxis_title='Date',
        yaxis_title='Count',
        template='plotly_dark',
        height=550
    )

    # Keep config so frontend can use it in Plotly.newPlot
    config = {
        'displayModeBar': True,
        'displaylogo': False,
        'modeBarButtonsToRemove': [
            'pan2d', 'lasso2d', 'select2d', 'autoScale2d',
            'resetScale2d', 'toggleSpikelines'
        ],
        'toImageButtonOptions': {
            'format': 'png',
            'filename': f'{venue.name}_{grouping}_analytics',
            'height': 450,
            'width': 800,
            'scale': 1
        }
    }

    # Stats
    total_visits        = sum(visit_values)
    total_reservations  = sum(reservation_values)
    days_count          = max((now().date() - start_date).days, 1)
    avg_daily_visits    = round(total_visits / days_count, 2)
    peak_visits         = max(visit_values) if visit_values else 0

    data = {
        'grouping': grouping,
        'total_visits': total_visits,
        'avg_daily_visits': avg_daily_visits,
        'peak_visits': peak_visits,
        'total_reservations': total_reservations,
        'figure': fig.to_json(),  # serialized Plotly figure
        'config': config          # send config separately
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
        date__gte=now,
        status='pending'
    ).order_by('date', 'time')

    past_reservations = reservations.filter(
        date__lt=now
    ).order_by('-date', '-time')

    arrivals = reservations.filter( # Accepted reservations that are waiting for the guest to arrive
        date__gte=now,
        status='accepted',
        # arrival_status='pending'
    ).order_by('date', 'time')

    grouping        = request.GET.get('group', 'daily')
    analytics_data  = get_venue_visits_analytics_json(request, venue_id = venue_id, grouping = grouping)

    context = {
        'venue':                    venue,
        'upcoming_reservations':    upcoming_reservations,
        'past_reservations':        past_reservations,
        'arrivals':                 arrivals,
        **analytics_data,
    }

    return render(request, 'venues/venue_dashboard.html', context)

###########################################################################################

###########################################################################################
def venue_visits_analytics_api(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)

    # Get grouping param from query string (default to 'daily')
    grouping = request.GET.get('group', 'daily')

    # Get analytics data dict
    analytics_data = get_venue_visits_analytics_json(request, venue_id=venue_id, grouping=grouping)

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
    venue = get_object_or_404(Venue, id=venue_id)

    if venue.owner != request.user:
        raise PermissionDenied

    venue.is_full = not venue.is_full
    venue.save(update_fields=['is_full'])

    return redirect('venue_dashboard', venue_id=venue.id)

###########################################################################################

###########################################################################################
@login_required
@venue_admin_required
@require_POST
def update_reservation_status(request, reservation_id, status):
    reservation = get_object_or_404(Reservation, id=reservation_id)
    if reservation.venue.owner != request.user:
        return JsonResponse({'error': 'permission denied'}, status=403)
    if status not in ['accepted', 'rejected']:
        return JsonResponse({'error': 'invalid status'}, status=400)

    with transaction.atomic():
        if reservation.status != status:
            reservation.status = status
            reservation.save(update_fields=['status'])

    reservation_data = {
        "id": reservation.id,
        "customer_name": reservation.user.username if reservation.user else None,
        "date": reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time": reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests": getattr(reservation, 'guests', None),
        "status": reservation.status,
        "arrival_status": reservation.arrival_status,
        "urls": {
            "move": reverse('move_reservation_to_requests_ajax', args=[reservation.id]),
            "checkin": reverse('update_arrival_status', args=[reservation.id, 'checked_in']),
            "no_show": reverse('update_arrival_status', args=[reservation.id, 'no_show']),
            "accept": reverse('update_reservation_status', args=[reservation.id, 'accepted']),
            "reject": reverse('update_reservation_status', args=[reservation.id, 'rejected']),
        },
        "updated_at": timezone.now().isoformat(),
    }

    # Optionally broadcast this same reservation_data using Channels:
    # notify_venue_admin(venue=reservation.venue, event='reservation.status_updated', reservation=reservation_data)

    return JsonResponse({"reservation": reservation_data}, status=200)


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
        reservation.save()
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

            start_time = datetime.combine(reservation.date, reservation.time)
            end_time = start_time + timedelta(hours=1)

# time is a TimeField,
# reservations last exactly 1 hour,
# only compares by .time() not datetime.
# This works but can break if:
# a reservation spans midnight,
# different durations allowed,
# timezone mismatch.

            overlapping = Reservation.objects.filter(
                venue=venue,
                date=reservation.date,
                time__gte=(start_time - timedelta(hours=1)).time(),
                time__lt=end_time.time()
            )
            if overlapping.exists():
                messages.error(request, 'Sorry, that time slot is already reserved.')
                return render(request, 'venues/make_reservation.html', {'form': form, 'venue': venue})

            reservation.save()
            
            send_reservation_emails(reservation)
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
            form.save(commit=False)

            # ✅ Additional logic to move back to requests
            if form.cleaned_data.get('move_to_requests'):
                reservation.status = 'pending'
                reservation.arrival_status = 'pending'

            reservation.save()
            messages.success(request, "Reservation status updated successfully.")
            return redirect('venue_dashboard', venue_id=reservation.venue.id)
    else:
        form = ArrivalStatusForm(instance=reservation)

    context = {
        'form':         form,
        'reservation':  reservation
    }
    return render(request, 'venues/edit_reservation_status.html', context)

@login_required
def edit_reservation(request, pk):
    reservation = get_object_or_404(Reservation, pk=pk, user=request.user)

    if reservation.status == "cancelled":
        return redirect('my_reservations')  # Can't edit cancelled reservations

    if request.method == "POST":
        form = ReservationForm(request.POST, instance=reservation)
        if form.is_valid():
            form.save()
            reservation.status = 'pending'  # Reset status to pending on edit
            reservation.arrival_status = 'pending'  # Reset arrival status as well
            reservation.save()
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
            reservation.save(update_fields=['status', 'arrival_status'])
            moved = True

    # Build a compact reservation dict for the frontend
    reservation_data = {
        "id": reservation.id,
        "customer_name": reservation.user.username if reservation.user else None,
        "date": reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time": reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests": getattr(reservation, 'guests', None),
        "status": reservation.status,
        "arrival_status": reservation.arrival_status,
        # Optional: include action URLs (recommended)
        "urls": {
            "accept": reverse('update_reservation_status', args=[reservation.id, 'accepted']),
            "reject": reverse('update_reservation_status', args=[reservation.id, 'rejected']),
            "move": reverse('move_reservation_to_requests_ajax', args=[reservation.id]),
            "checkin": reverse('update_arrival_status', args=[reservation.id, 'checked_in']),
            "no_show": reverse('update_arrival_status', args=[reservation.id, 'no_show']),
        },
        "updated_at": timezone.now().isoformat(),
    }

    # Optional: broadcast over channels here (use the same shape)
    # notify_venue_admin(venue=reservation.venue, event='reservation.moved_to_requests', reservation=reservation_data)

    return JsonResponse({
        'moved': moved,
        'reservation': reservation_data
    })

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

    with transaction.atomic():
        reservation.arrival_status = arrival_status
        reservation.save(update_fields=['arrival_status'])

    reservation_data = {
        "id": reservation.id,
        "customer_name": reservation.user.username if reservation.user else None,
        "date": reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time": reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests": getattr(reservation, 'guests', None),
        "status": reservation.status,
        "arrival_status": reservation.arrival_status,
        "urls": {
            "move": reverse('move_reservation_to_requests_ajax', args=[reservation.id]),
            "checkin": reverse('update_arrival_status', args=[reservation.id, 'checked_in']),
            "no_show": reverse('update_arrival_status', args=[reservation.id, 'no_show']),
            "accept": reverse('update_reservation_status', args=[reservation.id, 'accepted']),
            "reject": reverse('update_reservation_status', args=[reservation.id, 'rejected']),
        },
        "updated_at": timezone.now().isoformat(),
    }

    # Optionally broadcast reservation_data via channels
    # notify_venue_admin(venue=reservation.venue, event='reservation.arrival_updated', reservation=reservation_data)

    return JsonResponse({
        "updated": True,
        "reservation": reservation_data,
    })


###########################################################################################

###########################################################################################
@login_required
def partial_reservation_row(request, pk: int):
    """Return one reservation row (for upcoming requests table)."""
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
    """Return one arrival row (special table), but still Reservation object."""
    try:
        r = Reservation.objects.select_related('user', 'venue').get(pk=pk)
    except Reservation.DoesNotExist:
        raise Http404
    html = render_to_string(
        'venues/partials/_arrival_row.html',
        {'r': r},
        request=request
    )
    return HttpResponse(html)

###########################################################################################

###########################################################################################