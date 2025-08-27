import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler
from venues.routing import websocket_urlpatterns

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'openspots.settings')

django_asgi_app = get_asgi_application()

# Wrap static files handler only in development
if os.environ.get("DJANGO_SETTINGS_MODULE") == "openspots.settings" and os.environ.get("DEBUG", "True") == "True":
    django_asgi_app = ASGIStaticFilesHandler(django_asgi_app)

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_urlpatterns)
    ),
})
