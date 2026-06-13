from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ReservationViewSet,
    VenueApplicationCreateAPIView,
    VenueVerificationConfirmAPIView,
    VenueVerificationSendAPIView,
    VenueViewSet,
)

router = DefaultRouter()
router.register(r"venues", VenueViewSet, basename="venue")
router.register(r"reservations", ReservationViewSet, basename="reservation")

urlpatterns = router.urls + [
    path("venues/apply/", VenueApplicationCreateAPIView.as_view(), name="venue-application-create"),
    path("venues/verification/send/", VenueVerificationSendAPIView.as_view(), name="venue-verification-send"),
    path("venues/verification/confirm/", VenueVerificationConfirmAPIView.as_view(), name="venue-verification-confirm"),
]
