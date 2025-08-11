from django import forms
from .models import Reservation, VenueApplication, Venue
from .utils import generate_time_choices
from django.utils.timezone import now
import datetime


class ReservationForm(forms.ModelForm):
    # Meta class defines metadata for the form
    class Meta:
        model = Reservation  # The form is based on the Reservation model
        fields = ['name', 'email', 'phone', 'date', 'time', 'guests']  # Fields to include in the form

        # Customize the input widgets for specific fields
        widgets = {
            'date': forms.DateInput(
                attrs={
                    'type': 'date',  # HTML5 input type for date picker
                    'min': now().date().isoformat()  # Restrict date to today or later
                }
            ),
            'time': forms.TimeInput(
                attrs={
                    'type': 'time',     # HTML5 input type for time picker
                    'step': '900',      # 15-minute intervals (900 seconds)
                    'min': '06:00',     # Earliest selectable time
                    'max': '04:00'      # Latest selectable time (note: this may need clarification for post-midnight logic)
                }
            ),
        }

    # Override the 'time' field to use a dropdown select input with predefined time choices
    time = forms.ChoiceField(
        choices=generate_time_choices(),     # Generates a list of time choices (e.g., every 15 minutes)
        widget=forms.Select()                # Use a select dropdown widget
    )

    # Custom validator for the 'time' field
    def clean_time(self):
        selected_time = self.cleaned_data['time']  # Retrieve user-submitted time
        valid_times = dict(generate_time_choices())  # Convert time choices into a dict for quick lookup

        # Check if the selected time is one of the allowed options
        if selected_time not in valid_times:
            raise forms.ValidationError("Invalid reservation time selected.")

        return selected_time  # Return cleaned (validated) time


class VenueApplicationForm(forms.ModelForm):
    class Meta:
        model = VenueApplication
        fields = [
            'venue_name', 'venue_type', 'location', 'description',
            'capacity', 'admin_name', 'admin_email', 'phone'
        ]

class VenueSignupForm(forms.ModelForm):
    class Meta:
        model = Venue
        exclude = ['owner']


# class ReservationStatusForm(forms.ModelForm):
#     class Meta:
#         model = Reservation
#         fields = ['arrival_status']
#         widgets = {
#             'arrival_status': forms.Select(attrs={'class': 'form-select'})
#         }


class ArrivalStatusForm(forms.ModelForm):
    move_to_requests = forms.BooleanField(
        required=False,
        label="Move back to Reservation Requests",
        help_text="Check this if you want to move this booking back to the Reservation Requests table."
    )

    class Meta:
        model = Reservation
        fields = ['arrival_status']  # Only model fields go here
        widgets = {
            'arrival_status': forms.Select(attrs={'class': 'form-control'}),
        }
