from .settings import *

# Override database for testing
DATABASES = {
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
