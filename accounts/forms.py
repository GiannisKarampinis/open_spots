import re
from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.utils.translation import gettext_lazy as _
from .models import CustomUser
from django.contrib.auth import password_validation


class CustomUserCreationForm(UserCreationForm):
    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'phone_number', 'password1', 'password2')
        labels = {
            'username': _("Username"),
            'email': _("Email"),
            'phone_number': _("Phone number"),
            'password1': _("Password"),
            'password2': _("Confirm password"),
        }

    def save(self, commit=True):
        user = super().save(commit=False)
        user.user_type = 'customer'
        if commit:
            user.save()
        return user


class AdminUserCreationForm(UserCreationForm):
    """Admin form to create any type of user, with user_type selection."""

    user_type = forms.ChoiceField(
        choices=CustomUser.USER_TYPE_CHOICES,
        required=True,
        label=_("User type")
    )

    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'phone_number', 'user_type', 'password1', 'password2')
        labels = {
            'username': _("Username"),
            'email': _("Email"),
            'phone_number': _("Phone number"),
            'user_type': _("User type"),
            'password1': _("Password"),
            'password2': _("Confirm password"),
        }

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
        labels = {
            'email': _("Email"),
            'phone_number': _("Phone number"),
        }
        widgets = {
            'email': forms.EmailInput(attrs={'required': True}),
            'phone_number': forms.TextInput(attrs={'required': False}),
        }

    def clean_phone_number(self):
        phone = self.cleaned_data.get('phone_number')
        if phone:
            phone = phone.replace(" ", "").replace("-", "")
            if not re.match(r'^\+?\d{7,15}$', phone):
                raise forms.ValidationError(
                    _("Enter a valid phone number (7–15 digits, optional +).")
                )
        return phone


class PasswordResetRequestForm(forms.Form):
    email = forms.EmailField(
        label=_("Email"),
        required=True
    )


class PasswordResetForm(forms.Form):
    new_password1 = forms.CharField(
        label=_("New password"),
        strip=False,
        widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}),
    )
    new_password2 = forms.CharField(
        label=_("Confirm new password"),
        strip=False,
        widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}),
    )

    def clean(self):
        cleaned_data = super().clean()
        password1 = cleaned_data.get("new_password1")
        password2 = cleaned_data.get("new_password2")

        if password1 and password2 and password1 != password2:
            raise forms.ValidationError(_("Passwords do not match."))

        password_validation.validate_password(password1)
        return cleaned_data


class PasswordChangeRequestForm(forms.Form):
    old_password = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': _('Old password')}),
        label=_("Old password"),
    )
    new_password1 = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': _('New password')}),
        label=_("New password"),
    )
    new_password2 = forms.CharField(
        widget=forms.PasswordInput(attrs={'placeholder': _('Confirm new password')}),
        label=_("Confirm new password"),
    )

    def __init__(self, user, *args, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)

    def clean_old_password(self):
        old_password = self.cleaned_data['old_password']
        if not self.user.check_password(old_password):
            raise forms.ValidationError(_("Old password is incorrect."))
        return old_password

    def clean(self):
        cleaned_data = super().clean()
        p1 = cleaned_data.get("new_password1")
        p2 = cleaned_data.get("new_password2")

        if p1 and p2 and p1 != p2:
            raise forms.ValidationError(_("The new passwords do not match."))

        password_validation.validate_password(p1, self.user)
        return cleaned_data
