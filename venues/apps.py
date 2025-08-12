from django.apps import AppConfig

class VenuesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'venues'

    def ready(self):
        import venues.models  # Ensures signals are registered
        import venues.signals  # Ensures signals are registered
