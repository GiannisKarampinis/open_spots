from django.db.models.signals       import pre_save, post_save
from django.dispatch                import receiver
from django.utils                   import timezone
from django.urls                    import reverse
from .models                        import Reservation
from .notifications                 import notify_venue_admin
from venues.services.emails         import send_reservation_notification

import logging

logger = logging.getLogger(__name__)

###########################################################################################

###########################################################################################
@receiver(pre_save, sender=Reservation)
def detect_reservation_changes(sender, instance, **kwargs):
    if not instance.pk:
        instance._old_values = None
        return

    try:
        old_instance            = Reservation.objects.get(pk=instance.pk)
        instance._old_values    = {
            'date':             old_instance.date,
            'time':             old_instance.time,
            'guests':           old_instance.guests,
            'status':           old_instance.status,
            'arrival_status':   old_instance.arrival_status,
        }
        
    except Reservation.DoesNotExist:
        
        instance._old_values = None
        
###########################################################################################

###########################################################################################
def build_reservation_payload(instance):
    # --- Build payload for WebSocket notification ---
    return {
        "id":                   instance.id,
        "customer_name":        getattr(instance.user, "username", "Unknown"),
        "date":                 instance.date.strftime("%Y-%m-%d") if instance.date else None,
        "time":                 instance.time.strftime("%H:%M") if instance.time else None,
        "guests":               getattr(instance, "guests", None),
        "status":               instance.status,
        "arrival_status":       instance.arrival_status,
        "urls": {
                "accept":       reverse('update_reservation_status',            args=[instance.id, 'accepted']),
                "reject":       reverse('update_reservation_status',            args=[instance.id, 'rejected']),
                "move":         reverse('move_reservation_to_requests_ajax',    args=[instance.id]),
                "checkin":      reverse('update_arrival_status',                args=[instance.id, 'checked_in']),
                "no_show":      reverse('update_arrival_status',                args=[instance.id, 'no_show']),
        },
        "updated_at": (instance.updated_at.isoformat()
                       if hasattr(instance, 'updated_at') and instance.updated_at
                       else timezone.now().isoformat()),
    }

###########################################################################################

###########################################################################################
def get_instance_changes(instance):
    old_values = getattr(instance, "_old_values", None)

    if not old_values:
        return []

    changes = []
    for field, old in old_values.items():
        new = getattr(instance, field, None)
        if old != new:
            changes.append({
                "field":    field.replace("_", " ").title(),
                "old":      old,
                "new":      new,
            })

    return changes

###########################################################################################

###########################################################################################
@receiver(post_save, sender=Reservation)
def reservation_created_or_updated(sender, instance: Reservation, created, **kwargs):
    """
        Trigger both email notifications and WebSocket notifications
        when a Reservation is created or updated.
    """
    
    # --- prevent double-triggering ---
    if getattr(instance, "_signal_processed", False):
        return
    instance._signal_processed = True

    venue_id        = instance.venue_id
    
    if created:
        event_name = "reservation.created"
    elif instance.status == "cancelled":
        event_name = "reservation.cancelled"
    elif instance.status == "pending":
        event_name = "reservation.edited"
    else:
        event_name = "reservation.updated"
    
    reservation_data = build_reservation_payload(instance)
    payload = { 
            "event":        event_name, 
            "reservation":  reservation_data 
    }
    
    notify_venue_admin(venue_id, payload) # WebSocket push
    # FIXME: Optional: for high-volume updates, consider a message queue for WebSocket pushes (like Redis pub/sub)
    
    editor = getattr(instance, "_editor", None)
        
    if created:
        send_reservation_notification(instance, created=True, editor=editor)
        return

    changes_list = get_instance_changes(instance)
    
    if not changes_list:
        return  # No changes detected, skip email
    
    send_reservation_notification(instance, changes_list=changes_list, editor=editor)

###########################################################################################

###########################################################################################