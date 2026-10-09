from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers
from drf_spectacular.utils import extend_schema


class ProfileApiResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    is_verified = serializers.BooleanField()

@extend_schema(responses=ProfileApiResponseSerializer, summary="Get authenticated profile info")
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile_api(request):
    user = request.user
    return Response({
        "id": user.id,
        "email": user.email,
        "is_verified": user.email_verified,
    })
