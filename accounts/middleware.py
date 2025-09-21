# accounts/middleware.py
import threading

_thread_locals = threading.local()

def get_current_request():
    return getattr(_thread_locals, 'request', None)

class ThreadLocalMiddleware:
    """Stores request in thread-local storage."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.request = request
        return self.get_response(request)
