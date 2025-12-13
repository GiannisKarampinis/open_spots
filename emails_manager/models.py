from django.db      import models
from django.utils   import timezone
from django.conf    import settings


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
    

class VenueEmailVerificationCode(models.Model):
    email       = models.EmailField()
    code        = models.CharField(max_length=6)
    created_at  = models.DateTimeField(auto_now_add=True)

    VALID_MINUTES = 10  # adjust as needed

    def is_expired(self):
        return self.created_at + timezone.timedelta(minutes=self.VALID_MINUTES) < timezone.now()

    @classmethod
    def generate_code(cls):
        # 6-digit code, zero-padded
        import random
        return f"{random.randint(0, 999999):06d}"

    @classmethod
    def create_for_email(cls, email):
        code = cls.generate_code()
        return cls.objects.create(email=email, code=code)
    
