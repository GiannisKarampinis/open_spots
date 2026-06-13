from django.http import FileResponse
from django.views.decorators.cache import cache_page
from django.conf import settings
from pathlib import Path


def serve_react_app(request, *args, **kwargs):
    react_index = Path(settings.STATIC_ROOT) / 'react-app' / 'index.html'

    if react_index.exists():
        return FileResponse(open(react_index, 'rb'), content_type='text/html')

    return FileResponse(
        open(Path(settings.BASE_DIR) / 'static' / 'react-app' / 'index.html', 'rb'),
        content_type='text/html'
    )
