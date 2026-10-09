from .settings import *

# Override database for testing
DATABASES = DATABASES if os.environ.get("TEST_USE_POSTGRES") == "1" else {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',  # fast in-memory DB for tests
    }
}

# Optional: speed up hashing during tests
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

# Disable debug toolbar etc.
INSTALLED_APPS = [app for app in INSTALLED_APPS if app != 'debug_toolbar']

# Tests must never deliver email or share throttle counters with development.
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = False
