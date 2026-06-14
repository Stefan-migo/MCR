import socketio
import threading
import urllib3
from typing import Callable, Optional

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class SignalingClient:
    """Client for mediasoup WebRTC signaling over Socket.io."""

    def __init__(self, backend_url: str, ssl_verify: bool = True):
        import requests as req_lib
        http_session = req_lib.Session()
        if not ssl_verify:
            http_session.verify = False
        self.sio = socketio.Client(http_session=http_session, logger=False)
        self.backend_url = backend_url.rstrip("/")
        self._connected = False

    def on(self, event: str, callback: Callable):
        self.sio.on(event, callback)

    def connect(self):
        self.sio.connect(
            self.backend_url,
            transports=["websocket", "polling"],
        )
        self._connected = True

    def emit_ack(self, event: str, data=None, timeout: float = 10.0) -> dict:
        """Emit an event and wait for the ack callback.

        NOTE: Must be called from a BACKGROUND thread, not from the
        Socket.io event handler thread, to avoid blocking heartbeats.
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
        self._connected = False
        self.sio.disconnect()

    @property
    def connected(self) -> bool:
        return self._connected
