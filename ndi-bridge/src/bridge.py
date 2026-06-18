"""NDI Bridge — async entry point.

Uses asyncio + socketio.AsyncClient for reliable WebRTC signaling.
"""

import asyncio
import json
import signal
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

from .config import BridgeConfig
from .signaling import AsyncSignalingClient
from .stream_manager import AsyncStreamManager
from .ndi_sender import ndi_init, ndi_shutdown


def _start_health_check(manager: AsyncStreamManager, port: int = 9999):
    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                body = json.dumps({
                    "status": "ok",
                    "streams": len(manager.streams),
                    "uptime": round(time.time() - _start_health_check.start_time, 1),
                }).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, fmt, *args):
            pass

    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[Bridge] Health check on http://0.0.0.0:{port}/health")


_start_health_check.start_time = 0.0


async def main():
    config = BridgeConfig()

    print(f"[Bridge] Backend URL: {config.backend_url}")
    print(f"[Bridge] Max streams: {config.max_streams}")

    # Initialize NDI once from the main thread before any async/thread work
    try:
        ndi_init()
    except RuntimeError as e:
        print(f"[Bridge] Fatal: {e}")
        sys.exit(1)

    signaling = AsyncSignalingClient(config.backend_url, ssl_verify=config.ssl_verify)
    manager = AsyncStreamManager(
        signaling,
        max_streams=config.max_streams,
        source_prefix=config.source_prefix,
    )
    manager.set_loop(asyncio.get_event_loop())

    # Wire event handlers
    signaling.on("stream-started", manager.on_stream_started)
    signaling.on("stream-stopped", manager.on_stream_stopped)
    signaling.on("stream-ended", manager.on_stream_stopped)
    signaling.on("connect", lambda: (
        print("[Bridge] Connected"),
        asyncio.create_task(signaling.sio.emit("register-bridge"))
    ))
    signaling.on("disconnect", lambda: (
        print("[Bridge] Disconnected, cleaning up..."),
        manager.cleanup_all()
    ))

    # NDI control from backend (dashboard toggle)
    async def on_ndi_control(data):
        result = await manager.on_ndi_control(data)
        await signaling.sio.emit("ndi-control-result", result)

    signaling.on("ndi-control", on_ndi_control)

    # Health check
    _start_health_check.start_time = time.time()
    _start_health_check(manager)

    # Connect and auto-reconnect on disconnect
    try:
        while True:
            print(f"[Bridge] Connecting to {config.backend_url} ...")
            try:
                await signaling.connect()
                print("[Bridge] Connected. Waiting for streams...")
                await signaling.sio.wait()
            except Exception as e:
                print(f"[Bridge] Connection error: {e}")
            print("[Bridge] Disconnected. Reconnecting in 3s...")
            await asyncio.sleep(3)
    finally:
        ndi_shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Bridge] Shutdown complete")
