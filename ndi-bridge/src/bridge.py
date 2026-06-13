"""NDI Bridge — main entry point.

Loads configuration, establishes a Socket.io connection to the backend
/ndi-bridge namespace, wires stream lifecycle event handlers, serves a
health check endpoint, and runs until SIGINT/SIGTERM.
"""

import json
import signal
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import NoReturn

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
            pass  # silence HTTP request logs

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

    signaling = SignalingClient(config.backend_url)
    manager = StreamManager(
        signaling,
        max_streams=config.max_streams,
        source_prefix=config.source_prefix,
    )

    # ------------------------------------------------------------------
    # Wire event handlers
    # ------------------------------------------------------------------

    signaling.on("stream-started", manager.on_stream_started)
    signaling.on("stream-stopped", manager.on_stream_stopped)
    signaling.on("consumer-ready", manager.on_consumer_ready)
    signaling.on("consumer-closed", manager.on_consumer_closed)
    signaling.on(
        "active-streams",
        lambda data: print(
            f"[Bridge] Active streams: {len(data.get('streams', []))}"
        ),
    )

    # Log consumer errors from the backend
    def _on_consumer_error(data: dict):
        pid = data.get("producerId", "?")
        error = data.get("error", "unknown")
        print(f"[Bridge] Consumer error for {pid}: {error}")

    signaling.on("consumer-error", _on_consumer_error)

    # Log connection lifecycle
    signaling.on(
        "connect",
        lambda: print("[Bridge] Connected to backend"),
    )
    signaling.on(
        "disconnect",
        lambda: print("[Bridge] Disconnected from backend"),
    )

    # ------------------------------------------------------------------
    # Signal handling for graceful shutdown
    # ------------------------------------------------------------------

    shutdown_requested = False

    def shutdown(sig, frame):
        nonlocal shutdown_requested
        if shutdown_requested:
            return  # already shutting down
        shutdown_requested = True
        print("\n[Bridge] Shutting down...")
        manager.cleanup_all()
        signaling.disconnect()
        print("[Bridge] Goodbye.")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # ------------------------------------------------------------------
    # Start health check HTTP server
    # ------------------------------------------------------------------

    _start_health_check.start_time = time.time()
    _start_health_check(manager)

    # ------------------------------------------------------------------
    # Connect and wait
    # ------------------------------------------------------------------

    print(f"[Bridge] Connecting to {config.backend_url}/ndi-bridge ...")
    signaling.connect()
    print("[Bridge] Connected. Waiting for streams...")

    # Block indefinitely until a signal arrives
    signal.pause()  # type: ignore[attr-defined]


if __name__ == "__main__":
    main()
