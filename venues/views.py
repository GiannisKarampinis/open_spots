from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.http import require_POST
from django.db.models import Count
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
from django.utils.timezone import now
from datetime import datetime, timedelta

from .models import Venue, VenueVisit, Reservation
from .forms import ReservationForm, VenueApplicationForm
from .utils import send_reservation_emails, get_client_ip  # make sure this exists or adapt accordingly
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.models import User  # For admin email in venue signup



def venue_list(request):
    venues = Venue.objects.all()
    return render(request, 'venues/venue_list.html', {'venues': venues})


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
                return render(request, 'venues/reservation_success.html', {
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

            # Send email notification to admins (from shops code)
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
    print(venue.name)
    print(venue.owner, request.user)
    if venue.owner != request.user:
        return redirect('venue_list')

    reservations = Reservation.objects.filter(venue=venue).order_by('-date', 'time')
    return render(request, 'venues/venue_dashboard.html', {'venue': venue, 'reservations': reservations})


@login_required
@require_POST
def toggle_venue_full(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)
    if venue.owner != request.user:
        return redirect('venue_list')

    venue.is_full = not venue.is_full
    venue.save()
    return redirect('venue_dashboard', venue_id=venue.id)


@login_required
def update_reservation_status(request, reservation_id, status):
    reservation = get_object_or_404(Reservation, id=reservation_id)
    if reservation.venue.owner != request.user:
        return redirect('venue_list')

    reservation.status = status
    reservation.save()
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
        return redirect('venue_list')

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
