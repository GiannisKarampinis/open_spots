from    django.contrib              import admin
from    django.contrib.auth.admin   import UserAdmin
from    .models                     import CustomUser
from    .forms                      import AdminUserCreationForm  # Form used by admin to create users with user_type role
from    django.utils.translation    import gettext_lazy as _


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    model       = CustomUser
    add_form    = AdminUserCreationForm  # Form used when creating a new user ONLY from the admin panel

    # Columns shown in the user list page in the admin
    list_display = ('email', 'username', 'user_type', 'is_staff', 'is_active')

    # Filters available on the right side of the list page
    list_filter = ('user_type', 'is_staff', 'is_active')

    # Default ordering of users in the admin list - ordered by email
    ordering = ('email',)

    # Defines the fields and sections shown when viewing or editing an existing user
    fieldsets = (
        (None, {'fields': ('email', 'password')}),  # Basic login info
        (_('Personal info'), {'fields': ('username', 'user_type', 'phone_number')}),  # Personal details including user type and phone
        (_('Permissions'), {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),  # Permissions and roles
        (_('Important dates'), {'fields': ('last_login', 'date_joined')}),  # When user last logged in and joined
    )

    # Fields shown when adding a new user via the admin panel
    add_fieldsets = (
        (None, {
            'classes': ('wide',),  # CSS class to make the form wider
            'fields': (
                'email', 'username', 'phone_number', 'user_type',  # Personal and user type fields
                'password1', 'password2',  # Password fields with confirmation
                'is_staff', 'is_active',  # Staff/admin and active status
            ),
        }),
    )
    
    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_module_permission(self, request):
        return request.user.is_superuser


