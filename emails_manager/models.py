from django.db import models
from django.utils import timezone
from django.conf import settings


class EmailVerificationCode(models.Model):
    user        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    code        = models.CharField(max_length=6)
    created_at  = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() > self.created_at + timezone.timedelta(minutes=10)

    def __str__(self):
        return f"Code {self.code} for {self.user.email}"

    @staticmethod
    def generate_code():
        from random import randint
        return f"{randint(100000, 999999)}"