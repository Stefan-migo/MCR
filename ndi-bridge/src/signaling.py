import socketio
from typing import Callable, Optional


class SignalingClient:
    """Socket.io client for the /ndi-bridge namespace.

    Connects to the backend, handles lifecycle events (connect, disconnect,
    active-streams, stream-started, stream-stopped, consumer-ready,
    consumer-error, consumer-closed) and provides emit_consume_stream().
    """

    def __init__(self, backend_url: str):
        self.sio = socketio.Client(logger=False)
        self.backend_url = backend_url
        self._callbacks: dict[str, Callable] = {}

    def on(self, event: str, callback: Callable):
        """Register a handler for a socket.io event."""
        self._callbacks[event] = callback
        self.sio.on(event, callback)

    def connect(self):
        """Connect to the /ndi-bridge namespace with websocket transport."""
        self.sio.connect(
            f"{self.backend_url}/ndi-bridge",
            transports=["websocket", "polling"],
        )

    def emit_consume_stream(self, producer_id: str):
        """Request the backend to create a Consumer for the given producer."""
        self.sio.emit("consume-stream", {"producerId": producer_id})

    def disconnect(self):
        """Disconnect from the backend."""
        self.sio.disconnect()

    @property
    def connected(self) -> bool:
        return self.sio.connected
