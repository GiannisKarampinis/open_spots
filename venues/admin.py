from django.utils               import timezone
from django.contrib             import admin
from django.utils.html          import format_html
from .models                    import Venue, Table, Reservation, Review, VenueApplication, VenueUpdateRequest, VenueVisit, VenueImage, VenueMenuImage
from django.utils.html          import format_html

class TableInline(admin.TabularInline):
    model = Table
    extra = 1

class VenueImageInline(admin.TabularInline):
    model = VenueImage
    readonly_fields = ['image_tag']
    extra = 0

    def image_tag(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height: 50px; margin:2px;" />', obj.image.url)
        return "No Image"
    image_tag.short_description = "Image Preview"

# Inline for Venue Menu Images
class VenueMenuImageInline(admin.TabularInline):
    model = VenueMenuImage
    readonly_fields = ['image_tag']
    extra = 0

    def image_tag(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height: 50px; margin:2px;" />', obj.image.url)
        return "No Image"
    image_tag.short_description = "Menu Preview"

@admin.register(Venue)
class VenueAdmin(admin.ModelAdmin):
    readonly_fields     = ['image_tag']
    inlines             = [TableInline, VenueImageInline, VenueMenuImageInline]

    list_display = ('name', 'kind', 'location', 'average_rating', 'image_tag', 'owner')
    
    def image_tag(self, obj):
        if obj.image:
            return format_html('<img src="{}" style="height: 50px;" />', obj.image.url)
        return "No Image"
    image_tag.short_description = 'Image'

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)

    def has_add_permission(self, request):
        return request.user.is_superuser  # Venue admins can't add venues

    def has_change_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        return obj is None or obj.owner == request.user

    def has_delete_permission(self, request, obj=None):
        if request.user.is_superuser:
            return True
        return obj is not None and obj.owner == request.user

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}


@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ('venue', 'number', 'seats')
    list_filter = ('venue',)
    search_fields = ('venue__name',)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(venue__owner=request.user)

    def has_change_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_delete_permission(request, obj)

    def has_add_permission(self, request):
        if request.user.is_superuser:
            return True
        # Allow adding if user owns at least one venue
        return Venue.objects.filter(owner=request.user).exists()

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display    = ('venue', 'name', 'email', 'date', 'time', 'guests', 'status', 'table')
    list_filter     = ('venue', 'status', 'date')
    search_fields   = ('name', 'email', 'venue__name')
    ordering        = ('-date', 'time')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(venue__owner=request.user)

    def has_change_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if not request.user.is_superuser and obj and obj.venue.owner != request.user:
            return False
        return super().has_delete_permission(request, obj)

    def has_add_permission(self, request):
        return request.user.is_superuser or Venue.objects.filter(owner=request.user).exists()

    def get_model_perms(self, request):
        perms = super().get_model_perms(request)
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return perms
        return {}
    
    def save_model(self, request, obj, form, change):
        """
        Override to pass the editor (request.user) to Reservation.save()
        """
        obj.save(editor=request.user)


@admin.register(VenueApplication)
class VenueApplicationAdmin(admin.ModelAdmin):
    list_display = ('venue_name', 'admin_email', 'submitted_at', 'reviewed', 'accepted')
    list_filter = ('reviewed', 'accepted')
    search_fields = ('venue_name', 'admin_email')
    ordering = ('-submitted_at',)
    actions = ['mark_as_accepted']

    @admin.action(description="Mark selected applications as accepted")
    def mark_as_accepted(self, request, queryset):
        updated = queryset.update(reviewed=True, accepted=True)
        self.message_user(request, f"{updated} application(s) marked as accepted.")

    def get_model_perms(self, request):
        # Only superusers should manage applications
        if request.user.is_superuser:
            return super().get_model_perms(request)
        return {}


@admin.register(VenueVisit)
class VenueVisitAdmin(admin.ModelAdmin):
    list_display = ('venue', 'user', 'ip_address', 'timestamp')
    list_filter = ('venue', 'timestamp')
    search_fields = ('venue__name', 'user__username', 'ip_address')
    readonly_fields = ('venue', 'user', 'ip_address', 'timestamp')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(venue__owner=request.user)

    def get_model_perms(self, request):
        if request.user.is_superuser or request.user.user_type == 'venue_admin':
            return super().get_model_perms(request)
        return {}


@admin.register(VenueUpdateRequest)
class VenueUpdateRequestAdmin(admin.ModelAdmin):
    list_display    = ("venue", "submitted_by", "approval_status", "submitted_at", "preview_changes")
    list_filter     = ("approval_status",)
    actions         = ["approve_requests", "reject_requests"]

    def preview_changes(self, obj):
        venue = obj.venue

        html = "<h3>FIELD CHANGES</h3>"

        for field in ["name", "kind", "location", "email", "phone", "description"]:
            venue_val = getattr(venue, field)
            req_val = getattr(obj, field)

            if venue_val != req_val:
                html += f"<b>{field.title()} changed:</b> {venue_val} → <span style='color: green;'>{req_val}</span><br>"

        # ---------------------------------------------------------
        # IMAGE CHANGES
        # ---------------------------------------------------------
        html += "<h3>VENUE IMAGES</h3>"

        # Existing approved images
        html += "<b>Approved Images:</b><br>"
        for img in venue.images.filter(approved=True, marked_for_deletion=False).order_by("order"):
            html += f'<img src="{img.image.url}" width="60" style="margin:2px; border:1px solid #ccc;">'

        # New → approved=False
        html += "<br><b>Newly Added Images (Pending Approval):</b><br>"
        for img in venue.images.filter(approved=False, marked_for_deletion=False):
            html += f'<img src="{img.image.url}" width="60" style="margin:2px; border:2px solid green;">'

        # Deleted → marked_for_deletion=True
        html += "<br><b>Images Marked for Deletion:</b><br>"
        for img in venue.images.filter(marked_for_deletion=True):
            html += f'<img src="{img.image.url}" width="60" style="margin:2px; opacity:0.4; border:2px solid red;">'

        # ---------------------------------------------------------
        # MENU IMAGES
        # ---------------------------------------------------------
        html += "<h3>MENU IMAGES</h3>"

        html += "<b>Approved Menu Images:</b><br>"
        for img in venue.menu_images.filter(approved=True, marked_for_deletion=False).order_by("order"):
            html += f'<img src="{img.image.url}" width="60" style="margin:2px; border:1px solid #ccc;">'

        html += "<br><b>New Menu Images (Pending Approval):</b><br>"
        for img in venue.menu_images.filter(approved=False, marked_for_deletion=False):
            html += f'<img src="{img.image.url}" width="60" style="margin:2px; border:2px solid green;">'

        html += "<br><b>Menu Images Marked for Deletion:</b><br>"
        for img in venue.menu_images.filter(marked_for_deletion=True):
            html += f'<img src="{img.image.url}" width="60" style="margin:2px; opacity:0.4; border:2px solid red;">'

        return format_html(html)

    preview_changes.short_description = "Proposed Changes"

    # ===============================================================================
    # APPROVE REQUEST
    # ===============================================================================
    def approve_requests(self, request, queryset):
        pending_requests = queryset.filter(approval_status="pending")
        approved_count = 0

        for update in pending_requests:
            venue = update.venue

            # 1) APPLY TEXT FIELD UPDATES
            for field in ["name", "kind", "location", "email", "phone", "description"]:
                setattr(venue, field, getattr(update, field))
            venue.save()

            # ====================================================
            # 2) VENUE IMAGES
            # ====================================================

            # (A) APPROVE NEW IMAGES
            for img in venue.images.filter(approved=False, marked_for_deletion=False):
                img.approved = True
                img.save(update_fields=["approved"])

            # (B) DO NOT DELETE — just keep marked_for_deletion=True
            # No action needed; already marked
            # OPTIONALLY: enforce approved=True for deleted images too:
            for img in venue.images.filter(marked_for_deletion=True):
                if not img.approved:
                    img.approved = True
                    img.save(update_fields=["approved"])

            # ====================================================
            # 3) MENU IMAGES
            # ====================================================

            for img in venue.menu_images.filter(approved=False, marked_for_deletion=False):
                img.approved = True
                img.save(update_fields=["approved"])

            for img in venue.menu_images.filter(marked_for_deletion=True):
                if not img.approved:
                    img.approved = True
                    img.save(update_fields=["approved"])

            # ====================================================
            # 4) MARK REQUEST APPROVED
            # ====================================================
            update.approval_status = "approved"
            update.reviewed_by = request.user
            update.reviewed_at = timezone.now()
            update.save()

            approved_count += 1

        self.message_user(request, f"{approved_count} update request(s) approved.")

    approve_requests.short_description = "Approve selected requests"

    # ===============================================================================
    # REJECT REQUEST
    # ===============================================================================
    def reject_requests(self, request, queryset):

        # REMOVE NEW IMAGES (approved=False)
        for update in queryset.filter(approval_status="pending"):
            venue = update.venue

            venue.images.filter(approved=False).delete()
            venue.menu_images.filter(approved=False).delete()

            # UNMARK DELETED IMAGES
            for img in venue.images.filter(marked_for_deletion=True):
                img.marked_for_deletion = False
                img.save()

            for img in venue.menu_images.filter(marked_for_deletion=True):
                img.marked_for_deletion = False
                img.save()

            # SET REQUEST REJECTED
            update.approval_status = "rejected"
            update.reviewed_by = request.user
            update.reviewed_at = timezone.now()
            update.save()

        self.message_user(request, "Selected requests rejected.")

    reject_requests.short_description = "Reject selected requests"

@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("id", "venue", "user", "rating", "created_at")
    list_filter = ("rating", "created_at")
    search_fields = ("user__username", "venue__name", "comment")
    readonly_fields = ("created_at", "updated_at")