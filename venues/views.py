from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.http import require_POST
from django.db.models import Count
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
from django.utils.timezone import now
from datetime import datetime, timedelta
from django.utils import timezone
from .models import Venue, VenueVisit, Reservation
from .forms import ReservationForm, VenueApplicationForm, ReservationStatusForm, ArrivalStatusForm
from .utils import *
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.models import User  # For admin email in venue signup
from django.core.serializers.json import DjangoJSONEncoder
from django.utils.safestring import mark_safe
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from .decorators import venue_admin_required
import json
import plotly.graph_objs as go
from plotly.offline import plot
from django.http import HttpResponse
from django.template.loader import render_to_string



User = get_user_model()

###########################################################################################

###########################################################################################
def venue_list(request):
    venues = Venue.objects.all()
    venue_data = [
        {
            'name':     v.name,
            'lat':      v.latitude,
            'lng':      v.longitude,
            'id':       v.id
        } for v in venues if v.latitude and v.longitude
    ]
    return render(request, 'venues/venue_list.html', {
        'venues': venues,
        'venue_data_json': mark_safe(json.dumps(venue_data, cls=DjangoJSONEncoder))
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
                send_reservation_emails(reservation)
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
def get_venue_visits_analytics_data(venue, grouping='daily'):
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

    # Visits
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

    # Reservations
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

    # Chart
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
        template='plotly_dark'
    )
        
    chart_div = plot(fig, output_type='div', include_plotlyjs=True)

    # Stats
    total_visits        = sum(visit_values)
    total_reservations  = sum(reservation_values)
    days_count          = max((now().date() - start_date).days, 1)
    avg_daily_visits    = round(total_visits / days_count, 2)
    peak_visits         = max(visit_values) if visit_values else 0

    return {
        'grouping': grouping,
        'total_visits': total_visits,
        'avg_daily_visits': avg_daily_visits,
        'peak_visits': peak_visits,
        'total_reservations': total_reservations,
        'chart_div': chart_div,
    }

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
    analytics_data  = get_venue_visits_analytics_data(venue, grouping)

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
    analytics_data = get_venue_visits_analytics_data(venue, grouping)

    # if request.GET.get('format') == 'json' or request.headers.get("X-Requested-With") == "XMLHttpRequest":
    #     return JsonResponse({
    #         "chart_div": analytics_data['chart_div'],
    #         "total_visits": analytics_data['total_visits'],
    #         "avg_daily_visits": analytics_data['avg_daily_visits'],
    #         "peak_visits": analytics_data['peak_visits'],
    #         "grouping": grouping,
    #         "total_reservations": analytics_data['total_reservations'],
    #     })

    # If not AJAX, render the full analytics page (or redirect to dashboard)
    context = {
        "venue": venue,
        "chart_div": analytics_data['chart_div'],
        "total_visits": analytics_data['total_visits'],
        "avg_daily_visits": analytics_data['avg_daily_visits'],
        "peak_visits": analytics_data['peak_visits'],
        "grouping": grouping,
        "total_reservations": analytics_data['total_reservations'],
    }
        
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        html = render_to_string("venues/_analytics_tab_content.html", context, request=request)
        return HttpResponse(html)
    
    return render(request, "venues/_analytics_tab_content.html", context)


###########################################################################################

###########################################################################################
@login_required
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
def update_reservation_status(request, reservation_id, status):
    reservation = get_object_or_404(Reservation, id=reservation_id)
    if reservation.venue.owner != request.user:
        raise PermissionDenied

    if status in ['accepted', 'rejected'] and reservation.status == 'pending':
        reservation.status = status
        reservation.save(update_fields=['status'])

    return redirect('venue_dashboard', venue_id=reservation.venue.id)

###########################################################################################

###########################################################################################
@login_required
def my_reservations(request):
    reservations = Reservation.objects.filter(user=request.user).order_by('-date', 'time')
    return render(request, 'venues/my_reservations.html', {'reservations': reservations})

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


@login_required
def edit_reservation_status(request, reservation_id):
    reservation = get_object_or_404(Reservation, id=reservation_id)

    # ✅ Check if the current user is the owner/admin of the venue
    if reservation.venue.owner != request.user:
        messages.error(request, "You do not have permission to edit this reservation.")
        return redirect('venue_dashboard', venue_id=reservation.venue.id)

    # ✅ Check if reservation is in the past
    if not reservation.is_upcoming():
        messages.warning(request, "You cannot edit the status of past reservations.")
        return redirect('venue_dashboard', venue_id=reservation.venue.id)

    # ✅ Block edit if it's still waiting admin decision
    if reservation.status == 'pending':
        messages.warning(request, "You must accept or reject the reservation before editing its status.")
        return redirect('venue_dashboard', venue_id=reservation.venue.id)

    # ✅ Block edit if arrival_status is already finalized
    if reservation.arrival_status in ['checked_in', 'no_show']:
        messages.warning(request, f"This reservation has already been marked as '{reservation.arrival_status.replace('_', ' ')}'.")
        return redirect('venue_dashboard', venue_id=reservation.venue.id)

    if request.method == 'POST':
        form = ReservationStatusForm(request.POST, instance=reservation)
        if form.is_valid():
            form.save()
            messages.success(request, "Reservation status updated successfully.")
            return redirect('venue_dashboard', venue_id=reservation.venue.id)
    else:
        form = ReservationStatusForm(instance=reservation)

    context = {
        'form': form,
        'reservation': reservation,
    }
    return render(request, 'venues/edit_reservation_status.html', context)


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


@login_required
def update_arrival_status(request, reservation_id, arrival_status):
    reservation = get_object_or_404(Reservation, id=reservation_id)
    if reservation.venue.owner != request.user:
        raise PermissionDenied

    print(reservation.arrival_status)
    if arrival_status in ['checked_in', 'no_show'] and reservation.arrival_status == 'pending':
        reservation.arrival_status = arrival_status
        reservation.save(update_fields=['arrival_status'])
        print(reservation.arrival_status)

    return redirect('venue_dashboard', venue_id=reservation.venue.id)
