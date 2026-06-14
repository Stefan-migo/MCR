"""NDI Bridge — main entry point.

Connects to the backend's main Socket.io namespace, listens for
device events, and starts WebRTC → NDI pipelines for each
video producer.
"""

import json
import signal
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

from .config import BridgeConfig
from .signaling import SignalingClient
from .stream_manager import StreamManager


def _start_health_check(manager: StreamManager, port: int = 9999):
    """Start a lightweight HTTP health check server in a daemon thread."""

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


def main():
    config = BridgeConfig()

    print(f"[Bridge] Backend URL: {config.backend_url}")
    print(f"[Bridge] Source prefix: {config.source_prefix}")
    print(f"[Bridge] Max streams: {config.max_streams}")

    signaling = SignalingClient(config.backend_url, ssl_verify=config.ssl_verify)
    manager = StreamManager(
        signaling,
        max_streams=config.max_streams,
        source_prefix=config.source_prefix,
    )

    # Wire event handlers
    signaling.on("stream-started", manager.on_stream_started)
    signaling.on("stream-stopped", manager.on_stream_stopped)
    signaling.on("stream-ended", manager.on_stream_stopped)

    # Log connection lifecycle
    signaling.on("connect", lambda: print("[Bridge] Connected to backend"))
    signaling.on("disconnect", lambda: print("[Bridge] Disconnected"))

    # Start health check
    _start_health_check.start_time = time.time()
    _start_health_check(manager)

    # Connect to the backend's main namespace
    print(f"[Bridge] Connecting to {config.backend_url} ...")
    signaling.connect()
    print("[Bridge] Connected. Waiting for streams...")

    # Handle shutdown
    shutdown_requested = False

    def shutdown(sig, frame):
        nonlocal shutdown_requested
        if shutdown_requested:
            return
        shutdown_requested = True
        print("\n[Bridge] Shutting down...")
        manager.cleanup_all()
        signaling.disconnect()
        print("[Bridge] Goodbye.")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown)

    # Block until signal
    import threading as _threading
    _shutdown_event = _threading.Event()
    _shutdown_event.wait()


if __name__ == "__main__":
    main()
