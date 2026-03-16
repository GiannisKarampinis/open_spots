import re
from django                     import forms
from django.contrib.auth.forms  import UserCreationForm
from django.utils.translation   import gettext_lazy as _
from .models                    import CustomUser
from django.contrib.auth        import password_validation
from django.utils.translation   import gettext_lazy as _
from django.core.exceptions     import ValidationError
import re


class CustomUserCreationForm(UserCreationForm):
    class Meta:
        model = CustomUser
        fields = ('firstname', 'lastname', 'username', 'email', 'phone_number', 'password1', 'password2')
        labels = {
            'firstname':    _("First name"),
            'lastname':     _("Last name"),
            'username':     _("Username"),
            'email':        _("Email"),
            'phone_number': _("Phone number"),
            'password1':    _("Password"),
            'password2':    _("Confirm password"),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        for name, field in self.fields.items():
            css_class = "form-input"
            if self.errors.get(name):
                css_class += " is-invalid"

            field.widget.attrs.update({
                "class": css_class,
                "aria-describedby": f"{name}-errors",
                "aria-invalid": "true" if self.errors.get(name) else "false",
            })

        self.fields["firstname"].error_messages = {
            "required": _("Please enter your first name."),
        }
        self.fields["lastname"].error_messages = {
            "required": _("Please enter your last name."),
        }
        self.fields["username"].error_messages = {
            "required": _("Please choose a username."),
        }
        self.fields["email"].error_messages = {
            "required": _("Please enter your email address."),
            "invalid": _("Enter a valid email address."),
        }
        self.fields["phone_number"].error_messages = {
            "required": _("Please enter your phone number."),
        }
        self.fields["password1"].error_messages = {
            "required": _("Please create a password."),
        }
        self.fields["password2"].error_messages = {
            "required": _("Please confirm your password."),
        }

    def clean_email(self):
        email = self.cleaned_data.get("email")

        if email and CustomUser.objects.filter(email__iexact=email).exists():
            raise ValidationError(_("An account with this email already exists."))

        return email

    def clean_username(self):
        username = self.cleaned_data.get("username")

        if username and CustomUser.objects.filter(username__iexact=username).exists():
            raise ValidationError(_("This username is already taken."))

        if username and len(username) < 4:
            raise ValidationError(_("Username must contain at least 4 characters."))

        return username

    def clean_phone_number(self):
        phone = self.cleaned_data.get("phone_number")

        if phone:
            phone = phone.strip()
            phone_regex = r'^\+?[0-9]{8,15}$'
            if not re.match(phone_regex, phone):
                raise ValidationError(_("Enter a valid phone number (8–15 digits, optional +)."))

        return phone

    def clean_password1(self):
        password = self.cleaned_data.get("password1")

        if password and len(password) < 8:
            raise ValidationError(_("Password must contain at least 8 characters."))

        return password

    def clean(self):
        cleaned_data = super().clean()

        password1 = cleaned_data.get("password1")
        password2 = cleaned_data.get("password2")

        if password1 and password2 and password1 != password2:
            self.add_error("password2", _("Passwords do not match."))

        return cleaned_data

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


class EmailEditForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        fields = ["email"]
        widgets = {"email": forms.EmailInput(attrs={"required": True})}

class PhoneEditForm(forms.ModelForm):
    class Meta:
        model = CustomUser
        fields = ["phone_number"]
        widgets = {"phone_number": forms.TextInput(attrs={"required": False})}

    def clean_phone_number(self):
        phone = self.cleaned_data.get("phone_number")
        if phone:
            phone = phone.replace(" ", "").replace("-", "")
            if not re.match(r"^\+?\d{7,15}$", phone):
                raise forms.ValidationError(_("Enter a valid phone number (7–15 digits, optional +)."))
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
