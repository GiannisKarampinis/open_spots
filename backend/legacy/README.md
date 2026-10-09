# Legacy Django template UI

This directory contains the server-rendered UI retained while React replaces it.
It is an active part of the project, not a standalone Django application.

- `accounts/`: HTML views, verification adapters, page forms, and URL routes.
- `venues/`: HTML/AJAX views, forms, authorization decorator, routes, and test helpers.
- `templates/`: account and venue pages, partials, and shared layout.
- `static/`: template CSS, JavaScript, and account artwork; existing static URLs are preserved.
- `templatetags/`: the explicitly registered `date_filters` library.

## Runtime integration

`backend/openspots/urls.py` includes `legacy.accounts.urls` and `legacy.venues.urls` at
their original paths. `backend/openspots/settings.py` registers this directory's template
and static directories and its filter library. There are no duplicate copies of
these page implementations in the active apps.

Install the project's `backend/requirements.txt`. It remains the single dependency
manifest used by Docker and the backend; the legacy UI uses Django, DRF,
SimpleJWT, Plotly, and shared backend utilities. Template CDN dependencies
(Bootstrap, HTMX, Flatpickr, Leaflet, Plotly, etc.) remain referenced in their
original templates. No additional package installation is needed for this move.

## Shared dependencies retained outside legacy

The UI imports active `accounts` and `venues` models, services, API verification
endpoints, venue utilities, and `emails_manager`. These also support the API,
admin, or background jobs and must remain when the template UI is removed.
`backend/accounts/forms.py` retains only `AdminUserCreationForm` for Django admin.
Transactional email templates remain in their installed apps because the API
and workers render them. `static/images/`, translations under `locale/`, and
React files under `static/react-app/` remain active shared resources.

## Eventual removal

1. Verify React covers the HTML routes and AJAX operations defined here, and
   replace any redirects or reverse lookups that still use their URL names.
2. Remove the two legacy URL includes from `backend/openspots/urls.py`.
3. Remove the legacy template/static directories and `date_filters` registration
   from `backend/openspots/settings.py`, then delete this directory.
4. Audit shared utilities and dependencies (including Plotly) for remaining
   callers before deleting them or removing packages from `requirements.txt`.
5. Run backend tests, check API/admin/auth flows, and rebuild collected static
   files so retired browser assets are no longer deployed.
