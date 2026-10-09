from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.conf import settings
from venues.models import Review, Reservation

@csrf_exempt
@require_POST
def delete_test_review(request):
    if not settings.DEBUG:
        return JsonResponse({"error": "Forbidden"}, status=403)

    Review.objects.filter(
        venue_id=request.POST.get("venue_id"),
        user__username=request.POST.get("username"),
    ).delete()

    return JsonResponse({"ok": True})

@csrf_exempt
@require_POST
def delete_reservation(request):
    # Keep it test-only
    if not settings.DEBUG:
        return JsonResponse({"error": "Forbidden"}, status=403)

    qs = Reservation.objects.filter(
        # If Reservation.user is FK -> use user__username
        user__username=request.POST.get("user"),
        name=request.POST.get("name"),
        date=request.POST.get("date"),
        time=request.POST.get("time"),
        venue_id=request.POST.get("venue_id"),
    )
    deleted, _ = qs.delete()
    return JsonResponse({"deleted": deleted}, status=200)
