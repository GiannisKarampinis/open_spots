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
from .forms import ReservationForm, VenueApplicationForm, ReservationStatusForm
from .utils import send_reservation_emails, get_client_ip  # make sure this exists or adapt accordingly
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.models import User  # For admin email in venue signup
from django.core.serializers.json import DjangoJSONEncoder
from django.utils.safestring import mark_safe
from django.contrib.auth import get_user_model
from django.http import HttpResponseForbidden
from django.core.exceptions import PermissionDenied
import json

User = get_user_model()

def venue_list(request):
    venues = Venue.objects.all()
    venue_data = [
        {
            'name': v.name,
            'lat': v.latitude,
            'lng': v.longitude,
            'id': v.id
        } for v in venues if v.latitude and v.longitude
    ]
    return render(request, 'venues/venue_list.html', {
        'venues': venues,
        'venue_data_json': mark_safe(json.dumps(venue_data, cls=DjangoJSONEncoder))
    })


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


@login_required
def venue_dashboard(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)
    reservations = venue.reservations.all()  # or your related_name

    now = timezone.now().date()

    upcoming_reservations = reservations.filter(date__gte=now).order_by('date', 'time')
    past_reservations = reservations.filter(date__lt=now).order_by('-date', '-time')

    context = {
        'venue': venue,
        'upcoming_reservations': upcoming_reservations,
        'past_reservations': past_reservations,
    }
    return render(request, 'venues/venue_dashboard.html', context)


@login_required
@require_POST
def toggle_venue_full(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)

    if venue.owner != request.user:
        raise PermissionDenied

    venue.is_full = not venue.is_full
    venue.save(update_fields=['is_full'])

    return redirect('venue_dashboard', venue_id=venue.id)


@login_required
def update_reservation_status(request, reservation_id, status):
    reservation = get_object_or_404(Reservation, id=reservation_id)
    if reservation.venue.owner != request.user:
        raise PermissionDenied

    if status in ['accepted', 'rejected'] and reservation.status == 'pending':
        reservation.status = status
        reservation.save(update_fields=['status'])

    return redirect('venue_dashboard', venue_id=reservation.venue.id)


@login_required
def my_reservations(request):
    reservations = Reservation.objects.filter(user=request.user).order_by('-date', 'time')
    return render(request, 'venues/my_reservations.html', {'reservations': reservations})


@login_required
def cancel_reservation(request, reservation_id):
    reservation = get_object_or_404(Reservation, id=reservation_id, user=request.user)
    if request.method == 'POST':
        reservation.status = 'cancelled'
        reservation.save()
        messages.success(request, 'Reservation cancelled.')
        return redirect('my_reservations')
    return render(request, 'venues/confirm_cancel.html', {'reservation': reservation})


def venue_visits_analytics(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)
    if venue.owner != request.user:
        return HttpResponseForbidden("You do not have permission to view this dashboard.")

    grouping = request.GET.get('group', 'daily')

    if grouping == 'weekly':
        trunc_fn = TruncWeek
        days_back = 60
    elif grouping == 'monthly':
        trunc_fn = TruncMonth
        days_back = 180
    else:
        trunc_fn = TruncDay
        days_back = 7

    start_date = now().date() - timedelta(days=days_back)

    visits = (
        VenueVisit.objects
        .filter(venue=venue, timestamp__date__gte=start_date)
        .annotate(period=trunc_fn('timestamp'))
        .values('period')
        .annotate(count=Count('id'))
        .order_by('period')
    )

    labels = [v['period'].strftime('%Y-%m-%d') for v in visits]
    values = [v['count'] for v in visits]

    return render(request, 'venues/venue_analytics.html', {
        'venue': venue,
        'labels': labels,
        'values': values,
        'grouping': grouping,
    })


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

    # Check if the current user is the owner/admin of the venue
    if reservation.venue.owner != request.user:
        messages.error(request, "You do not have permission to edit this reservation.")
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