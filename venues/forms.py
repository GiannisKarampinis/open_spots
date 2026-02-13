from django import forms
from .models import Reservation, VenueApplication, Venue
from .utils import generate_time_choices
from django.utils.timezone import now
from datetime import datetime
from django.utils.translation import gettext_lazy as _
from .models import Review



class ReservationForm(forms.ModelForm): # Our Reservation model sets some fields required (no blank=True for name, email, phone, date, time, guests, venue)
                                        # ReservationForm is a ModelForm and we include those fields in Meta fields, Django will set them as required=True.

    # FIXME: We want an argument for how dense will be the splitting and more for ending and starting time of the day(s) or globally
    time = forms.ChoiceField(choices=generate_time_choices(), widget=forms.Select(), label=_("Time"))

    class Meta:
        model = Reservation
        fields = [
            'name', 'email', 'phone', 'date', 'time',
            'guests', 'special_requests', 'allergies', 'comments'
        ]
        labels = {
            'name':             _("Name"),
            'email':            _("Email"),
            'phone':            _("Phone"),
            'date':             _("Date"),
            'guests':           _("Number of guests"),
            'special_requests': _("Special requests"),
            'allergies':        _("Allergies"),
            'comments':         _("Comments"),
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

        # Convert "23:00" → datetime.time(23, 0)
        if isinstance(selected_time, str):
            selected_time = datetime.strptime(selected_time, "%H:%M").time()

        valid_times = dict(generate_time_choices())
        if selected_time not in valid_times:
            raise forms.ValidationError(_("Invalid reservation time selected."))

        return selected_time


class VenueApplicationForm(forms.ModelForm):
    password1 = forms.CharField(
        label=_("Password"),
        widget=forms.PasswordInput,
        strip=False,
        required=True)
    
    password2 = forms.CharField(
        label=_("Confirm Password"),
        widget=forms.PasswordInput,
        strip=False,
        required=True)
    
    def clean(self):
        cleaned_data = super().clean()
        p1 = cleaned_data.get("password1")
        p2 = cleaned_data.get("password2")
        if p1 and p2 and p1 != p2:
            self.add_error("password2", _("Passwords do not match."))
        return cleaned_data
        
    class Meta:
        model = VenueApplication
        fields = [
            'venue_name', 'venue_type', 'location', 'phone',
            'admin_username', 'admin_email', 'admin_firstname', 'admin_lastname',
            'admin_phone' 
        ]
        labels = {
            'admin_username':   _("Admin Username"),
            'admin_email':      _("Admin email"),
            'admin_firstname':  _("Admin First Name"),
            'admin_lastname':   _("Admin Last Name"),
            'venue_name':       _("Venue name"),
            'venue_type':       _("Venue type"),
            'location':         _("Location"),
            'phone':            _("Venue phone"),
        }

    def __init__(self, *args, **kwargs):
        user = kwargs.pop('user', None)
        super().__init__(*args, **kwargs)
        
        required_fields = [
            'venue_name', 
            'venue_type', 
            'location', 
            'phone',
            'admin_username', 
            'admin_email',
            'admin_phone',
            'admin_firstname',
            'admin_lastname'
        ]

        for field_name in required_fields:
            self.fields[field_name].required = True
        
        #self.fields["description"].required = False # Explicitly mark description as optional for future clarity


class VenueSignupForm(forms.ModelForm):
    class Meta:
        model = Venue
        exclude = ['owner']
        labels = {
            'name': _("Venue name"),
            'location': _("Location"),
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

class ReviewForm(forms.ModelForm):
    class Meta:
        model = Review
        fields = ["rating", "comment"]
        widgets = {
            "rating": forms.NumberInput(attrs={"min": 1, "max": 5}),
            "comment": forms.Textarea(attrs={"rows": 3, "placeholder": "Share your experience..."}),
        }
