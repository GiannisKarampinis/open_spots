from django.db                  import transaction
from django.db.models.signals   import pre_save, post_save
from django.dispatch            import receiver
from django.utils               import timezone
from django.urls                import reverse
from .models                    import Reservation, ReservationOutboxEvent
from .tasks                     import process_outbox_event

import logging

logger = logging.getLogger(__name__)

###########################################################################################
# HELPER
###########################################################################################
def build_reservation_payload(instance):
    # --- Build payload for WebSocket notification ---
    return {
        "id":                   instance.id,
        "customer_name":        instance.full_name,
        "date":                 instance.date.strftime("%Y-%m-%d") if instance.date else None,
        "time":                 instance.time.strftime("%H:%M") if instance.time else None,
        "guests":               getattr(instance, "guests", None),
        "seen":                 bool(getattr(instance, "seen", False)),
        "status":               instance.status,
        "arrival_status":       instance.arrival_status,
        "urls": {
                "accept":       reverse('update_reservation_status',            args=[instance.id, 'accepted']),
                "reject":       reverse('update_reservation_status',            args=[instance.id, 'rejected']),
                "move":         reverse('move_reservation_to_requests_ajax',    args=[instance.id]),
                "checkin":      reverse('update_arrival_status',                args=[instance.id, 'checked_in']),
                "no_show":      reverse('update_arrival_status',                args=[instance.id, 'no_show']),
            "seen":         reverse('update_reservation_seen',              args=[instance.id, 'seen']),
            "unseen":       reverse('update_reservation_seen',              args=[instance.id, 'unseen']),
        },
        "updated_at": (instance.updated_at.isoformat()
                       if hasattr(instance, 'updated_at') and instance.updated_at
                       else timezone.now().isoformat()),
    }

###########################################################################################
# PRE - SAVE RESERVATION
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

    editor = getattr(instance, "_editor", None)
    changes_list = get_instance_changes(instance)

    email_meta = {
        "created": bool(created),
        "editor_id": getattr(editor, "id", None) if editor else None,
        "changes_list": changes_list,
    }

    payload = {
        "event": event_name,
        "reservation": reservation_data,
        "email_meta": email_meta,
    }

    event_timestamp = reservation_data.get('updated_at')

    channel_specs = [
        (ReservationOutboxEvent.CHANNEL_WEBSOCKET, f"{event_name}.websocket"),
        (ReservationOutboxEvent.CHANNEL_EMAIL, f"{event_name}.email"),
    ]

    for channel, channel_event_type in channel_specs:
        idempotency_key = f"reservation:{instance.id}:{event_name}:{event_timestamp}:{channel}"

        outbox_event, created_outbox = ReservationOutboxEvent.objects.get_or_create(
            idempotency_key=idempotency_key,
            defaults={
                "reservation": instance,
                "venue_id": venue_id,
                "event_type": channel_event_type,
                "channel": channel,
                "payload": payload,
                "status": ReservationOutboxEvent.STATUS_PENDING,
                "next_retry_at": timezone.now(),
            },
        )

        if created_outbox or outbox_event.status in (ReservationOutboxEvent.STATUS_PENDING, ReservationOutboxEvent.STATUS_FAILED):
            transaction.on_commit(lambda event_id=outbox_event.id: process_outbox_event.delay(event_id))

###########################################################################################

###########################################################################################