from datetime               import timedelta
import logging

from celery                 import shared_task
from django.contrib.auth    import get_user_model
from django.db              import transaction
from django.utils           import timezone

from venues.models          import Reservation, ReservationOutboxEvent
from venues.notifications   import send_venue_notification
from venues.services.emails import send_reservation_notification

logger = logging.getLogger(__name__)
User = get_user_model()


###########################################################################################
# CELERY TASKS
###########################################################################################
@shared_task(bind=True, max_retries=5, default_retry_delay=15)
def process_outbox_event(self, outbox_event_id):
    try:
        event = ReservationOutboxEvent.objects.select_related('reservation', 'venue').get(id=outbox_event_id)
    except ReservationOutboxEvent.DoesNotExist:
        return "missing"

    if event.status == ReservationOutboxEvent.STATUS_SENT:
        return "already-sent"

    now = timezone.now()
    if event.next_retry_at and event.next_retry_at > now:
        return "not-due"

    with transaction.atomic():
        event = ReservationOutboxEvent.objects.select_for_update().get(id=outbox_event_id)
        if event.status == ReservationOutboxEvent.STATUS_SENT:
            return "already-sent"
        event.status = ReservationOutboxEvent.STATUS_PROCESSING
        event.attempts += 1
        event.last_error = ''
        event.save(update_fields=['status', 'attempts', 'last_error', 'updated_at'])

    try:
        payload = event.payload or {}
        reservation_payload = payload.get('reservation') or {}
        venue_id = event.venue_id
        channel = getattr(event, 'channel', ReservationOutboxEvent.CHANNEL_BOTH)

        delivery_state = payload.get('delivery_state') or {}
        websocket_sent = bool(delivery_state.get('websocket_sent', False))
        email_sent = bool(delivery_state.get('email_sent', False))

        should_send_websocket = channel in (
            ReservationOutboxEvent.CHANNEL_WEBSOCKET,
            ReservationOutboxEvent.CHANNEL_BOTH,
        )
        should_send_email = channel in (
            ReservationOutboxEvent.CHANNEL_EMAIL,
            ReservationOutboxEvent.CHANNEL_BOTH,
        )

        if should_send_websocket and not websocket_sent:
            websocket_ok = send_venue_notification(venue_id, payload)
            if not websocket_ok:
                raise RuntimeError(f"WebSocket delivery returned False for venue {venue_id}")

            delivery_state['websocket_sent'] = True
            payload['delivery_state'] = delivery_state
            event.payload = payload
            event.save(update_fields=['payload', 'updated_at'])

        if should_send_email and not email_sent:
            reservation_id = reservation_payload.get('id') or event.reservation_id
            reservation = Reservation.objects.select_related('venue', 'user').get(id=reservation_id)

            email_meta = payload.get('email_meta', {})
            created = bool(email_meta.get('created', False))
            changes_list = email_meta.get('changes_list') or None
            editor_id = email_meta.get('editor_id')
            editor = None
            if editor_id:
                editor = User.objects.filter(id=editor_id).first()

            send_reservation_notification(
                reservation,
                created=created,
                editor=editor,
                changes_list=changes_list,
            )

            delivery_state['email_sent'] = True
            payload['delivery_state'] = delivery_state
            event.payload = payload
            event.save(update_fields=['payload', 'updated_at'])

        event.status = ReservationOutboxEvent.STATUS_SENT
        event.sent_at = timezone.now()
        event.next_retry_at = timezone.now()
        event.save(update_fields=['status', 'sent_at', 'next_retry_at', 'updated_at'])
        return "sent"

    except Exception as exc:
        retry_delay = min(300, 15 * (2 ** max(event.attempts - 1, 0)))
        event.status = ReservationOutboxEvent.STATUS_FAILED
        event.last_error = str(exc)
        event.next_retry_at = timezone.now() + timedelta(seconds=retry_delay)
        event.save(update_fields=['status', 'last_error', 'next_retry_at', 'updated_at'])
        logger.exception("Failed processing outbox event %s", outbox_event_id)
        raise self.retry(exc=exc, countdown=retry_delay)


###########################################################################################
# Called by Celery Beat - Sweeper job
###########################################################################################
@shared_task
def process_pending_outbox_events(limit=200):
    now = timezone.now()
    pending_ids = list(
        ReservationOutboxEvent.objects
        .filter(status__in=[ReservationOutboxEvent.STATUS_PENDING, ReservationOutboxEvent.STATUS_FAILED], next_retry_at__lte=now)
        .order_by('created_at')
        .values_list('id', flat=True)[:limit]
    )
    for event_id in pending_ids:
        process_outbox_event.delay(event_id)    # Enqueue each event for processing by worker
    return len(pending_ids)                     # Count scheduled for processing
