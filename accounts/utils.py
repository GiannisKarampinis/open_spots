import uuid

def generate_username(request, user):
    return f"user_{uuid.uuid4().hex[:10]}"
