from django     import template
from datetime   import datetime

register = template.Library()

@register.filter
def format_date_display(value):
    if not value:
        return ''
    try:
        dt = datetime.fromisoformat(str(value))
        return dt.strftime("%b %d, %Y")  # e.g. "Oct 6, 2025"
    except Exception:
        return str(value)

@register.filter
def format_time_display(value):
    if not value:
        return ''
    try:
        dt = datetime.strptime(str(value), "%H:%M:%S")
        return dt.strftime("%I:%M %p").lstrip('0')  # e.g. "12:00 PM"
    except Exception:
        return str(value)
