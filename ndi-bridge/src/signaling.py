import socketio
import urllib3
from typing import Callable, Optional


NDI_NAMESPACE = "/ndi-bridge"

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class SignalingClient:
    """Socket.io client for the /ndi-bridge namespace.

    Connects to the backend's /ndi-bridge namespace, handles lifecycle
    events and provides emit_consume_stream().
    """

    def __init__(self, backend_url: str, ssl_verify: bool = True):
        import requests as req_lib
        http_session = req_lib.Session()
        if not ssl_verify:
            http_session.verify = False
        self.sio = socketio.Client(http_session=http_session, logger=False)
        # Strip trailing slash so URL joining is clean
        self.backend_url = backend_url.rstrip("/")
        self._callbacks: dict[str, Callable] = {}

    def on(self, event: str, callback: Callable):
        """Register a handler for an event on the /ndi-bridge namespace."""
        self._callbacks[event] = callback
        self.sio.on(event, callback, namespace=NDI_NAMESPACE)

    def connect(self):
        """Connect to the backend and join the /ndi-bridge namespace."""
        self.sio.connect(
            self.backend_url,
            namespaces=[NDI_NAMESPACE],
            transports=["websocket", "polling"],
        )

    def emit_consume_stream(self, producer_id: str, rtp_port: int = 0, rtp_ip: str = "127.0.0.1"):
        """Request the backend to create a Consumer for the given producer.

        Sends the bridge's RTP IP and port so the backend can explicitly
        connect() the PlainTransport to this bridge instance.
        """
        self.sio.emit(
            "consume-stream",
            {"producerId": producer_id, "rtpPort": rtp_port, "rtpIp": rtp_ip},
            namespace=NDI_NAMESPACE,
        )

    def disconnect(self):
        """Disconnect from the backend."""
        self.sio.disconnect()

    @property
    def connected(self) -> bool:
        return self.sio.connected
