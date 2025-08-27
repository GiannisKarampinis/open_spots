import  json
from    channels.generic.websocket import AsyncWebsocketConsumer

# Defines our WebSocket handler that will run for each connected client (e.g., each venue admin’s browser tab).
class NotificationConsumer(AsyncWebsocketConsumer):
    
    async def connect(self):
        self.venue_id       = self.scope['url_route']['kwargs']['venue_id'] # Grabs the venue_id from the WebSocket URL route.
                                                                            # Example: if the client connects to /ws/notifications/5/, then venue_id = "5".
        
        self.group_name     = f'venue_notifications_{self.venue_id}'        # Creates a unique group name for all admins connected to the same venue.
                                                                            # Example: "venue_notifications_5".
        
        await self.channel_layer.group_add(self.group_name, self.channel_name)  # Adds this specific WebSocket connection (channel_name) into that group.
                                                                                # Now, when group_send("venue_notifications_5", {...}) happens from notifications.py, this socket will receive the event.
        await self.accept() # Accepts the WebSocket handshake → the connection is now open.
                            # Without this, the socket would be immediately closed.

    
    async def disconnect(self, close_code):
        
        await self.channel_layer.group_discard(self.group_name, self.channel_name)  # Called when the client disconnects (browser tab closed, network lost, etc).
                                                                                    # Removes this socket from the group so it doesn’t keep receiving notifications.

    
    async def send_notification(self, event): # This method is triggered whenever group_send(..., {"type": "send_notification", "message": ...}) is called (from our batching logic).
        messages = event['message']
        
        if not isinstance(messages, list):  # Defensive coding:
                                            # If by any chance a single dict (not list) was sent, wrap it into a list so downstream code always sees a list.
            messages = [messages]
        
        # No DB, no template rendering here — just pass through
        await self.send(text_data=json.dumps(messages))

# Serializes the Python list of dicts into JSON text.
# Sends that JSON string down the WebSocket to the browser.
# Example actual payload to the browser:
# [
#   {
#     "type": "reservation_request",
#     "reservation_id": 42,
#     "status": "created",
#     "html": "<tr>....</tr>"
#   },
#   {
#     "type": "reservation_request",
#     "reservation_id": 43,
#     "status": "updated",
#     "html": "<tr>....</tr>"
#   }
# ]

# Our frontend JavaScript will always receive a JSON array of objects, even if it contains only one.