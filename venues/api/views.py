from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers as drf_serializers
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
)
from venues.services.working_days import ensure_working_days
from venues.utils import get_today, user_can_manage_venue

from .dashboard_helpers import (
    DASHBOARD_GROUPINGS,
    _analytics_payload,
    _dashboard_reservations_queryset,
    _dashboard_venue_payload,
    _filter_dashboard_reservations,
    _paginated_reservation_payload,
    _reservation_payload,
    _working_day_payload,
)
from .serializers import (
    ReservationSerializer,
    VenueApplicationSerializer,
    VenueEmailSerializer,
    VenueSerializer,
    VenueUpdateRequestSerializer,
    VenueVerificationCodeSerializer,
    ReviewSerializer,
)

SEND_COOLDOWN_SECONDS = 45


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


def _handle_dashboard_image_group(venue, request, model_cls, files_field, visible_field, *, auto_approve):
    visible_ids = request.data.get(visible_field)
    files = request.FILES.getlist(files_field)
    file_map = {f"new-{index}": file for index, file in enumerate(files)}

    if visible_ids is None:
        next_order = model_cls.objects.filter(venue=venue).count()
        for index, file in enumerate(files):
            model_cls.objects.create(
                venue=venue,
                image=file,
                approved=auto_approve,
                marked_for_deletion=False,
                order=next_order + index,
            )
        return []

    sequence = [item for item in str(visible_ids).split(",") if item]
    updated_ids = []

    for order_index, token in enumerate(sequence):
        if token.startswith("new-"):
            file = file_map.get(token)
            if file:
                image = model_cls.objects.create(
                    venue=venue,
                    image=file,
                    approved=auto_approve,
                    marked_for_deletion=False,
                    order=order_index,
                )
                updated_ids.append(image.id)
            continue

        try:
            image = model_cls.objects.get(pk=int(token), venue=venue)
        except (TypeError, ValueError, model_cls.DoesNotExist):
            continue

        image.order = order_index
        image.marked_for_deletion = False
        if auto_approve:
            image.approved = True
        image.save(update_fields=["order", "marked_for_deletion"] + (["approved"] if auto_approve else []))
        updated_ids.append(image.id)

    model_cls.objects.filter(venue=venue, approved=True).exclude(id__in=updated_ids).update(marked_for_deletion=True)
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

    @extend_schema(
        request=VenueApplicationSerializer,
        responses={201: VenueApplicationSerializer},
        summary="Submit a new venue application",
    )
    def post(self, request, *args, **kwargs):
        return self.create(request, *args, **kwargs)


class VenueVerificationSendAPIView(generics.GenericAPIView):
    serializer_class = VenueEmailSerializer
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        request=VenueEmailSerializer,
        responses={200: "Verification code sent."},
        summary="Send a verification code to a venue admin email",
    )
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

    @extend_schema(
        request=VenueVerificationCodeSerializer,
        responses={200: "Venue email verified."},
        summary="Confirm a venue verification code",
    )
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
            "results": grouped
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

        today = get_today()
        upcoming = venue.reservations.filter(date__gte=today, status="pending")

        return Response(
            {
                "venue": _dashboard_venue_payload(venue, request),
                "working_days": [_working_day_payload(day) for day in venue.working_days.order_by("weekday")],
                "analytics": _analytics_payload(venue, grouping),
                "reservation_counts": {
                    "unseen_requests": upcoming.filter(seen=False).count(),
                    "requests": upcoming.count(),
                    "arrivals": _dashboard_reservations_queryset(venue, "arrivals").count(),
                    "history": _dashboard_reservations_queryset(venue, "history").count(),
                },
            }
        )

    # OK - REVIEWD
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


    @action(detail=True, methods=["post"], url_path="toggle-full", permission_classes=[permissions.IsAuthenticated])
    def toggle_full(self, request, pk=None):
        venue = self.get_object()
        if not user_can_manage_venue(request.user, venue):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            venue = Venue.objects.select_for_update().get(id=venue.id)
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
            )
            _handle_dashboard_image_group(
                venue,
                request,
                VenueMenuImage,
                "menu_images",
                "visible_menu_image_ids",
                auto_approve=not require_approval,
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
    serializer_class = ReservationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser or getattr(user, "user_type", None) == "venue_admin":
            return Reservation.objects.filter(Q(user=user) | Q(venue__owner=user)).order_by("-created_at")
        return Reservation.objects.filter(user=user).order_by("-created_at")

    @extend_schema(
        summary="List authenticated user reservations or venue admin reservations",
        responses=ReservationSerializer,
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        summary="Create a new reservation",
        request=ReservationSerializer,
        responses=ReservationSerializer,
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="status")
    @extend_schema(
        request={"type": "object", "properties": {"status": {"type": "string"}}},
        responses={200: ReservationSerializer},
        summary="Update a reservation status",
    )
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

    @action(detail=True, methods=["post"], url_path="arrival")
    @extend_schema(
        request={"type": "object", "properties": {"arrival_status": {"type": "string"}}},
        responses={200: ReservationSerializer},
        summary="Update reservation arrival status",
    )
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

    @action(detail=True, methods=["post"], url_path="move-to-requests")
    @extend_schema(
        responses={200: ReservationSerializer},
        summary="Move a reservation back to pending requests",
    )
    def move_to_requests(self, request, pk=None):
        reservation = self.get_object()
        if reservation.venue.owner != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        moved = False
        if reservation.status != "pending" or reservation.arrival_status != "pending":
            reservation.status = "pending"
            reservation.arrival_status = "pending"
            reservation.save(editor=request.user, update_fields=["status", "arrival_status"])
            moved = True

        return Response({"moved": moved, "reservation": _reservation_payload(reservation)})

    @action(detail=True, methods=["post"], url_path="seen")
    @extend_schema(
        request={"type": "object", "properties": {"state": {"type": "string"}}},
        responses={200: ReservationSerializer},
        summary="Mark a reservation as seen or unseen",
    )
    def update_seen(self, request, pk=None):
        reservation = self.get_object()
        if reservation.venue.owner != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        state = request.data.get("state")
        if state not in ["seen", "unseen"]:
            return Response({"detail": "Provide state=seen or state=unseen."}, status=status.HTTP_400_BAD_REQUEST)

        target = state == "seen"
        if reservation.seen != target:
            reservation.seen = target
            reservation.save(update_fields=["seen"])

        return Response({"reservation": _reservation_payload(reservation)})

    @action(detail=True, methods=["get"], url_path="details")
    @extend_schema(
        responses=ReservationSerializer,
        summary="Retrieve reservation details",
    )
    def reservation_details(self, request, pk=None):
        reservation = self.get_object()
        if reservation.venue.owner == request.user and not reservation.seen:
            reservation.seen = True
            reservation.save(update_fields=["seen", "special_requests"])
        return Response(_reservation_payload(reservation))

    @action(detail=True, methods=["post"], url_path="cancel")
    @extend_schema(
        responses={200: ReservationSerializer},
        summary="Cancel a reservation",
    )
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        if reservation.user != request.user and not request.user.is_superuser:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        if reservation.status == "cancelled":
            return Response({"detail": "Reservation already cancelled."})
        reservation.status = "cancelled"
        reservation.save(editor=request.user, update_fields=["status"])
        return Response(_reservation_payload(reservation))


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

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
        print("BHKE")
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
            "results": grouped
        })
