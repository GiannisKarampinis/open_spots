from datetime import datetime

import json

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from drf_spectacular.utils import extend_schema

from emails_manager.models import VenueEmailVerificationCode
from venues.models import (
    Review,
    Reservation,
    Venue,
    VenueApplication,
    VenueImage,
    VenueMenuImage,
    VenueUpdateRequest,
    WorkingDay,
)
from venues.services.emails import (
    send_new_venue_application_email,
    send_venue_verification_code,
    send_reservation_notification,
)
from venues.services.working_days import ensure_working_days
from venues.utils import user_can_manage_venue

from .dashboard_helpers import (
    DASHBOARD_GROUPINGS,
    _analytics_payload,
    _dashboard_reservation_counts,
    _dashboard_reservations_queryset,
    _dashboard_venue_payload,
    _filter_dashboard_reservations,
    _paginated_reservation_payload,
    _reservation_payload,
    _working_day_payload,
)
from .serializers import (
    ReservationSerializer,
    UpcomingReservationSerializer,
    VenueApplicationSerializer,
    VenueEmailSerializer,
    VenueSerializer,
    VenueUpdateRequestSerializer,
    VenueVerificationCodeSerializer,
    ReviewSerializer,
)


SEND_COOLDOWN_SECONDS = 45


def _reservation_payload(reservation):
    return {
        "id": reservation.id,
        "customer_name": reservation.full_name,
        "venue_id": reservation.venue_id,
        "venue_name": reservation.venue.name if reservation.venue_id else "",
        "venue_location": reservation.venue.location if reservation.venue_id else "",
        "is_upcoming": reservation.is_upcoming(),
        "firstname": reservation.firstname,
        "lastname": reservation.lastname,
        "email": reservation.email,
        "phone": reservation.phone,
        "date": reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time": reservation.time.strftime("%H:%M") if reservation.time else None,
        "guests": getattr(reservation, "guests", None),
        "seen": bool(reservation.seen),
        "status": reservation.status,
        "arrival_status": reservation.arrival_status,
        "special_requests": reservation.special_requests,
        "allergies": reservation.allergies,
        "comments": reservation.comments,
        "updated_at": timezone.now().isoformat(),
    }


def _working_day_payload(day):
    return {
        "id": day.id,
        "weekday": day.weekday,
        "weekday_display": day.get_weekday_display(),
        "is_closed": day.is_closed,
        "open_time": day.open_time.strftime("%H:%M") if day.open_time else "",
        "close_time": day.close_time.strftime("%H:%M") if day.close_time else "",
        "closes_next_day": day.closes_next_day,
    }


def _reorder_images(venue, request, model_cls):
    if request.method != "POST":
        raise drf_serializers.ValidationError("Invalid request method")

    sequence = request.data.get("sequence")
    if not isinstance(sequence, list):
        raise drf_serializers.ValidationError({"sequence": "A list of image IDs is required."})

    if len(sequence) > 500:
        raise drf_serializers.ValidationError({"sequence": "Too many IDs in the sequence."})

    normalized = []
    seen = set()
    for item in sequence:
        try:
            image_id = int(item)
        except (TypeError, ValueError):
            continue
        if image_id not in seen:
            seen.add(image_id)
            normalized.append(image_id)

    if not normalized:
        return Response({"detail": "No valid image IDs provided."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        images = model_cls.objects.select_for_update().filter(
            id__in=normalized,
            venue=venue,
            approved=True,
            marked_for_deletion=False,
        )
        images_by_id = {img.id: img for img in images}
        to_update = []
        updated_ids = []

        for index, image_id in enumerate(normalized):
            image = images_by_id.get(image_id)
            if not image:
                continue
            image.order = index
            to_update.append(image)
            updated_ids.append(image_id)

        if to_update:
            model_cls.objects.bulk_update(to_update, ["order"])

    return Response({"detail": "Image order updated.", "updated_order": updated_ids})


def _parse_image_order_payload(request, order_field, visible_field):
    raw_order = request.data.get(order_field)
    if raw_order is not None:
        if isinstance(raw_order, str):
            try:
                raw_order = json.loads(raw_order)
            except json.JSONDecodeError as exc:
                raise drf_serializers.ValidationError({order_field: "Invalid JSON image order."}) from exc
        if not isinstance(raw_order, list):
            raise drf_serializers.ValidationError({order_field: "Expected a list of image order items."})

        normalized = []
        for index, item in enumerate(raw_order):
            if not isinstance(item, dict):
                raise drf_serializers.ValidationError({order_field: f"Item {index} must be an object."})

            kind = item.get("kind")
            if kind == "existing":
                image_id = item.get("id")
                try:
                    image_id = int(image_id)
                except (TypeError, ValueError) as exc:
                    raise drf_serializers.ValidationError({order_field: f"Item {index} has an invalid image id."}) from exc
                normalized.append({"kind": "existing", "id": image_id})
                continue

            if kind == "new":
                upload_key = item.get("upload_key")
                if not isinstance(upload_key, str) or not upload_key.startswith("new-"):
                    raise drf_serializers.ValidationError({order_field: f"Item {index} has an invalid upload key."})
                normalized.append({"kind": "new", "upload_key": upload_key})
                continue

            raise drf_serializers.ValidationError({order_field: f"Item {index} has an invalid kind."})

        return normalized

    visible_ids = request.data.get(visible_field)
    if visible_ids is None:
        visible_ids = request.data.get(f"{visible_field}[]")
    if visible_ids is None:
        return None

    normalized = []
    for token in [item for item in str(visible_ids).split(",") if item]:
        if token.startswith("new-"):
            normalized.append({"kind": "new", "upload_key": token})
            continue
        try:
            normalized.append({"kind": "existing", "id": int(token)})
        except (TypeError, ValueError) as exc:
            raise drf_serializers.ValidationError({visible_field: f"Invalid image id '{token}'."}) from exc
    return normalized


def _parse_deleted_image_ids(request, deleted_field):
    raw_deleted = request.data.get(deleted_field)
    if raw_deleted is None:
        return []

    if isinstance(raw_deleted, str):
        raw_deleted = raw_deleted.strip()
        if not raw_deleted:
            return []
        try:
            raw_deleted = json.loads(raw_deleted)
        except json.JSONDecodeError as exc:
            raise drf_serializers.ValidationError({deleted_field: "Invalid JSON deleted image id list."}) from exc

    if not isinstance(raw_deleted, list):
        raise drf_serializers.ValidationError({deleted_field: "Expected a list of image ids."})

    deleted_ids = []
    seen = set()
    for item in raw_deleted:
        try:
            image_id = int(item)
        except (TypeError, ValueError) as exc:
            raise drf_serializers.ValidationError({deleted_field: "Deleted image ids must be integers."}) from exc
        if image_id not in seen:
            seen.add(image_id)
            deleted_ids.append(image_id)
    return deleted_ids


def _handle_dashboard_image_group(
    venue,
    request,
    model_cls,
    files_field,
    visible_field,
    *,
    auto_approve,
    order_field=None,
    deleted_field=None,
):
    visible_ids = request.data.get(visible_field)
    if visible_ids is None:
        visible_ids = request.data.get(f"{visible_field}[]")
    files = request.FILES.getlist(files_field)
    file_map = {f"new-{index}": file for index, file in enumerate(files)}
    image_order = _parse_image_order_payload(request, order_field or f"{files_field}_order", visible_field)
    deleted_ids = _parse_deleted_image_ids(request, deleted_field or f"deleted_{files_field}_ids")

    if image_order is None:
        next_order = model_cls.objects.filter(
            venue=venue,
            approved=True,
            marked_for_deletion=False,
        ).count()
        for index, file in enumerate(files):
            model_cls.objects.create(
                venue=venue,
                image=file,
                approved=auto_approve,
                marked_for_deletion=False,
                order=next_order + index,
            )
        return list(
            model_cls.objects.filter(
                venue=venue,
                approved=True,
                marked_for_deletion=False,
            ).values_list("id", flat=True)
        )

    ordered_existing_ids = [item["id"] for item in image_order if item["kind"] == "existing"]
    duplicate_existing_ids = {
        image_id for image_id in ordered_existing_ids if ordered_existing_ids.count(image_id) > 1
    }
    if duplicate_existing_ids:
        raise drf_serializers.ValidationError({order_field or visible_field: "Image order contains duplicate existing image ids."})

    existing_ids = set(ordered_existing_ids)
    deleted_id_set = set(deleted_ids)
    overlap = existing_ids & deleted_id_set
    if overlap:
        raise drf_serializers.ValidationError({
            deleted_field or f"deleted_{files_field}_ids": "Deleted image ids cannot also appear in the image order."
        })

    all_referenced_ids = existing_ids | deleted_id_set
    if all_referenced_ids:
        found_ids = set(model_cls.objects.filter(venue=venue, id__in=all_referenced_ids).values_list("id", flat=True))
        missing_ids = all_referenced_ids - found_ids
        if missing_ids:
            raise drf_serializers.ValidationError({
                order_field or visible_field: f"Unknown image ids for this venue: {sorted(missing_ids)}."
            })

    updated_ids = []

    for order_index, item in enumerate(image_order):
        if item["kind"] == "new":
            file = file_map.get(item["upload_key"])
            if not file:
                raise drf_serializers.ValidationError({
                    order_field or visible_field: f"Missing uploaded file for {item['upload_key']}."
                })
            image = model_cls.objects.create(
                venue=venue,
                image=file,
                approved=auto_approve,
                marked_for_deletion=False,
                order=order_index,
            )
            updated_ids.append(image.id)
            continue

        image = model_cls.objects.get(pk=item["id"], venue=venue)

        image.order = order_index
        image.marked_for_deletion = False
        if auto_approve:
            image.approved = True
        image.save(update_fields=["order", "marked_for_deletion"] + (["approved"] if auto_approve else []))
        updated_ids.append(image.id)

    if deleted_ids:
        deleted_images = model_cls.objects.filter(venue=venue, id__in=deleted_ids)
        if auto_approve:
            deleted_images.delete()
        else:
            deleted_images.update(marked_for_deletion=True)

    return updated_ids


class VenueApplicationCreateAPIView(generics.CreateAPIView):
    serializer_class = VenueApplicationSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        admin_email = serializer.validated_data["admin_email"].strip().lower()
        if not self.request.session.get("venue_email_verified"):
            raise drf_serializers.ValidationError({"admin_email": "Email verification is required before submitting the application."})

        pending_email = self.request.session.get("venue_verified_email")
        if not pending_email or pending_email.lower() != admin_email:
            raise drf_serializers.ValidationError({"admin_email": "The verified email must match the application email."})

        application = serializer.save()
        transaction.on_commit(lambda: send_new_venue_application_email(application))

        self.request.session.pop("venue_email_verified", None)
        self.request.session.pop("venue_verified_email", None)
        self.request.session.pop("venue_pending_email", None)

    def post(self, request, *args, **kwargs):
        return self.create(request, *args, **kwargs)


class VenueVerificationSendAPIView(generics.GenericAPIView):
    serializer_class = VenueEmailSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].strip().lower()
        last_sent_ts = request.session.get("venue_code_last_sent_at")
        now_ts = timezone.now().timestamp()
        if last_sent_ts and (now_ts - float(last_sent_ts) < SEND_COOLDOWN_SECONDS):
            return Response({"detail": "Please wait before requesting another code."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        request.session["venue_email_verified"] = False
        request.session["venue_pending_email"] = email
        request.session.pop("venue_verified_email", None)

        code_obj = VenueEmailVerificationCode.create_for_email(email)
        try:
            send_venue_verification_code(email, code_obj.code)
        except Exception:
            VenueEmailVerificationCode.objects.filter(id=code_obj.id).delete()
            return Response({"detail": "Could not send the verification code."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        request.session["venue_code_last_sent_at"] = str(now_ts)
        return Response({"detail": "Code sent."})


class VenueVerificationConfirmAPIView(generics.GenericAPIView):
    serializer_class = VenueVerificationCodeSerializer
    permission_classes = [permissions.AllowAny]


    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = request.session.get("venue_pending_email")
        if not email:
            return Response({"detail": "No email pending verification."}, status=status.HTTP_400_BAD_REQUEST)

        locked_until = request.session.get("venue_code_locked_until")
        now_ts = timezone.now().timestamp()
        if locked_until and now_ts < float(locked_until):
            return Response({"detail": "Too many attempts. Try again later."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        code = serializer.validated_data["code"].strip()
        try:
            code_obj = VenueEmailVerificationCode.objects.get(email=email, code=code)
        except VenueEmailVerificationCode.DoesNotExist:
            attempts = int(request.session.get("venue_code_attempts", 0)) + 1
            request.session["venue_code_attempts"] = attempts
            if attempts >= 5:
                lock_until = timezone.now() + timezone.timedelta(minutes=10)
                request.session["venue_code_locked_until"] = str(lock_until.timestamp())
                return Response({"detail": "Too many attempts. Try again later."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
            return Response({"detail": "Invalid code."}, status=status.HTTP_400_BAD_REQUEST)

        if code_obj.is_expired():
            code_obj.delete()
            return Response({"detail": "Code expired. Please resend."}, status=status.HTTP_400_BAD_REQUEST)

        code_obj.delete()
        request.session["venue_email_verified"] = True
        request.session["venue_verified_email"] = email
        request.session.pop("venue_pending_email", None)
        request.session.pop("venue_code_attempts", None)
        request.session.pop("venue_code_locked_until", None)

        return Response({"detail": "Email verified."})

def _first_venue_image_url(venue, request):
    image = (
        VenueImage.objects
        .filter(
            venue=venue,
            approved=True,
            marked_for_deletion=False,
        )
        .order_by("order", "id")
        .first()
    )

    if not image or not image.image:
        return ""

    return request.build_absolute_uri(image.image.url)


def _upcoming_reservation_payload(request):
    user = request.user

    if not user.is_authenticated:
        return None

    reservation = (
        Reservation.objects
        .filter(
            user=user,
            date__gte=timezone.localdate(),
        )
        .exclude(status__in=["cancelled", "rejected"])
        .select_related("venue")
        .order_by("date", "time")
        .first()
    )

    if not reservation:
        return None

    venue = reservation.venue

    return {
        "id": reservation.id,
        "date": reservation.date.strftime("%Y-%m-%d") if reservation.date else None,
        "time": reservation.time.strftime("%H:%M") if reservation.time else None,
        "table_number": getattr(reservation, "table_number", None),
        "venue": {
            "id": venue.id,
            "name": venue.name,
            "location": venue.location,
            "first_image_url": _first_venue_image_url(venue, request),
        },
    }

class VenueViewSet(viewsets.ReadOnlyModelViewSet):
    queryset            = Venue.objects.all().order_by("name")
    serializer_class    = VenueSerializer
    permission_classes  = [permissions.AllowAny]

    def list(self, request, *args, **kwargs):
        venues = self.get_queryset()

        kind = request.GET.get("kind")
        availability = request.GET.get("availability")

        if kind:
            if kind == "cafe":
                venues = venues.filter(kind__in=["cafe", "bar"])
            else:
                venues = venues.filter(kind=kind)

        if availability == "available":
            venues = venues.filter(is_full=False)
        elif availability == "full":
            venues = venues.filter(is_full=True)

        data = VenueSerializer(venues, many=True, context={"request": request}).data

        grouped = {
            "cafe_bar": [v for v in data if v["kind"] in ["cafe", "bar"]],
            "restaurants": [v for v in data if v["kind"] == "restaurant"],
            "beach_bar": [v for v in data if v["kind"] == "beach_bar"],
            "other": [v for v in data if v["kind"] not in ["cafe", "bar", "restaurant", "beach_bar"]],
        }

        return Response({
            "count": len(data),
            "results": grouped,
            "upcoming_reservation": _upcoming_reservation_payload(request),
        })

    @action(detail=False, methods=["get"], url_path="owned", permission_classes=[permissions.IsAuthenticated])
    def owned(self, request):
        venue = Venue.objects.filter(owner=request.user).order_by("name").first()
        if not venue:
            return Response({"detail": "No owned venue found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(venue, context={"request": request})
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        venue = self.get_object()
        serializer = self.get_serializer(venue, context={"request": request})
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="dashboard", permission_classes=[permissions.IsAuthenticated])
    def dashboard(self, request, pk=None):
        venue = self.get_object()
        
        if not user_can_manage_venue(request.user, venue):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        ensure_working_days(venue)

        grouping = request.GET.get("group", "daily")
        if grouping not in DASHBOARD_GROUPINGS:
            return Response(
                {"detail": "Invalid analytics grouping."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "venue": _dashboard_venue_payload(venue, request),
                "working_days": [_working_day_payload(day) for day in venue.working_days.order_by("weekday")],
                "analytics": _analytics_payload(venue, grouping),
                "reservation_counts": _dashboard_reservation_counts(venue),
            }
        )

    @action(detail=True, methods=["get"], url_path="dashboard-counts", permission_classes=[permissions.IsAuthenticated])
    def dashboard_counts(self, request, pk=None):
        venue = self.get_object()

        if not user_can_manage_venue(request.user, venue):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        return Response(_dashboard_reservation_counts(venue))

    # OK - REVIEWED
    @action(detail=True, methods=["get"], url_path="dashboard-reservations", permission_classes=[permissions.IsAuthenticated])
    def dashboard_reservations(self, request, pk=None):
        
        venue = self.get_object()
        
        if not user_can_manage_venue(request.user, venue):

            # Frontend sends request with Authorization header and/or cookies
            #         ↓
            # Django/DRF receives request
            #         ↓
            # authentication middleware/classes check token/session
            #         ↓
            # if valid, they attach the user to request.user
            #         ↓
            # your view can use request.user (user is placed AUTOMATICALLY by Django/DRF)
            
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        bucket = request.GET.get("bucket", "requests") # If bucket does not exist, default to "requests"

        if bucket not in {"requests", "arrivals", "history"}:
            return Response({"detail": "Invalid reservation bucket."}, status=status.HTTP_400_BAD_REQUEST)

        queryset = _dashboard_reservations_queryset(venue,  bucket)
        queryset = _filter_dashboard_reservations(queryset, request)
        
        return Response(_paginated_reservation_payload(queryset, request))


    # OK - REVIEWED
    @action(detail=True, methods=["post"], url_path="toggle-full", permission_classes=[permissions.IsAuthenticated])
    def toggle_full(self, request, pk=None):
        venue = self.get_object()

        if not user_can_manage_venue(request.user, venue):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            venue = Venue.objects.select_for_update().get(id=venue.id)  # Locks the venue row while toggling, so two fast 
                                                                        # requests cannot both read the same old value and 
                                                                        # write the same new value incorrectly.
            venue.is_full = not venue.is_full
            venue.save(update_fields=["is_full"])

        return Response({"id": venue.id, "is_full": venue.is_full})


    @action(detail=True, methods=["get", "post"], url_path="working-hours", permission_classes=[permissions.IsAuthenticated])
    def working_hours(self, request, pk=None):
        venue = self.get_object()
        if not user_can_manage_venue(request.user, venue):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        ensure_working_days(venue)
        working_days = venue.working_days.order_by("weekday")

        if request.method == "GET":
            return Response({"working_days": [_working_day_payload(day) for day in working_days]})

        payload = request.data.get("working_days")
        if not isinstance(payload, list):
            return Response({"detail": "working_days must be a list."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            days_by_weekday = {day.weekday: day for day in working_days.select_for_update()}
            for item in payload:
                if not isinstance(item, dict):
                    continue

                weekday = item.get("weekday")
                if weekday not in days_by_weekday:
                    continue

                day = days_by_weekday[weekday]
                if item.get("is_closed"):
                    day.is_closed = True
                    day.open_time = None
                    day.close_time = None
                    day.closes_next_day = False
                else:
                    open_time = item.get("open_time")
                    close_time = item.get("close_time")
                    if not open_time or not close_time:
                        return Response(
                            {"detail": "Open and close times are required for open days."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    try:
                        day.open_time = datetime.strptime(open_time, "%H:%M").time()
                        day.close_time = datetime.strptime(close_time, "%H:%M").time()
                    except ValueError:
                        return Response(
                            {"detail": "Working hours must use HH:MM format."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    day.is_closed = False
                    day.closes_next_day = bool(item.get("closes_next_day"))

                day.save(update_fields=["is_closed", "open_time", "close_time", "closes_next_day"])

        return Response({"working_days": [_working_day_payload(day) for day in venue.working_days.order_by("weekday")]})

 
    @action(detail=True, methods=["post"], url_path="submit-update", permission_classes=[permissions.IsAuthenticated])
    def submit_update(self, request, pk=None):
        venue = self.get_object()
        if not user_can_manage_venue(request.user, venue):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        update_data = {
            "name": request.data.get("name", venue.name),
            "kind": request.data.get("kind", venue.kind),
            "location": request.data.get("location", venue.location),
            "email": request.data.get("email", venue.email),
            "phone": request.data.get("phone", venue.phone),
            "description": request.data.get("description", venue.description),
        }
        serializer = VenueUpdateRequestSerializer(data=update_data)
        serializer.is_valid(raise_exception=True)
        update_data = serializer.validated_data

        require_approval = getattr(settings, "VENUE_UPDATES_REQUIRE_APPROVAL", True)
        with transaction.atomic():
            if require_approval:
                VenueUpdateRequest.objects.create(
                    venue=venue,
                    submitted_by=request.user,
                    name=update_data.get("name", venue.name),
                    kind=update_data.get("kind", venue.kind),
                    location=update_data.get("location", venue.location),
                    email=update_data.get("email", venue.email),
                    phone=update_data.get("phone", venue.phone),
                    description=update_data.get("description", venue.description),
                )
            else:
                for field, value in update_data.items():
                    setattr(venue, field, value)
                venue.save(update_fields=list(update_data.keys()))

            _handle_dashboard_image_group(
                venue,
                request,
                VenueImage,
                "venue_images",
                "visible_venue_image_ids",
                auto_approve=not require_approval,
                order_field="venue_image_order",
                deleted_field="deleted_venue_image_ids",
            )
            _handle_dashboard_image_group(
                venue,
                request,
                VenueMenuImage,
                "menu_images",
                "visible_menu_image_ids",
                auto_approve=not require_approval,
                order_field="menu_image_order",
                deleted_field="deleted_menu_image_ids",
            )

        detail = "Venue update request submitted." if require_approval else "Venue updated successfully."
        return Response(
            {"detail": detail, "venue": _dashboard_venue_payload(venue, request)},
            status=status.HTTP_201_CREATED if require_approval else status.HTTP_200_OK,
        )


    @action(detail=True, methods=["get"], url_path="slots")
    def slots(self, request, pk=None):
        venue = self.get_object()
        date_string = request.GET.get("date")
        if not date_string:
            return Response({"error": "Missing date"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            selected_date = datetime.strptime(date_string, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format"}, status=status.HTTP_400_BAD_REQUEST)

        slots = venue.get_available_time_slots(selected_date)
        payload = [
            {
                "time": slot["time"].strftime("%H:%M"),
                "slot_date": slot["slot_date"].isoformat(),
                "is_next_day": slot["is_next_day"],
                "offset": slot["offset"],
                "is_blocked": slot["is_blocked"],
                "is_reserved": slot["is_reserved"],
                "is_available": slot["is_available"],
            }
            for slot in slots
        ]
        return Response({"business_date": selected_date.isoformat(), "slots": payload})


    @action(detail=True, methods=["post"], url_path="reviews", permission_classes=[permissions.IsAuthenticated])
    def create_review(self, request, pk=None):
        venue = self.get_object()
        serializer = ReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review, created = Review.objects.update_or_create(
            venue=venue,
            user=request.user,
            defaults={
                "rating": serializer.validated_data["rating"],
                "comment": serializer.validated_data.get("comment", ""),
            },
        )
        return Response(
            ReviewSerializer(review).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ReservationViewSet(viewsets.ModelViewSet):
    serializer_class    = ReservationSerializer
    permission_classes  = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser or getattr(user, "user_type", None) == "venue_admin":
            return Reservation.objects.filter(Q(user=user) | Q(venue__owner=user)).order_by("-created_at")
        return Reservation.objects.filter(user=user).order_by("-created_at")

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        venue = serializer.validated_data["venue"]
        reservation_date = serializer.validated_data["date"]
        reservation_time = serializer.validated_data["time"]
        if venue.has_overlapping_reservation(reservation_date, reservation_time, user=self.request.user):
            raise drf_serializers.ValidationError({"time": "Sorry, that time slot is already reserved."})
        reservation = serializer.save(user=self.request.user)
        transaction.on_commit(lambda: send_reservation_notification(reservation))

    def partial_update(self, request, *args, **kwargs):
        reservation = self.get_object()
        if reservation.status == "cancelled":
            return Response({"detail": "Cancelled reservations cannot be edited."}, status=status.HTTP_400_BAD_REQUEST)
        if reservation.user != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = self.get_serializer(reservation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        venue = serializer.validated_data.get("venue", reservation.venue)
        reservation_date = serializer.validated_data.get("date", reservation.date)
        reservation_time = serializer.validated_data.get("time", reservation.time)
        overlapping = venue.reservations.exclude(pk=reservation.pk).filter(date=reservation_date, time=reservation_time).exists()
        if overlapping:
            return Response({"time": "Sorry, that time slot is already reserved."}, status=status.HTTP_400_BAD_REQUEST)
        updated = serializer.save(status="pending", arrival_status="pending")
        updated.save(editor=request.user)
        return Response(self.get_serializer(updated).data)

    # OK - REVIEWED
    @action(detail=True, methods=["post"], url_path="status")
    def update_status(self, request, pk=None):
        reservation = self.get_object()
        
        if reservation.venue.owner != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        status_value = (request.data.get("status") or "").lower()
        
        if status_value not in ["accepted", "rejected"]:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        
        if reservation.status != "pending":
            return Response({"detail": "Only pending reservations can be updated."}, status=status.HTTP_400_BAD_REQUEST)

        reservation.status = status_value
        reservation.save(editor=request.user, update_fields=["status"])
        
        return Response(_reservation_payload(reservation))

    # OK - REVIEWED
    @action(detail=True, methods=["post"], url_path="arrival")
    def update_arrival(self, request, pk=None):
        reservation = self.get_object()
        
        if reservation.venue.owner != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        arrival_status = (request.data.get("arrival_status") or "").lower()
        
        if arrival_status not in ["checked_in", "no_show"]:
            return Response({"detail": "Invalid arrival status."}, status=status.HTTP_400_BAD_REQUEST)
        
        if reservation.status != "accepted":
            return Response({"detail": "Arrival status can only be updated for accepted reservations."}, status=status.HTTP_400_BAD_REQUEST)

        reservation.arrival_status = arrival_status
        reservation.save(editor=request.user, update_fields=["arrival_status"])
        
        return Response(_reservation_payload(reservation))

    # OK - REVIEWED
    @action(detail=True, methods=["post"], url_path="move-to-requests")
    def move_to_requests(self, request, pk=None):
        reservation = self.get_object()
        
        if reservation.venue.owner != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        
        if reservation.status != "pending" or reservation.arrival_status != "pending":
            reservation.status          = "pending"
            reservation.arrival_status  = "pending"
            
            reservation.save(editor=request.user, update_fields=["status", "arrival_status"])
            
        return Response({"reservation": _reservation_payload(reservation)})

    # OK - REVIEWED
    @action(detail=True, methods=["post"], url_path="seen")
    def update_seen(self, request, pk=None):
        reservation = self.get_object()
        
        if reservation.venue.owner != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        
        requested_string_state = request.data.get("state")

        if requested_string_state not in ["seen", "unseen"]:
            return Response({"detail": "Provide state=seen or state=unseen."}, status=status.HTTP_400_BAD_REQUEST)

        target_boolean_state = requested_string_state == "seen"
        
        if reservation.seen != target_boolean_state:
            reservation.seen = target_boolean_state
            reservation.save(update_fields=["seen"])

        return Response({"reservation": _reservation_payload(reservation)})


    @action(detail=True, methods=["get"], url_path="details")
    def reservation_details(self, request, pk=None):
        
        reservation = self.get_object()
        
        if reservation.venue.owner == request.user and not reservation.seen:
            reservation.seen = True
            reservation.save(update_fields=["seen", "special_requests"])
        
        return Response(_reservation_payload(reservation))

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        
        if reservation.user != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        
        if reservation.status == "cancelled":
            return Response({"detail": "Reservation already cancelled."})
        
        reservation.status = "cancelled"
        reservation.save(editor=request.user, update_fields=["status"])
        
        return Response(_reservation_payload(reservation))


def group_venues(venues):
    return {
        "cafe_bar": [v for v in venues if v.kind in ["cafe", "bar"]],
        "restaurants": [v for v in venues if v.kind == "restaurant"],
        "beach_bar": [v for v in venues if v.kind == "beach_bar"],
        "other": [v for v in venues if v.kind == "other"],
    }

class VenueListAPI(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        kind = request.GET.get("kind")
        availability = request.GET.get("availability")

        venues = Venue.objects.all().order_by("name")

        # kind filter
        if kind:
            if kind == "cafe":
                venues = venues.filter(kind__in=["cafe", "bar"])
            else:
                venues = venues.filter(kind=kind)

        # availability filter
        if availability == "available":
            venues = venues.filter(is_full=False)
        elif availability == "full":
            venues = venues.filter(is_full=True)

        # pagination
        paginator = PageNumberPagination()
        paginator.page_size = 12

        result_page = paginator.paginate_queryset(venues, request)

        serializer = VenueSerializer(result_page, many=True)

        grouped = group_venues(serializer.data)

        return Response({
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "results": grouped,
            "upcoming_reservation": _upcoming_reservation_payload(request),
        })
