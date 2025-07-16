from django.apps import AppConfig

#   This class defines the configuration for the 'accounts' app.
#   It is used by Django to recognize the app and apply app-specific settings.
#   The 'default_auto_field' sets the default primary key type to BigAutoField (64-bit),
#   which is helpful for apps expected to store a large number of records.
#   The 'name' attribute tells Django the full Python path to the app.
#   This config class can also be used to include app-level startup code (e.g., signals).


class AccountsConfig(AppConfig):
    default_auto_field  = 'django.db.models.BigAutoField'
    name                = 'accounts'
