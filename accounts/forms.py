import re
from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import CustomUser


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

class AdminUserCreationForm(UserCreationForm):
    """Admin form to create any type of user, with user_type selection."""
    user_type = forms.ChoiceField(choices=CustomUser.USER_TYPE_CHOICES, required=True)

    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'phone_number', 'user_type', 'password1', 'password2')

    def save(self, commit=True):
        user = super().save(commit=False)
        user.user_type = self.cleaned_data['user_type']
        if commit:
            user.save()
        return user


class ProfileEditForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        fields = ['email', 'phone_number']
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
