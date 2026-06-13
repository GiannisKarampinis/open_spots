# app/test_views.py
import os
from django.http import JsonResponse, HttpResponse
from django.contrib.auth import get_user_model
from django.conf import settings

STATIC_REACT_DEMO_DIR = os.path.join(settings.BASE_DIR, "static", "react-demo")


def reset_test_user(request):
    User = get_user_model()
    User.objects.filter(username="yoda").delete()
    return JsonResponse({"status": "ok"})


def react_demo_page(request):
    html_path = os.path.join(STATIC_REACT_DEMO_DIR, "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return HttpResponse(f.read(), content_type="text/html")


def react_demo_app_js(request):
    js_path = os.path.join(STATIC_REACT_DEMO_DIR, "app.jsx")
    with open(js_path, "r", encoding="utf-8") as f:
        return HttpResponse(f.read(), content_type="application/javascript")
