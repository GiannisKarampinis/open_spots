"""
URL configuration for openspots project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
# from django.contrib import admin
from django.shortcuts import redirect
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls.i18n import i18n_patterns
from django.urls import path, include, re_path
from .views import serve_react_app
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    # i18n
    path("i18n/", include("django.conf.urls.i18n")),

    # Admin (top-level so /admin/ is reachable without language prefix)
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

    path("api/v1/", include("venues.api.urls")),
    path("api/v1/accounts/", include("accounts.api.urls")),
]

urlpatterns += i18n_patterns(
    path("accounts/", include("accounts.urls")),
    path("accounts/", include("allauth.urls")),
    path("venues/", include("venues.urls")),
    prefix_default_language=False,
)

# urlpatterns += [
#     re_path(
#         r"^(?!api/|static/|media/|i18n/).*$",
#         serve_react_app
# )
# ]