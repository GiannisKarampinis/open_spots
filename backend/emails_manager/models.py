from django.db      import models
from django.utils   import timezone
from django.conf    import settings
import secrets

def generate_verification_code():
    return f"{secrets.randbelow(1_000_000):06d}"

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
        return generate_verification_code()
    

class VenueEmailVerificationCode(models.Model):
    email       = models.EmailField()
    code        = models.CharField(max_length=6)
    created_at  = models.DateTimeField(auto_now_add=True)

    VALID_MINUTES = 10  # adjust as needed

    def is_expired(self):
        return self.created_at + timezone.timedelta(minutes=self.VALID_MINUTES) < timezone.now()

    @classmethod
    def generate_code(cls):
        return generate_verification_code()

    @classmethod
    def create_for_email(cls, email):
        code = cls.generate_code()
        return cls.objects.create(email=email, code=code)
    
