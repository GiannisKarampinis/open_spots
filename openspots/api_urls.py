from django.urls                    import include, path
from drf_spectacular.views          import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.permissions     import AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from accounts.api.views             import CookieTokenRefreshAPIView

urlpatterns = [
    path(
        "schema/",
        SpectacularAPIView.as_view(permission_classes=[AllowAny]),
        name="openapi-schema",
    ),
    path(
        "docs/swagger/",
        SpectacularSwaggerView.as_view(url_name="openapi-schema"),
        name="swagger-ui",
    ),
    path(
        "docs/redoc/",
        SpectacularRedocView.as_view(url_name="openapi-schema"),
        name="redoc-ui",
    ),
    path("token/", TokenObtainPairView.as_view()),
    path("token/refresh/", CookieTokenRefreshAPIView.as_view()),
    path("v1/", include("venues.api.urls")),
    path("v1/accounts/", include("accounts.api.urls")),
]
