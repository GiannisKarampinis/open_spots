from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.conf import settings
from venues.models import Review

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