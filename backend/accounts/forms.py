from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.utils.translation import gettext_lazy as _
from .models import CustomUser


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
            'username':     _("Username"),
            'email':        _("Email"),
            'phone_number': _("Phone number"),
            'user_type':    _("User type"),
            'password1':    _("Password"),
            'password2':    _("Confirm password"),
        }

    def save(self, commit=True):
        user = super().save(commit=False)
        user.user_type = self.cleaned_data['user_type']
        if commit:
            user.save()
        return user
