# app/test_views.py
from django.http import JsonResponse
from django.contrib.auth import get_user_model

def reset_test_user(request):
    User = get_user_model()
    User.objects.filter(username="yoda").delete()
    return JsonResponse({"status": "ok"})
