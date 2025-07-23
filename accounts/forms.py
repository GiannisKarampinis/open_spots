from django import forms
from django.contrib.auth.forms import UserCreationForm 
from .models import CustomUser
import re


#   This form extends Django's built-in UserCreationForm to support the CustomUser model.
#   It is used during user registration to collect necessary fields:
#   username, email, user type, and password (with confirmation).
#   By linking to CustomUser, it allows saving extra user info (e.g., user_type) during sign-up.
#   Django automatically handles password validation and user creation through this form.


class CustomUserCreationForm(UserCreationForm): 
    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'phone_number', 'password1', 'password2')
        
    def save(self, commit=True):
            user = super().save(commit=False)
            user.user_type = 'customer'
            if commit:
                user.save()
            return user

class ProfileEditForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        fields = ['email', 'phone_number']  # <- match model field name exactly
        widgets = {
            'email': forms.EmailInput(attrs={'required': True}),
            'phone_number': forms.TextInput(attrs={'required': False}),
        }

    def clean_phone_number(self):
        phone = self.cleaned_data.get('phone_number')
        if phone:
            phone = phone.replace(" ", "").replace("-", "")
            if not re.match(r'^\+?\d{7,15}$', phone):
                raise forms.ValidationError("Enter a valid phone number (7–15 digits, optional +).")
        return phone