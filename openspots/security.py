import logging
from urllib.parse import urlparse

from django.conf import settings
from django.http import HttpResponse, HttpResponseForbidden

logger = logging.getLogger("security")


def _origin_allowed(origin):
    if not origin:
        return True
    return origin in getattr(settings, "SECURITY_ALLOWED_CORS_ORIGINS", [])


def _is_api_request(request):
    return request.path.startswith("/api/")


class StrictCORSMiddleware:
    """
    Allows credentialed browser API requests only from explicit trusted origins.
    Requests without an Origin header are not CORS requests and are allowed.
    """

    allowed_methods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    allowed_headers = "Authorization, Content-Type, X-CSRFToken, X-Requested-With"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request): # this runs for every incoming request
        origin = request.headers.get("Origin")

        if _is_api_request(request) and origin and not _origin_allowed(origin):
            return HttpResponseForbidden("CORS origin is not allowed.")

        if _is_api_request(request) and request.method == "OPTIONS":
            response = HttpResponse()
        else:
            response = self.get_response(request) # this is the moment where the view is called and the response is generated

        if _is_api_request(request) and origin and _origin_allowed(origin):
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Allow-Methods"] = self.allowed_methods
            response["Access-Control-Allow-Headers"] = self.allowed_headers
            response["Vary"] = "Origin"

        return response


class SecurityHeadersMiddleware:
    """
    Adds browser-side defense headers. CSP is report-only by default so it can be
    observed safely before enforcing in production.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request) # this is the moment where the view is called and the response is generated
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.setdefault("X-Permitted-Cross-Domain-Policies", "none")

        csp = self._content_security_policy()
        if csp:
            header = (
                "Content-Security-Policy-Report-Only"
                if getattr(settings, "SECURITY_CSP_REPORT_ONLY", True)
                else "Content-Security-Policy"
            )
            response[header] = csp

        return response

    def _content_security_policy(self):
        if not getattr(settings, "SECURITY_CSP_ENABLED", False):
            return ""

        site_url = getattr(settings, "SITE_URL", "")
        site_origin = ""
        if site_url:
            parsed = urlparse(site_url)
            if parsed.scheme and parsed.netloc:
                site_origin = f"{parsed.scheme}://{parsed.netloc}"

        connect_src = ["'self'"]
        if site_origin:
            connect_src.append(site_origin)

        directives = {
            "default-src": ["'self'"],
            "base-uri": ["'self'"],
            "object-src": ["'none'"],
            "frame-ancestors": ["'none'"],
            "img-src": ["'self'", "data:", "blob:"],
            "font-src": ["'self'", "data:"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "script-src": ["'self'"],
            "connect-src": connect_src,
            "form-action": ["'self'"],
            "upgrade-insecure-requests": [],
        }

        report_uri = getattr(settings, "SECURITY_CSP_REPORT_URI", "")
        if report_uri:
            directives["report-uri"] = [report_uri]

        return "; ".join(
            " ".join([name, *values]) if values else name
            for name, values in directives.items()
        )


class SecurityEventLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request) # this is the moment where the view is called and the response is generated
        if _is_api_request(request) and response.status_code in {401, 403, 429}:
            logger.warning(
                "api_security_event status=%s method=%s path=%s ip=%s origin=%s user=%s",
                response.status_code,
                request.method,
                request.path,
                self._client_ip(request),
                request.headers.get("Origin", ""),
                getattr(getattr(request, "user", None), "pk", None),
            )
        return response

    def _client_ip(self, request):
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")
