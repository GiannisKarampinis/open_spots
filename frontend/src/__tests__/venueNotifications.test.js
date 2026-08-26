import {
	subscribeToVenueNotifications,
	venueNotificationsUrl,
} from "../utils/venueNotifications";

class MockWebSocket {
	static CLOSED = 3;
	static CLOSING = 2;
	static instances = [];

	constructor(url) {
		this.url = url;
		this.readyState = 0;
		MockWebSocket.instances.push(this);
	}

	close() {
		this.readyState = MockWebSocket.CLOSED;
	}
}

describe("venue notifications", () => {
	beforeEach(() => {
		MockWebSocket.instances = [];
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test("uses a secure WebSocket URL on HTTPS", () => {
		expect(venueNotificationsUrl(42, { protocol: "https:", host: "example.com" }))
			.toBe("wss://example.com/ws/notifications/42/");
	});

	test("refreshes on connect and valid reservation messages", () => {
		const onRefresh = jest.fn();
		const unsubscribe = subscribeToVenueNotifications({
			venueId: 7,
			onRefresh,
			WebSocketImpl: MockWebSocket,
		});
		const socket = MockWebSocket.instances[0];

		socket.onopen();
		socket.onmessage({ data: JSON.stringify([{ reservation: { id: 12 } }]) });
		socket.onmessage({ data: "not-json" });

		expect(socket.url).toBe("ws://localhost/ws/notifications/7/");
		expect(onRefresh).toHaveBeenCalledTimes(2);
		unsubscribe();
	});

	test("reconnects after a closed connection and stops after cleanup", () => {
		const unsubscribe = subscribeToVenueNotifications({
			venueId: 7,
			onRefresh: jest.fn(),
			WebSocketImpl: MockWebSocket,
		});

		MockWebSocket.instances[0].onclose();
		jest.advanceTimersByTime(1000);
		expect(MockWebSocket.instances).toHaveLength(2);

		MockWebSocket.instances[1].onclose();
		unsubscribe();
		jest.runOnlyPendingTimers();
		expect(MockWebSocket.instances).toHaveLength(2);
	});
});
