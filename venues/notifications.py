import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def send_venue_notification_batch(venue_id, messages):
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer available for venue %s", venue_id)
        return False

    if not isinstance(messages, list):
        messages = [messages]

    cleaned = [message for message in messages if isinstance(message, dict)]
    if not cleaned:
        return True

    async_to_sync(channel_layer.group_send)(
        f"venue_notifications_{venue_id}",
        {"type": "send_notification", "message": cleaned},
    )
    return True


def send_venue_notification(venue_id, message_data):
    return send_venue_notification_batch(venue_id, [message_data])
