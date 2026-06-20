from django.shortcuts import redirect
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.conf.urls.i18n import i18n_patterns
from django.urls import path, include, re_path
from .views import serve_react_app

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),

    path("admin/", admin.site.urls),

    # API + docs
    path("api/", include("openspots.api_urls")),
]

urlpatterns += i18n_patterns(
    path("accounts/", include("accounts.urls")),
    path("accounts/", include("allauth.urls")),
    path("venues/", include("venues.urls")),
    prefix_default_language=False,
)