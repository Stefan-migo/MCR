"""Socket.io client for mediasoup WebRTC signaling.

Connects to the backend's main namespace and handles the standard
mediasoup consumer flow: get-rtp-capabilities, create-recv-transport,
connect-recv-transport, consume-stream, resume-consumer.
"""

import socketio
import threading
import urllib3
from typing import Callable, Optional

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class SignalingClient:
    """Client for mediasoup WebRTC signaling over Socket.io.

    Connects to the backend's main namespace ('/') and provides
    methods for the standard consumer flow using ack callbacks.
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

    def emit_ack(self, event: str, data=None, timeout: float = 3.0) -> dict:
        """Emit an event and wait for the ack response.

        Uses threading.Event to wait properly without busy-sleeping.
        """
        result = {}
        done = threading.Event()

        def _ack(data):
            nonlocal result
            result = data
            done.set()

        self.sio.emit(event, data, callback=_ack)
        done.wait(timeout=timeout)
        return result

    def disconnect(self):
        """Disconnect from the backend."""
        self._connected = False
        self.sio.disconnect()

    @property
    def connected(self) -> bool:
        return self._connected
