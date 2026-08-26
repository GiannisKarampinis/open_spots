const DEFAULT_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export function venueNotificationsUrl(venueId, location = window.location) {
	const scheme = location.protocol === "https:" ? "wss" : "ws";
	return `${scheme}://${location.host}/ws/notifications/${venueId}/`;
}

export function subscribeToVenueNotifications({
	venueId,
	onRefresh,
	WebSocketImpl = window.WebSocket,
	documentImpl = document,
	locationImpl = window.location,
	setTimeoutImpl = window.setTimeout,
	clearTimeoutImpl = window.clearTimeout,
}) {
	let socket;
	let reconnectTimer;
	let stopped = false;
	let reconnectDelay = DEFAULT_RECONNECT_DELAY_MS;

	const refresh = () => {
		if (!stopped) onRefresh();
	};

	const connect = () => {
		if (stopped) return;

		socket = new WebSocketImpl(venueNotificationsUrl(venueId, locationImpl));

		socket.onopen = () => {
			reconnectDelay = DEFAULT_RECONNECT_DELAY_MS;
			// Reconcile on every connection because WebSockets do not replay events
			// which occurred before the connection opened or while it was down.
			refresh();
		};

		socket.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data);
				const messages = Array.isArray(payload) ? payload : [payload];
				if (messages.some((message) => message?.reservation?.id)) refresh();
			} catch {
				// Ignore malformed messages; the next valid event or reconnect will reconcile.
			}
		};

		socket.onclose = () => {
			if (stopped) return;
			reconnectTimer = setTimeoutImpl(connect, reconnectDelay);
			reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
		};
	};

	const handleVisibilityChange = () => {
		if (documentImpl.visibilityState !== "visible") return;

		refresh();
		if (!socket || socket.readyState === WebSocketImpl.CLOSED) {
			if (reconnectTimer) clearTimeoutImpl(reconnectTimer);
			connect();
		}
	};

	documentImpl.addEventListener("visibilitychange", handleVisibilityChange);
	connect();

	return () => {
		stopped = true;
		if (reconnectTimer) clearTimeoutImpl(reconnectTimer);
		documentImpl.removeEventListener("visibilitychange", handleVisibilityChange);
		if (socket && socket.readyState < WebSocketImpl.CLOSING) socket.close();
	};
}
