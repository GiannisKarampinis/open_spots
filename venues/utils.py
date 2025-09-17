from django.core.mail import send_mail
from django.conf import settings
from datetime import datetime, time, timedelta, date
from django.db.models import Count
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth, TruncYear
from django.utils.timezone import now
import plotly.graph_objects as go
from plotly.offline import plot
import requests


def get_coords_nominatim(address):
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": address, "format": "json", "limit": 1}
    headers = {'User-Agent': 'Openspots/1.0 (openspots.application@gmail.com)'}
    response = requests.get(url, params=params, headers=headers)
    if response.status_code == 200 and response.json():
        result = response.json()[0]
        return float(result['lat']), float(result['lon'])
    return None, None


def send_reservation_emails(reservation):
    subject = f"Reservation Request at {reservation.venue.name}"
    message = f"""
    A new reservation has been made:

    Name:   {reservation.name}
    Email:  {reservation.email}
    Date:   {reservation.date}
    Time:   {reservation.time}
    Guests: {reservation.guests}
    Venue:  {reservation.venue.name}
    """

    # Send email to venue owner
    venue_owner_email = reservation.venue.owner.email if reservation.venue.owner else settings.DEFAULT_FROM_EMAIL
    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [venue_owner_email])

    # Confirmation email to user
    user_subject = f"Your Reservation at {reservation.venue.name}"
    user_message = f"""
    Hello {reservation.name},

    Your reservation request has been received:
    - Date:     {reservation.date}
    - Time:     {reservation.time}
    - Guests:   {reservation.guests}

    The venue will confirm your reservation soon.
    """
    send_mail(user_subject, user_message, settings.DEFAULT_FROM_EMAIL, [reservation.email])


def generate_time_choices():
    start   = time(hour=12, minute=0)      # use time directly
    end     = time(hour=23, minute=0)
    delta   = timedelta(minutes=30)
    current_datetime = datetime.combine(date.today(), start)
    end_datetime = datetime.combine(date.today(), end)
    
    times = []
    while current_datetime <= end_datetime:
        time_value = current_datetime.time()
        label = current_datetime.strftime("%I:%M %p")
        times.append((time_value.strftime("%H:%M:%S"), label))
        current_datetime += delta
    
    return times

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def generate_analytics_data(venue, grouping):
    """Generate analytics data based on grouping type"""
    
    if grouping == 'daily':
        trunc_fn    = TruncDay
        days_back   = 30
        date_format = '%Y-%m-%d'
        period_name = 'Day'
    elif grouping == 'weekly':
        trunc_fn    = TruncWeek
        days_back   = 84  # 12 weeks
        date_format = 'Week of %Y-%m-%d'
        period_name = 'Week'
    elif grouping == 'monthly':
        trunc_fn    = TruncMonth
        days_back   = 365  # 12 months
        date_format = '%Y-%m'
        period_name = 'Month'
    elif grouping == 'yearly':
        trunc_fn    = TruncYear
        days_back   = 1095  # 3 years
        date_format = '%Y'
        period_name = 'Year'
    else:
        # Default to daily
        trunc_fn    = TruncDay
        days_back   = 30
        date_format = '%Y-%m-%d'
        period_name = 'Day'

    start_date = now().date() - timedelta(days=days_back)

    visits = (
        VenueVisit.objects
        .filter(venue=venue, timestamp__date__gte=start_date)
        .annotate(period=trunc_fn('timestamp'))
        .values('period')
        .annotate(count=Count('id'))
        .order_by('period')
    )

    # Format labels based on grouping
    if grouping == 'weekly':
        labels = [v['period'].strftime('Week of %b %d, %Y') for v in visits]
    elif grouping == 'monthly':
        labels = [v['period'].strftime('%B %Y') for v in visits]
    elif grouping == 'yearly':
        labels = [v['period'].strftime('%Y') for v in visits]
    else:  # daily
        labels = [v['period'].strftime('%b %d') for v in visits]

    values = [v['count'] for v in visits]

    return labels, values

def generate_analytics_chart(labels, values, venue_name, grouping):
    """Generate Plotly chart for analytics"""
    
    color_schemes = {
        'daily': {'bg': 'rgba(74, 144, 226, 0.8)', 'border': 'rgba(74, 144, 226, 1)'},
        'weekly': {'bg': 'rgba(46, 204, 113, 0.8)', 'border': 'rgba(46, 204, 113, 1)'},
        'monthly': {'bg': 'rgba(231, 76, 60, 0.8)', 'border': 'rgba(231, 76, 60, 1)'},
        'yearly': {'bg': 'rgba(155, 89, 182, 0.8)', 'border': 'rgba(155, 89, 182, 1)'},
    }
    
    colors = color_schemes.get(grouping, color_schemes['daily'])
    
    fig = go.Figure(data=[
        go.Bar(
            x=labels,
            y=values,
            name='Visits',
            marker=dict(
                color=colors['bg'],
                line=dict(color=colors['border'], width=1)
            ),
            hovertemplate='<b>%{x}</b><br>Visits: %{y}<extra></extra>'
        )
    ])
    
    fig.update_layout(
        title=dict(
            text=f'{grouping.capitalize()} Visit Statistics',
            font=dict(color='#e0e0e0', size=20),
            x=0.5
        ),
        xaxis=dict(
            title=dict(
                text=f'{grouping.capitalize()} Period',
                font=dict(color='#a0c8ff', size=14)
            ),
            tickfont=dict(color='#a0c8ff', size=12),
            gridcolor='rgba(255, 255, 255, 0.1)',
            tickangle=-45 if len(labels) > 10 else 0
        ),
        yaxis=dict(
            title=dict(
                text='Number of Visits',
                font=dict(color='#a0c8ff', size=14)
            ),
            tickfont=dict(color='#a0c8ff', size=12),
            gridcolor='rgba(255, 255, 255, 0.1)'
        ),
        plot_bgcolor='rgba(42, 42, 42, 0.9)',
        paper_bgcolor='rgba(42, 42, 42, 0)',
        font=dict(color='#e0e0e0'),
        height=450,
        margin=dict(l=60, r=50, t=80, b=80),
        showlegend=False
    )
    
    if values:
        print(values)
        avg = sum(values) / len(values)
        fig.add_hline(
            y=avg,
            line_dash="dash",
            line_color="rgba(255, 193, 7, 0.6)",
            annotation_text="Average",
            annotation_position="bottom right",
            annotation_font_color="#ffc107"
        )
    
    config = {
        'displayModeBar': True,
        'displaylogo': False,
        'modeBarButtonsToRemove': [
            'pan2d', 'lasso2d', 'select2d', 'autoScale2d',
            'resetScale2d', 'toggleSpikelines'
        ],
        'toImageButtonOptions': {
            'format': 'png',
            'filename': f'{venue_name}_{grouping}_analytics',
            'height': 450,
            'width': 800,
            'scale': 1
        }
    }
    
    chart_div = plot(
        fig,
        output_type='div',
        include_plotlyjs=False,
        config=config
    )
    
    return chart_div