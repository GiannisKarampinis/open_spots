import  logging, threading, time
from    asgiref.sync        import async_to_sync
from    channels.layers     import get_channel_layer

logger = logging.getLogger(__name__)

_pending_notifications      = {}                    # a dictionary where keys are venue_id and values are lists of pending messages that haven’t been sent yet.
                                                    #{
                                                    #     5: [ {msg1}, {msg2}, {msg3} ],
                                                    #     8: [ {msg4} ]
                                                    # }
                                                    
_lock                       = threading.Lock()      # ensures thread safety because multiple threads (Django worker threads) might call notify_venue_admin() at the same time.
BATCH_INTERVAL              = 2                     # every 2 seconds, the background worker flushes out notifications in batches.

                                                    # FIXME: Increase the BATCH_INTERVAL in production!

def _send_batch(venue_id):
    # Pulls all queued messages for that venue_id and removes them from memory.
    # Sends them in one single group_send() call instead of one per reservation.
    # This reduces WebSocket spam when many reservations are created in a short period (e.g., 20 people book at once).
    # So instead of:
    # 20 separate WebSocket messages
    # You get:
    # 1 batched WebSocket message with a list of 20 payloads.

    channel_layer = get_channel_layer()
    
    if not channel_layer:
        logger.warning("❌ No channel layer available")
        return

    with _lock:
        messages = _pending_notifications.pop(venue_id, [])

    if not messages:
        return

    cleaned = []
    for msg in messages:
        if isinstance(msg, dict):
            # If it's a modern payload (has 'reservation' or 'event'), keep it
            if 'reservation' in msg and 'event' in msg:
                cleaned.append(msg)
                continue
            # If it's legacy shape with 'html', try to log & drop it
            if 'html' in msg:
                logger.warning("Dropping legacy HTML notification for venue %s: %s", venue_id, {k: v for k, v in msg.items() if k != 'html'})
                continue
            # If it looks already like the desired payload (maybe producer already sent it), keep
            cleaned.append(msg)
        else:
            # non-dict message: log & skip
            logger.warning("Skipping non-dict notification for venue %s: %r", venue_id, msg)

    if not cleaned:
        return

    try:
        async_to_sync(channel_layer.group_send)(
            f'venue_notifications_{venue_id}',
            {"type": "send_notification", "message": cleaned}
        )
        logger.info(f"📢 Batch sent to venue {venue_id}: {len(cleaned)} notifications")
    except Exception as e:
        logger.error(f"⚠️ Notification batch failed for venue {venue_id}: {e}")
        
        
def _batch_worker():
    #   Runs in a background thread.
    #   Every 2 seconds, it looks at all venues with queued notifications and flushes them with _send_batch.
    #   Then sleeps again.
    #   This keeps our main request cycle fast (signals just enqueue messages, no heavy work done inline).

    while True:
        with _lock:
            venue_ids = list(_pending_notifications.keys())
        for venue_id in venue_ids:
            _send_batch(venue_id)
        time.sleep(BATCH_INTERVAL)

threading.Thread(target=_batch_worker, daemon=True).start() 
    # Spawns a daemon thread automatically when notifications.py is first imported (usually at Django startup).
    # Daemon means it won’t block process shutdown.

def notify_venue_admin(venue_id, message_data):
    # Do not enrich here; signals already provided final payload (including 'html')
    with _lock:
        _pending_notifications.setdefault(venue_id, []).append(message_data)
