from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from venues.models import Reservation, Review, Venue, VenueApplication

User = get_user_model()


class VenueImageSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    url = serializers.SerializerMethodField()
    order = serializers.IntegerField(read_only=True)

    def get_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "username", "rating", "comment", "created_at"]
        read_only_fields = ["id", "username", "created_at"]


class VenueSerializer(serializers.ModelSerializer):
    owner_id = serializers.IntegerField(read_only=True)
    first_image = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    menu_images = serializers.SerializerMethodField()
    reviews = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = [
            "id",
            "name",
            "kind",
            "location",
            "description",
            "average_rating",
            "is_full",
            "latitude",
            "longitude",
            "email",
            "phone",
            "owner_id",
            "first_image",
            "images",
            "menu_images",
            "reviews",
        ]
        read_only_fields = ["id", "average_rating", "owner_id"]

    def _approved_images(self, venue, related_name):
        return getattr(venue, related_name).filter(
            approved=True,
            marked_for_deletion=False,
        ).order_by("order")

    def get_first_image(self, venue):
        image = self._approved_images(venue, "images").first()
        if not image or not image.image:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(image.image.url)
        return image.image.url

    def get_images(self, venue):
        return VenueImageSerializer(
            self._approved_images(venue, "images"),
            many=True,
            context=self.context,
        ).data

    def get_menu_images(self, venue):
        return VenueImageSerializer(
            self._approved_images(venue, "menu_images"),
            many=True,
            context=self.context,
        ).data

    def get_reviews(self, venue):
        return ReviewSerializer(
            venue.reviews.select_related("user").order_by("-created_at"),
            many=True,
        ).data


class ReservationSerializer(serializers.ModelSerializer):
    venue_id = serializers.PrimaryKeyRelatedField(source="venue", queryset=Venue.objects.all())
    venue_name = serializers.CharField(source="venue.name", read_only=True)
    venue_location = serializers.CharField(source="venue.location", read_only=True)
    is_upcoming = serializers.SerializerMethodField()
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "user_id",
            "venue_id",
            "venue_name",
            "venue_location",
            "is_upcoming",
            "firstname",
            "lastname",
            "email",
            "phone",
            "date",
            "time",
            "guests",
            "special_requests",
            "comments",
            "allergies",
            "status",
            "arrival_status",
            "table",
            "seen",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user_id",
            "status",
            "arrival_status",
            "seen",
            "created_at",
            "updated_at",
        ]

    def get_is_upcoming(self, obj):
        return obj.is_upcoming()

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class VenueApplicationSerializer(serializers.ModelSerializer):
    admin_username = serializers.CharField()
    admin_email = serializers.EmailField()
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])

    class Meta:
        model = VenueApplication
        fields = [
            "venue_name",
            "venue_type",
            "location",
            "description",
            "phone",
            "admin_username",
            "admin_email",
            "admin_firstname",
            "admin_lastname",
            "admin_phone",
            "password",
        ]

    def validate_admin_username(self, value):
        username = value.strip()
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("This username is already taken.")
        return username

    def validate_admin_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate(self, attrs):
        required_fields = [
            "venue_name", "venue_type", "location", "phone",
            "admin_username", "admin_email", "admin_firstname", "admin_lastname", "admin_phone", "password",
        ]
        missing = {field: "This field is required." for field in required_fields if not str(attrs.get(field, "")).strip()}
        if missing:
            raise serializers.ValidationError(missing)
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        admin_email = validated_data.pop("admin_email")
        admin_username = validated_data.pop("admin_username")

        try:
            with transaction.atomic():
                user = User(
                    username=admin_username,
                    email=admin_email,
                    user_type="venue_admin",
                    email_verified=True,
                    unverified_email=None,
                    is_active=False,
                    firstname=validated_data.get("admin_firstname", ""),
                    lastname=validated_data.get("admin_lastname", ""),
                    phone_number=validated_data.get("admin_phone", ""),
                )
                user.set_password(password)
                user.save()

                return VenueApplication.objects.create(
                    owner_user=user,
                    admin_username=admin_username,
                    admin_email=admin_email,
                    status="pending",
                    **validated_data,
                )
        except IntegrityError:
            raise serializers.ValidationError({
                "non_field_errors": ["Something went wrong while creating your account. Please try again."],
            })


class VenueEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()


class VenueVerificationCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)


class VenueUpdateRequestSerializer(serializers.Serializer):
    name = serializers.CharField(required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=[choice[0] for choice in Venue.VENUE_TYPES], required=False)
    location = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("At least one field must be provided.")
        return attrs
