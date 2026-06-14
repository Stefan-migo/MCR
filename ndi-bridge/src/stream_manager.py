"""Stream manager — orchestrates the WebRTC → NDI pipeline.

Manages per-stream lifecycle: wait for producer → create WebRTC consumer →
connect → consume → decode → NDI output → cleanup on stop.
"""

import threading
import time
from typing import Dict, Optional

import numpy as np

from .ndi_sender import NdiSender
from .webrtc_consumer import WebRtcConsumer


class StreamState:
    """Holds all resources for a single stream.

    Attributes
    ----------
    producer_id : str
        Mediasoup producer identifier.
    source_name : str
        NDI source display name.
    sender : NdiSender or None
        NDI output sender.
    consumer : WebRtcConsumer or None
        WebRTC consumer receiving frames.
    """

    def __init__(self, producer_id: str, source_name: str):
        self.producer_id = producer_id
        self.source_name = source_name
        self.sender: Optional[NdiSender] = None
        self.consumer: Optional[WebRtcConsumer] = None
        self._last_frame_time: float = 0.0
        self._fps: float = 30.0
        self._frame_count: int = 0


class StreamManager:
    """Orchestrates per-stream lifecycle: start → WebRTC → NDI → stop."""

    def __init__(
        self,
        signaling,
        max_streams: int = 8,
        source_prefix: str = "MCR-",
    ):
        self.streams: Dict[str, StreamState] = {}
        self.signaling = signaling
        self.max_streams = max_streams
        self.source_prefix = source_prefix
        self._rtp_capabilities: Optional[dict] = None
        self._stream_to_producer: Dict[str, str] = {}  # stream_id → producer_id

    def on_stream_started(self, data: dict):
        """Handle a new video producer — start WebRTC → NDI pipeline.

        The main namespace emits ``stream-started`` with:
            { stream: { producerId, id, clientId, deviceName, ... } }
        """
        # Extract producerId from either format (direct or nested in stream)
        producer_id = data.get("producerId")
        stream_id = None
        if not producer_id and "stream" in data:
            stream_id = data["stream"].get("id")
            producer_id = data["stream"].get("producerId") or stream_id
        if not producer_id:
            print(f"[Manager] stream-started missing producerId, data keys: {list(data.keys())}")
            return

        # Store stream_id → producer_id mapping for stream-ended events
        if stream_id:
            self._stream_to_producer[stream_id] = producer_id

        if len(self.streams) >= self.max_streams:
            print(f"[Manager] Max streams ({self.max_streams}), skipping {producer_id}")
            return

        source_name = f"{self.source_prefix}{producer_id[:8]}"
        state = StreamState(producer_id, source_name)
        self.streams[producer_id] = state

        # Get RTP capabilities if we haven't yet
        if not self._rtp_capabilities:
            caps_result = self.signaling.emit_ack("get-rtp-capabilities")
            if "rtpCapabilities" in caps_result:
                self._rtp_capabilities = caps_result["rtpCapabilities"]
                print(f"[Manager] Got RTP capabilities")
            else:
                print(f"[Manager] Failed to get RTP capabilities: {caps_result.get('error', 'unknown')}")
                self.remove_stream(producer_id)
                return

        # Create WebRTC transport on the backend
        transport_result = self.signaling.emit_ack(
            "create-recv-transport", {},
        )
        if "error" in transport_result:
            print(f"[Manager] Failed to create transport: {transport_result['error']}")
            self.remove_stream(producer_id)
            return

        transport_id = transport_result["id"]
        print(f"[Manager] Created WebRTC transport: {transport_id}")

        # First: create the Consumer on the backend (media will flow thru transport)
        consume_result = self.signaling.emit_ack(
            "consume-stream",
            {
                "transportId": transport_id,
                "producerId": producer_id,
                "rtpCapabilities": self._rtp_capabilities,
            },
        )
        if "error" in consume_result:
            print(f"[Manager] Failed to consume: {consume_result['error']}")
            self.remove_stream(producer_id)
            return
        consumer_id = consume_result.get("id")
        print(f"[Manager] Consumer created: {consumer_id}")

        # Resume the consumer so media flows
        resume_result = self.signaling.emit_ack(
            "resume-consumer",
            {"consumerId": consumer_id},
        )
        if "error" in resume_result:
            print(f"[Manager] Failed to resume consumer: {resume_result['error']}")
        else:
            print(f"[Manager] Consumer resumed")

        # Now set up the WebRTC connection to receive the media
        consumer = WebRtcConsumer(
            source_name,
            on_frame=lambda frame: self._on_frame(producer_id, frame),
        )
        consumer.start(transport_result)
        state.consumer = consumer

        if not consumer.local_fingerprint:
            print(f"[Manager] No DTLS fingerprint for {producer_id}, skipping")
            self.remove_stream(producer_id)
            return

        # Connect the WebRTC transport with our DTLS fingerprint
        dtls_params = {
            "role": "client",
            "fingerprints": [{
                "algorithm": "sha-256",
                "value": consumer.local_fingerprint,
            }],
        }
        connect_result = self.signaling.emit_ack(
            "connect-recv-transport",
            {"transportId": transport_id, "dtlsParameters": dtls_params},
        )
        if "error" in connect_result:
            print(f"[Manager] Failed to connect transport: {connect_result['error']}")
            self.remove_stream(producer_id)
            return
        print(f"[Manager] WebRTC transport connected")

        # Create NDI source
        sender = NdiSender(source_name)
        try:
            sender.initialize()
            state.sender = sender
            print(f"[NDI] Created source: {source_name}")
        except Exception as e:
            print(f"[Manager] Failed to create NDI source: {e}")

    def _on_frame(self, producer_id: str, frame: dict):
        """Callback from WebRTC consumer: send frame to NDI."""
        state = self.streams.get(producer_id)
        if not state or not state.sender:
            return

        try:
            img = frame["data"]
            width = frame["width"]
            height = frame["height"]

            # Frame pacing
            now = time.time()
            min_interval = 1.0 / max(state._fps, 1.0)
            if now - state._last_frame_time < min_interval * 0.5:
                return

            state.sender.send_frame(img, width, height, state._fps)
            state._last_frame_time = now
            state._frame_count += 1

            if state._frame_count % 150 == 0:
                print(f"[Pipeline] {producer_id}: sent {state._frame_count} frames to NDI")
        except Exception as e:
            print(f"[Pipeline] Error sending frame: {e}")

    def on_stream_stopped(self, data: dict):
        """Handle stream stop (stream-stopped or stream-ended)."""
        producer_id = data.get("producerId")
        if not producer_id:
            # stream-ended event: { streamId } — look up the producer mapping
            stream_id = data.get("streamId")
            if stream_id:
                producer_id = self._stream_to_producer.pop(stream_id, None)
        if producer_id:
            self.remove_stream(producer_id)

    def remove_stream(self, producer_id: str):
        """Remove a stream and free all resources."""
        state = self.streams.pop(producer_id, None)
        if not state:
            return

        if state.consumer:
            state.consumer.stop()
        if state.sender:
            state.sender.destroy()

        print(f"[Manager] Removed stream: {producer_id}")

    def cleanup_all(self):
        """Remove and clean up every active stream."""
        for pid in list(self.streams.keys()):
            self.remove_stream(pid)
