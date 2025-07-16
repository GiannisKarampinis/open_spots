from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser

#   Purpose: Registering the custom user model (CustomUser) to the Django admin site, so it can be managed via the Django admin interface.
#   Customizing the way your user model appears in the admin:
#       model = CustomUser: Specifies which model this admin class is for.
#       list_display = [...]: Defines which fields to show in the admin list view.
#   So when you go to the admin panel and view users, you'll see a table with columns:
#   Username | Email | User Type | Is Staff | Is Active 

class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = ['username', 'email', 'user_type', 'is_staff', 'is_active']
    

admin.site.register(CustomUser, CustomUserAdmin)

