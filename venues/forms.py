from django import forms
from .models import Booking, Reservation
from .utils import generate_time_choices
import datetime

class BookingForm(forms.ModelForm):
    class Meta:
        model = Booking
        fields = ['date', 'time', 'num_people']
        widgets = {
            'date': forms.DateInput(attrs={'type': 'date'}),
            'time': forms.TimeInput(attrs={'type': 'time'}),
        }

class ReservationForm(forms.ModelForm):
    time = forms.ChoiceField(choices=generate_time_choices(), label="Time")

    class Meta:
        model = Reservation
        fields = ['name', 'email', 'date', 'time', 'guests']
        widgets = {
            'date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
        }