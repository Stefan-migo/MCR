"""Socket.io client for mediasoup WebRTC signaling.

Connects to the backend's main namespace and handles the standard
mediasoup consumer flow: get-rtp-capabilities, create-recv-transport,
connect-recv-transport, consume-stream, resume-consumer.
"""

import socketio
import urllib3
from typing import Callable, Optional

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class SignalingClient:
    """Client for mediasoup WebRTC signaling over Socket.io.

    Connects to the backend's main namespace ('/') and provides
    methods for the standard consumer flow.
    """

    def __init__(self, backend_url: str, ssl_verify: bool = True):
        import requests as req_lib
        http_session = req_lib.Session()
        if not ssl_verify:
            http_session.verify = False
        self.sio = socketio.Client(http_session=http_session, logger=False)
        self.backend_url = backend_url.rstrip("/")
        self._connected = False

    def on(self, event: str, callback: Callable):
        """Register a handler for a socket.io event on the main namespace."""
        self.sio.on(event, callback)

    def connect(self):
        """Connect to the main namespace."""
        self.sio.connect(
            self.backend_url,
            transports=["websocket", "polling"],
        )
        self._connected = True

    def get_rtp_capabilities(self) -> dict:
        """Get the router's RTP capabilities (ack callback)."""
        result = {}

        def _ack(data):
            nonlocal result
            result = data

        self.sio.emit("get-rtp-capabilities", _ack)
        self.sio.sleep(0.5)  # wait for ack
        return result

    def emit_with_ack(self, event: str, data: dict) -> dict:
        """Emit an event and wait for the ack callback."""
        result = {}

        def _ack(data):
            nonlocal result
            result = data

        self.sio.emit(event, data, callback=_ack)
        self.sio.sleep(1)  # wait for ack
        return result

    def disconnect(self):
        """Disconnect from the backend."""
        self._connected = False
        self.sio.disconnect()

    @property
    def connected(self) -> bool:
        return self._connected
