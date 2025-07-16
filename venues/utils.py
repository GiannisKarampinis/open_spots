from    django.core.mail    import send_mail
from    django.conf         import settings
import  datetime

def send_reservation_emails(reservation):
    subject = f"Reservation Request at {reservation.venue.name}"
    message = f"""
    A new reservation has been made:

    Name: {reservation.name}
    Email: {reservation.email}
    Date: {reservation.date}
    Time: {reservation.time}
    Guests: {reservation.guests}
    Venue: {reservation.venue.name}
    """

    # Send email to venue owner
    venue_owner_email = reservation.venue.owner.email if reservation.venue.owner else settings.DEFAULT_FROM_EMAIL
    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [venue_owner_email])

    # Confirmation email to user
    user_subject = f"Your Reservation at {reservation.venue.name}"
    user_message = f"""
    Hello {reservation.name},

    Your reservation request has been received:
    - Date: {reservation.date}
    - Time: {reservation.time}
    - Guests: {reservation.guests}

    The venue will confirm your reservation soon.
    """
    send_mail(user_subject, user_message, settings.DEFAULT_FROM_EMAIL, [reservation.email])

def generate_time_choices():
    start = datetime.time(hour=12, minute=0)
    end = datetime.time(hour=23, minute=0)
    delta = datetime.timedelta(minutes=30)
    current_datetime = datetime.datetime.combine(datetime.date.today(), start)
    end_datetime = datetime.datetime.combine(datetime.date.today(), end)
    
    times = []
    while current_datetime <= end_datetime:
        time_value = current_datetime.time()
        label = current_datetime.strftime("%I:%M %p")
        times.append((time_value.strftime("%H:%M:%S"), label))
        current_datetime += delta
    
    return times