from typing import Any

from django import template
from django.utils import timezone
from datetime import datetime, date, time

register = template.Library()  # Creates a registry where custom template tags/filters are registered.


########################################################################################
# Custom Template Filters for Date/Time Formatting
# Goal: Accept messy date/time inputs and format them safely/consistently for display
# in templates, without crashing on bad data.
#
# Notes:
# - Datetime objects are converted to the current Django timezone (if aware) before
#   formatting, so displayed values match the active timezone.
# - Month names use the system/Django locale (%b).
########################################################################################


@register.filter  # Makes this available in templates once `{% load date_filters %}` is used.
def format_date_display(value: Any) -> str:
    """
    Safely formats a date-like value for display.

    Output example:
        "Oct 06, 2025"

    Works with:
        - date objects
        - datetime objects (ignores time; converted to current timezone if aware)
        - strings beginning with YYYY-MM-DD (e.g. "2025-10-06" or "2025-10-06T12:34:56")
        - any other value (returned as its string representation)
    """
    if not value:
        return ""

    # If already a date/datetime object
    if isinstance(value, datetime):
        # If aware, convert to current timezone
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.strftime("%b %d, %Y")  # Ex: "Oct 06, 2025"

    if isinstance(value, date):
        return value.strftime("%b %d, %Y")

    # Convert to string for fallback handling
    s = str(value)

    # If value starts with ISO date "YYYY-MM-DD"
    if (
        len(s) >= 10
        and s[4] == "-"
        and s[7] == "-"
        and s[:4].isdigit()
        and s[5:7].isdigit()
        and s[8:10].isdigit()
    ):
        try:
            dt = datetime.strptime(s[:10], "%Y-%m-%d")
            return dt.strftime("%b %d, %Y")
        except ValueError:
            # If parsing fails, fall through to returning the raw string.
            pass

    # Worst case — return as-is (raw value)
    return s


@register.filter
def format_time_display(value: Any) -> str:
    """
    Safely formats a time-like value for display.

    Output example:
        "6:15 PM"

    Works with:
        - time objects
        - datetime objects (uses its time part, converted to current timezone if aware)
        - strings beginning with HH:MM (24-hour, e.g. "18:30" or "18:30:45")
        - any other value (returned as its string representation)
    """
    if not value:
        return ""

    # If already a time/datetime object
    if isinstance(value, time):
        return value.strftime("%I:%M %p").lstrip("0")

    if isinstance(value, datetime):
        # If aware, convert to current timezone
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.strftime("%I:%M %p").lstrip("0")

    # Convert to string for fallback handling
    s = str(value)

    # If string begins with HH:MM (24-hour)
    if (
        len(s) >= 5
        and s[2] == ":"
        and s[:2].isdigit()
        and s[3:5].isdigit()
    ):
        try:
            dt = datetime.strptime(s[:5], "%H:%M")
            return dt.strftime("%I:%M %p").lstrip("0")
        except ValueError:
            # If parsing fails, fall through to returning the raw string.
            pass

    # Last resort — return as-is
    return s


########################################################################################
# End of date_filters.py
########################################################################################
