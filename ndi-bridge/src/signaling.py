"""Asynchronous Socket.io client for mediasoup WebRTC signaling."""

import asyncio
import socketio
import urllib3
from typing import Callable, Optional

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class AsyncSignalingClient:
    """Async Socket.io client for the mediasoup consumer flow."""

    def __init__(self, backend_url: str, ssl_verify: bool = True):
        import requests as req_lib
        http_session = req_lib.Session()
        if not ssl_verify:
            http_session.verify = False
        self.sio = socketio.AsyncClient(http_session=http_session, logger=False)
        self.backend_url = backend_url.rstrip("/")
        self._connected = False

    def on(self, event: str, callback: Callable):
        self.sio.on(event, callback)

    async def connect(self):
        await self.sio.connect(
            self.backend_url,
            transports=["websocket", "polling"],
        )
        self._connected = True

    async def emit_ack(self, event: str, data=None, timeout: float = 10.0) -> dict:
        """Emit and wait for ack using asyncio."""
        if not self._connected:
            return {"error": "disconnected"}

        result = {}
        done = asyncio.Event()

        def _ack(data):
            nonlocal result
            result = data
            done.set()

        await self.sio.emit(event, data, callback=_ack)
        try:
            await asyncio.wait_for(done.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return {"error": "timeout"}
        return result

    async def disconnect(self):
        self._connected = False
        await self.sio.disconnect()
