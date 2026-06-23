from django.shortcuts import redirect
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls.i18n import i18n_patterns
from django.urls import path, include, re_path
from .views import csrf_token, serve_react_app
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),

    path("admin/", admin.site.urls),

    # API + docs
    path(
        "api/schema/",
        SpectacularAPIView.as_view(permission_classes=[AllowAny]),
        name="openapi-schema",
    ),    path(
    "api/docs/swagger/",
    SpectacularSwaggerView.as_view(url_name="openapi-schema"),
    name="swagger-ui",
    ),

    path(
    "api/docs/redoc/",
    SpectacularRedocView.as_view(url_name="openapi-schema"),
    name="redoc-ui",
    ),
    path("api/token/", TokenObtainPairView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
    path("api/v1/csrf/", csrf_token, name="csrf-token"),

    path("api/v1/", include("venues.api.urls")),
    path("api/v1/accounts/", include("accounts.api.urls")),
]

urlpatterns += i18n_patterns(
    path("accounts/", include("accounts.urls")),
    path("accounts/", include("allauth.urls")),
    path("venues/", include("venues.urls")),
    prefix_default_language=False,
)

urlpatterns += [
    re_path(
        r"^(?!api/|static/|media/|i18n/|admin/).*$",
        serve_react_app,
        name="react-app",
    ),
]