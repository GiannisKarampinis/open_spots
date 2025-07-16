from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import redirect_to_login
from .models import Venue, Reservation
from .forms import BookingForm, ReservationForm
from .utils import send_reservation_emails
from django.contrib import messages
from django.core.mail import send_mail
from django.conf import settings


def venue_list(request):
    venues = Venue.objects.all()
    return render(request, 'venues/venue_list.html', {'venues': venues})


def book_venue(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)

    if request.method == 'POST':
        form = BookingForm(request.POST)
        if form.is_valid():
            cleaned_data = form.cleaned_data

            # If the user is not logged in, store booking info in session and redirect
            if not request.user.is_authenticated:
                booking_date = cleaned_data.get('date')
                if booking_date:
                    booking_date = booking_date.isoformat()
                else:
                    booking_date = None

                request.session['booking_data'] = {
                    'booking_date': booking_date,
                    'number_of_people': int(cleaned_data.get('num_people', 1)),
                }
                request.session['booking_venue_id'] = venue.id
                return redirect_to_login(request.get_full_path())

            # If user is authenticated, save the booking
            booking = form.save(commit=False)
            booking.user = request.user
            booking.venue = venue
            booking.save()

            # Optionally reduce available tables
            venue.available_tables = max(0, venue.available_tables - 1)
            venue.save()

            return redirect('venue_list')  # or redirect to a success page
    else:
        form = BookingForm()

    return render(request, 'venues/book_venue.html', {
        'venue': venue,
        'form': form
    })

def make_reservation(request, venue_id):
    venue = get_object_or_404(Venue, id=venue_id)

    if request.method == 'POST':
        form = ReservationForm(request.POST)
        if form.is_valid():
            reservation = form.save(commit=False)
            reservation.venue = venue
            if request.user.is_authenticated:
                reservation.user = request.user
            reservation.save()
            send_reservation_emails(reservation)
            messages.success(request, 'Reservation submitted. Await confirmation.')
            return redirect('my_reservations')
    else:
        form = ReservationForm()

    return render(request, 'venues/make_reservation.html', {'form': form, 'venue': venue})


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