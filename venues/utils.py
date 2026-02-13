from datetime                       import datetime, time, timedelta, date
from django.db.models               import Count
from django.db.models.functions     import TruncDay, TruncWeek, TruncMonth, TruncYear
from django.utils.timezone          import now
from plotly.offline                 import plot
from PIL                            import Image, UnidentifiedImageError
from io                             import BytesIO
from django.core.files.base         import ContentFile
from typing                         import Tuple, Optional
from functools                      import lru_cache
from django.db                      import IntegrityError
from django.core.cache              import cache
from time                           import time as current_timestamp

import  logging
import  requests
import  plotly.graph_objects        as go

logger = logging.getLogger(__name__)
###########################################################################################

###########################################################################################
@lru_cache(maxsize = 1024)
def _cached_nominatim(address: str) -> Optional[Tuple[float, float]]:
    """
        Internal cached helper - small LRU cache.
        Returns (lat, lon) or None on failure.
    """
    
    url         =   "https://nominatim.openstreetmap.org/search"
    params      =   { 
                      "q":       address, 
                      "format":  "json", 
                      "limit":   1 
                    }
    
    headers     =   { 'User-Agent': 'Openspots/1.0 (openspots.application@gmail.com)' }
    
    try:
        resp    = requests.get(url, params=params, headers=headers, timeout=5)
        resp.raise_for_status()
        
        data    = resp.json()
        if not data:
            return None
        
        result  = data[0]
        
        return float(result['lat']), float(result['lon'])
    
    except requests.RequestException as exc:
    
        logger.warning("Nominatim request failed for %r: %s", address, exc)
    
    except (ValueError, KeyError) as exc:
    
        logger.exception("Invalid response from nominatim for %r: %s", address, exc)
    
    return None

###########################################################################################

###########################################################################################
def get_coords_nominatim(address: str) -> tuple[Optional[float], Optional[float]]:
    """
        Geocode address via Nominatim. Returns (lat, lon) or (None, None) on failure.
        Uses an in-memory LRU cache to reduce requests.
    """

    if not address:
        return None, None

    res = _cached_nominatim(address)
    if res:
        return res

    return None, None

###########################################################################################

###########################################################################################
def generate_time_choices():
    """
        Generate time choices from 12:00 PM to 11:00 PM in 30-minute increments.
        Returns list of tuples: (time_value, label)
    """
    
    start               = time(hour=12, minute=0)       # FIXME: This should be controllable/configurable
    end                 = time(hour=23, minute=0)       # FIXME: This should be controllable/configurable
    delta               = timedelta(minutes=30)         # FIXME: This should be controllable/configurable
    current_datetime    = datetime.combine(date.today(), start)
    end_datetime        = datetime.combine(date.today(), end)
    
    times = []
    while current_datetime <= end_datetime:
        time_value  = current_datetime.time()
        label       = current_datetime.strftime("%I:%M %p")
        
        times.append((time_value, label))

        current_datetime += delta
    
    return times

###########################################################################################

###########################################################################################
def get_client_ip(request):
    """
        Return client's IP considering typical proxy headers.
        IMPORTANT: only trust X-Forwarded-For if your proxy sets it and you control the proxy.
    """
    
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')

    if x_forwarded_for:
        # X-Forwarded-For may contain a list of IPs; the left-most is original client
        ip = x_forwarded_for.split(',')[0].strip()
        return ip

    x_real_ip = request.META.get('HTTP_X_REAL_IP')

    if x_real_ip:
        return x_real_ip.strip()

    return request.META.get('REMOTE_ADDR')

###########################################################################################

###########################################################################################
def generate_analytics_data(venue, grouping):
    from .models import VenueVisit
    """
        Generate analytics data based on grouping type
    """
    
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
        .filter(venue = venue, timestamp__date__gte = start_date)
        .annotate(period = trunc_fn('timestamp'))
        .values('period')
        .annotate(count = Count('id'))
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

###########################################################################################

###########################################################################################
def generate_analytics_chart(labels, values, venue_name, grouping):
    """
        Generate Plotly chart for analytics
    """
    
    color_schemes = {
        'daily':    { 'bg': 'rgba(74, 144, 226, 0.8)',   'border': 'rgba(74, 144, 226, 1)' },
        'weekly':   { 'bg': 'rgba(46, 204, 113, 0.8)',   'border': 'rgba(46, 204, 113, 1)' },
        'monthly':  { 'bg': 'rgba(231, 76, 60, 0.8)',    'border': 'rgba(231, 76, 60, 1)'  },
        'yearly':   { 'bg': 'rgba(155, 89, 182, 0.8)',   'border': 'rgba(155, 89, 182, 1)' }
    }
    
    colors = color_schemes.get(grouping, color_schemes['daily'])
    
    fig = go.Figure(data=[
        go.Bar(
            x           =   labels,
            y           =   values,
            name        =   'Visits',
            marker      =   dict(
                color   =   colors['bg'],
                line    =   dict(color=colors['border'], width=1)
            ),
            hovertemplate='<b>%{x}</b><br>Visits: %{y}<extra></extra>'
        )
    ])
    
    fig.update_layout(
        title =dict(
            text        =   f'{grouping.capitalize()} Visit Statistics',
            font        =   dict(color='#e0e0e0', size=20),
            x           =   0.5
        ),
        xaxis=dict(
            title=dict(
                text    =   f'{grouping.capitalize()} Period',
                font    =   dict(color='#a0c8ff', size=14)
            ),
            tickfont    =   dict(color='#a0c8ff', size=12),
            gridcolor   =   'rgba(255, 255, 255, 0.1)',
            tickangle   =   -45 if len(labels) > 10 else 0
        ),
        yaxis=dict(
            title=dict(
                text    =   'Number of Visits',
                font    =   dict(color='#a0c8ff', size=14)
            ),
            tickfont    =   dict(color='#a0c8ff', size=12),
            gridcolor   =   'rgba(255, 255, 255, 0.1)'
        ),
        plot_bgcolor    =   'rgba(42, 42, 42, 0.9)',
        paper_bgcolor   =   'rgba(42, 42, 42, 0)',
        font            =   dict(color = '#e0e0e0'),
        height          =   450,
        margin          =   dict(l=60, r=50, t=80, b=80),
        showlegend      =   False
    )
    
    if values:
        avg = sum(values) / len(values)
        fig.add_hline(
            y                     =   avg,
            line_dash             =   "dash",
            line_color            =   "rgba(255, 193, 7, 0.6)",
            annotation_text       =   "Average",
            annotation_position   =   "bottom right",
            annotation_font_color =   "#ffc107"
        )
    
    config = {
        'displayModeBar':       True,
        'displaylogo':          False,
        'modeBarButtonsToRemove': [
            'pan2d', 'lasso2d', 'select2d', 'autoScale2d',
            'resetScale2d', 'toggleSpikelines'
        ],
        'toImageButtonOptions': {
            'format':       'png',
            'filename':     f'{venue_name}_{grouping}_analytics',
            'height':       450,
            'width':        800,
            'scale':        1
        }
    }
    
    chart_div = plot(
        fig,
        output_type      =   'div',
        include_plotlyjs =   False,
        config           =   config
    )
    
    return chart_div

###########################################################################################

###########################################################################################
def convert_image_to_webp(image_field, quality=80, max_width=None):
    """
        Convert an image-like file to webp ContentFile.
        - image_field: file-like object (InMemoryUploadedFile or FieldFile)
        - returns ContentFile or raises exception on failure
    """
    try:
        img = Image.open(image_field)
    except UnidentifiedImageError:
        logger.exception("convert_image_to_webp: Invalid image")
        raise
    except Exception:
        logger.exception("convert_image_to_webp: Failed to open image")
        raise

    # Optional resize
    if max_width and img.width > max_width:
        ratio = max_width / float(img.width)
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), Image.LANCZOS)

    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    buffer = BytesIO()
    img.save(buffer, format="WEBP", quality=quality, method=6)
    buffer.seek(0)

    # Optionally produce a filename
    filename = getattr(image_field, "name", "image").rsplit(".", 1)[0] + ".webp"

    return ContentFile(buffer.read(), name=filename)

###########################################################################################

###########################################################################################
def log_venue_visit(venue, request):
    from .models import VenueVisit

    """
        Log a visit.
        Does NOT count visits when the venue owner views their own venue.
    """

    try:
        if not request.session.session_key:
            request.session.save()

        user = request.user if request.user.is_authenticated else None

        # Skip owner viewing their own venue
        if user and venue.owner_id and venue.owner_id == user.id:
            return

        VenueVisit.objects.create(venue=venue, user=user, session_key=request.session.session_key,
                                  ip_address=get_client_ip(request), timestamp=now()
        )

    except IntegrityError:
        logger.exception(
            "Database integrity error while logging visit for venue %s",
            getattr(venue, "id", None)
        )
    except Exception:
        logger.exception(
            "Failed to log venue visit for venue %s",
            getattr(venue, "id", None)
        )
    
###########################################################################################

###########################################################################################
def is_throttled(user, key, limit=5, period=60):
    """
    Simple throttle using Django cache.
    Allows `limit` actions per `period` seconds for each user and key.
    """
    if not user.is_authenticated:
        return False  # Or optionally throttle anonymous differently

    cache_key = f"throttle:{key}:{user.id}"
    now = current_timestamp()
    window = cache.get(cache_key, [])

    # Filter out old timestamps
    window = [ts for ts in window if now - ts < period]

    if len(window) >= limit:
        return True

    window.append(now)
    cache.set(cache_key, window, timeout=period)
    return False

###########################################################################################

###########################################################################################
def user_can_manage_venue(user, venue):
    print(user.is_authenticated, user.user_type, venue.owner_id, user.id)
    
    if not user.is_authenticated:
        return False

    if user.is_superuser: # superuser has superpower
        return True

    if user.user_type != 'venue_admin':
        return False
    
    if venue.owner == user:
        return True
    
    
    return False

###########################################################################################

###########################################################################################
