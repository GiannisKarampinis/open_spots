from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.validators import RegexValidator
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from accounts.models import DeviceSession

User = get_user_model()

phone_number_validator = RegexValidator(
    regex=r"^\+?\d{7,15}$",
    message="Please enter a valid phone number with 7 to 15 digits, optionally starting with +.",
)


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        request     = self.context.get("request")
        username    = attrs.get("username")
        password    = attrs.get("password")

        user = authenticate(request = request, username = username, password = password)
        if not user:
            matching_user = User.objects.filter(username=username).first()
            if not matching_user:
                raise serializers.ValidationError({"username": "This username does not exist. Please sign up first."})
            raise serializers.ValidationError({"password": "Incorrect password. Please try again."})

        attrs["user"] = user
        
        return attrs


class UserRegistrationSerializer(serializers.ModelSerializer):
    firstname = serializers.CharField(required=True, allow_blank=False)
    lastname = serializers.CharField(required=True, allow_blank=False)
    username = serializers.CharField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="This username is already taken.")]
    )
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="An account with this email already exists.")]
    )
    phone_number = serializers.CharField(required=True, allow_blank=False, validators=[phone_number_validator])
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ["username", "email", "phone_number", "firstname", "lastname", "password", "password2"]

    def validate(self, attrs):
        required_fields = ["firstname", "lastname", "username", "email", "phone_number", "password", "password2"]
        if any(not str(attrs.get(field, "")).strip() for field in required_fields):
            raise serializers.ValidationError({
                "non_field_errors": ["Please complete all required fields before creating your account."]
            })

        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError({"password2": "Password fields did not match."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("password2")
        password = validated_data.pop("password")

        user = User(**validated_data)
        user.user_type = "customer"
        user.email_verified = False
        user.unverified_email = user.email
        user.set_password(password)
        user.save()
        return user


class UserProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField(read_only=True)
    display_email = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "unverified_email",
            "display_email",
            "firstname",
            "lastname",
            "user_type",
            "phone_number",
            "email_verified",
            "full_name",
        ]
        read_only_fields = [
            "id",
            "user_type",
            "email",
            "unverified_email",
            "display_email",
            "email_verified",
            "full_name",
        ]

    def get_full_name(self, obj):
        return obj.full_name_or_username

    def get_display_email(self, obj):
        return obj.unverified_email or obj.email


class DeviceSessionSerializer(serializers.ModelSerializer):
    is_current = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = DeviceSession
        fields = [
            "id",
            "device_name",
            "ip_address",
            "first_seen_at",
            "last_seen_at",
            "last_refresh_at",
            "revoked_at",
            "is_active",
            "is_current",
        ]
        read_only_fields = fields

    def get_is_current(self, obj):
        return str(obj.id) == str(self.context.get("current_device_session_id") or "")


class TwoFactorCodeSerializer(serializers.Serializer):
    code = serializers.CharField(min_length=6, max_length=12, trim_whitespace=True)

    def validate_code(self, value):
        normalized = value.replace(" ", "")
        if not normalized.isdigit():
            raise serializers.ValidationError("Enter the numeric code from your authenticator app.")
        return normalized


class UserEmailUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        user = self.context["request"].user
        normalized = value.strip().lower()
        current_email = user.email.strip().lower() if user.email else ""

        if normalized == current_email:
            return normalized

        if User.objects.filter(email__iexact=normalized).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("An account with this email already exists.")

        return normalized

    def update(self, instance, validated_data):
        new_email = validated_data["email"].strip().lower()
        current_email = instance.email.strip().lower() if instance.email else ""

        if new_email != current_email:
            instance.unverified_email = new_email
            instance.email_verified = False
            instance.save(update_fields=["unverified_email", "email_verified"])
            instance.email_update_requested = True
        else:
            instance.email_update_requested = False

        return instance


class UserPasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password1 = serializers.CharField(write_only=True, validators=[validate_password])
    new_password2 = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password1"] != attrs["new_password2"]:
            raise serializers.ValidationError({"new_password2": "The new passwords do not match."})
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        original_email = user.email.strip().lower() if user.email else ""
        user.set_password(self.validated_data["new_password1"])
        user.email_verified = False
        user.unverified_email = original_email
        user.save(update_fields=["password", "email_verified", "unverified_email"])
        return user


class UserPasswordRecoverySerializer(serializers.Serializer):
    email = serializers.EmailField()


class UserPasswordResetSerializer(serializers.Serializer):
    new_password1 = serializers.CharField(write_only=True, validators=[validate_password])
    new_password2 = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password1"] != attrs["new_password2"]:
            raise serializers.ValidationError({"new_password2": "Passwords do not match."})
        return attrs

    def save(self, user):
        user.set_password(self.validated_data["new_password1"])
        user.email_verified = True
        user.unverified_email = ""
        user.save(update_fields=["password", "email_verified", "unverified_email"])
        return user


class VerificationCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)
