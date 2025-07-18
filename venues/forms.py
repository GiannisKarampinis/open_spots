from django import forms
from .models import Reservation, VenueApplication
from .utils import generate_time_choices
import datetime


class ReservationForm(forms.ModelForm):
    time = forms.TypedChoiceField(
        choices=generate_time_choices(),
        label="Time",
        coerce=lambda val: datetime.datetime.strptime(val, '%H:%M').time()
    )

    class Meta:
        model = Reservation
        fields = ['name', 'email', 'date', 'time', 'guests']
        widgets = {
            'date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
        }


class VenueApplicationForm(forms.ModelForm):
    class Meta:
        model = VenueApplication
        fields = [
            'venue_name', 'venue_type', 'location', 'description',
            'capacity', 'admin_name', 'admin_email', 'phone'
        ]