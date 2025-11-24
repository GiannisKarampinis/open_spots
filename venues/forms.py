from django import forms
from .models import Reservation, VenueApplication, Venue
from .utils import generate_time_choices
from django.utils.timezone import now
import datetime
from django.utils.translation import gettext_lazy as _


class ReservationForm(forms.ModelForm):

    time = forms.ChoiceField(
        choices=generate_time_choices(),
        widget=forms.Select(),
        label=_("Time")
    )

    class Meta:
        model = Reservation
        fields = [
            'name', 'email', 'phone', 'date', 'time',
            'guests', 'special_requests', 'allergies', 'comments'
        ]
        labels = {
            'name': _("Name"),
            'email': _("Email"),
            'phone': _("Phone"),
            'date': _("Date"),
            'guests': _("Number of guests"),
            'special_requests': _("Special requests"),
            'allergies': _("Allergies"),
            'comments': _("Comments"),
        }
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'email': forms.EmailInput(attrs={'class': 'form-control'}),
            'phone': forms.TextInput(attrs={'class': 'form-control'}),
            'date': forms.DateInput(attrs={
                'class': 'form-control',
                'type': 'date',
                'min': now().date().isoformat()
            }),
            'time': forms.TimeInput(attrs={
                'class': 'form-control',
                'type': 'time',
                'step': '900',
                'min': '06:00',
                'max': '04:00'
            }),
            'guests': forms.NumberInput(attrs={'class': 'form-control'}),
            'special_requests': forms.Select(attrs={'class': 'form-control'}),
            'allergies': forms.Textarea(attrs={'class': 'form-control', 'rows': 2}),
            'comments': forms.Textarea(attrs={'class': 'form-control', 'rows': 2}),
        }

    def clean_time(self):
        selected_time = self.cleaned_data['time']
        valid_times = dict(generate_time_choices())

        if selected_time not in valid_times:
            raise forms.ValidationError(_("Invalid reservation time selected."))

        return selected_time


class VenueApplicationForm(forms.ModelForm):
    class Meta:
        model = VenueApplication
        fields = [
            'venue_name', 'venue_type', 'location', 'description',
            'capacity', 'admin_name', 'admin_email', 'phone'
        ]
        labels = {
            'venue_name': _("Venue name"),
            'venue_type': _("Venue type"),
            'location': _("Location"),
            'description': _("Description"),
            'capacity': _("Capacity"),
            'admin_name': _("Admin name"),
            'admin_email': _("Admin email"),
            'phone': _("Phone"),
        }


class VenueSignupForm(forms.ModelForm):
    class Meta:
        model = Venue
        exclude = ['owner']
        labels = {
            'name': _("Venue name"),
            'location': _("Location"),
            'capacity': _("Capacity"),
        }


class ArrivalStatusForm(forms.ModelForm):

    move_to_requests = forms.BooleanField(
        required=False,
        label=_("Move back to Reservation Requests"),
        help_text=_("Check this if you want to move this booking back to the Reservation Requests table."),
    )

    class Meta:
        model = Reservation
        fields = ['arrival_status']
        widgets = {
            'arrival_status': forms.Select(attrs={'class': 'form-control'}),
        }
        labels = {
            'arrival_status': _("Arrival status"),
        }
