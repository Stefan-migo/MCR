import time
from typing import Dict, Optional

import numpy as np

from .decoder import H264Decoder
from .ndi_sender import NdiSender
from .rtp_receiver import RtpReceiver


class StreamState:
    """Holds all resources for a single active stream pipeline.

    Attributes
    ----------
    producer_id : str
        Mediasoup producer identifier.
    backend_ip : str
        Backend hostname / IP for UDP comedia handshake.
    rtp_port : int
        PlainTransport UDP port.
    source_name : str
        NDI source display name.
    receiver : RtpReceiver or None
        UDP socket receiver for this stream.
    decoder : H264Decoder or None
        H.264 decoder for this stream.
    sender : NdiSender or None
        NDI output sender for this stream.
    consumer_ready : bool
        Whether the backend has confirmed the Consumer is active.
    fps : float
        Estimated frames per second for this stream.
    _last_frame_time : float
        Timestamp of the last frame sent (for pacing).
    """

    def __init__(
        self,
        producer_id: str,
        backend_ip: str,
        rtp_port: int,
        source_name: str,
    ):
        self.producer_id = producer_id
        self.backend_ip = backend_ip
        self.rtp_port = rtp_port
        self.source_name = source_name
        self.receiver: Optional[RtpReceiver] = None
        self.decoder: Optional[H264Decoder] = None
        self.sender: Optional[NdiSender] = None
        self.consumer_ready = False
        self.fps: float = 30.0
        self._last_frame_time: float = 0.0


class StreamManager:
    """Orchestrates per-stream lifecycle: start → comedia → consume → NDI → stop.

    Enforces max_streams limit. Tracks all active streams in a dict keyed by
    producer_id. Each stream follows:
        1. RtpReceiver created, dummy packet sent (comedia handshake)
        2. consume-stream event emitted to backend
        3. NdiSender created for output
        4. On stop: receiver/sender cleaned up
    """

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

    # ------------------------------------------------------------------
    # Event handlers (called from bridge.py wiring)
    # ------------------------------------------------------------------

    def on_stream_started(self, data: dict):
        """Handle a new stream from the backend.

        Creates UDP receiver, sends comedia handshake, requests consumer,
        and creates NDI source.
        """
        producer_id = data.get("producerId")
        if not producer_id:
            print("[Manager] stream-started missing producerId")
            return

        if len(self.streams) >= self.max_streams:
            print(f"[Manager] Max streams ({self.max_streams}) reached, skipping {producer_id}")
            return

        rtp_port = data.get("rtpEndpoint", {}).get("port")
        if not rtp_port:
            print(f"[Manager] stream-started missing rtpEndpoint.port for {producer_id}")
            return

        backend_ip = "127.0.0.1"  # overridden in bridge.py if needed
        source_name = f"{self.source_prefix}{producer_id[:8]}"

        state = StreamState(producer_id, backend_ip, rtp_port, source_name)
        self.streams[producer_id] = state

        # Create UDP receiver (backend will connect() to us explicitly)
        receiver = RtpReceiver()
        state.receiver = receiver

        # Start receiving RTP packets
        receiver.start(lambda nal: self._on_nal_unit(producer_id, nal))

        # Request Consumer from backend, passing our UDP listening IP and port
        bridge_port = receiver.local_port
        bridge_ip = "127.0.0.1"
        self.signaling.emit_consume_stream(producer_id, rtp_port=bridge_port, rtp_ip=bridge_ip)
        print(f"[Manager] Consume-stream requested for {producer_id} (bridge at {bridge_ip}:{bridge_port})")

        # Create H.264 decoder for this stream
        state.decoder = H264Decoder()

        # Create NDI source
        sender = NdiSender(source_name)
        try:
            sender.initialize()
            state.sender = sender
        except Exception as e:
            print(f"[Manager] Failed to create NDI source for {producer_id}: {e}")

    def on_stream_stopped(self, data: dict):
        """Handle stream stop — clean up all resources."""
        producer_id = data.get("producerId")
        if producer_id:
            self.remove_stream(producer_id)

    def on_consumer_ready(self, data: dict):
        """Mark a stream as ready — backend Consumer is active."""
        producer_id = data.get("producerId")
        state = self.streams.get(producer_id)
        if state:
            state.consumer_ready = True
            print(f"[Manager] Consumer ready for {producer_id}")

    def on_consumer_closed(self, data: dict):
        """Handle consumer closed by backend — clean up the stream."""
        producer_id = data.get("producerId")
        if producer_id:
            print(f"[Manager] Consumer closed for {producer_id}")
            self.remove_stream(producer_id)

    # ------------------------------------------------------------------
    # RTP → NDI pipeline
    # ------------------------------------------------------------------

    def _on_nal_unit(self, producer_id: str, nal: dict):
        """Callback from RtpReceiver: feed NAL to decoder, send frame to NDI.

        Receives depacketized H.264 NAL unit data, feeds it through
        H264Decoder (PyAV), converts decoded frames to BGRA, and
        pushes them to the NDI sender.
        """
        state = self.streams.get(producer_id)
        if not state or not state.consumer_ready:
            return
        if not state.decoder or not state.sender:
            return

        try:
            nal_data = nal.get("data", b"")
            if not nal_data:
                return

            if not hasattr(state, '_nal_count'):
                state._nal_count = 0
            state._nal_count += 1
            if state._nal_count % 100 == 0:
                print(f"[Pipeline] {producer_id}: received {state._nal_count} NALs, "
                      f"decoded {state.decoder.frames_decoded} frames")

            # Decode NAL → VideoFrame(s)
            frame_count = 0
            for frame in state.decoder.decode(nal_data):
                frame_count += 1
                # Convert decoded frame (YUV) to BGRA numpy array
                img = frame.to_ndarray(format="bgr24")

                # Skip if frame pacing says it's too soon
                now = time.time()
                min_interval = 1.0 / max(state.fps, 1.0)
                if now - state._last_frame_time < min_interval * 0.8:
                    continue

                # Send via NDI
                state.sender.send_frame(
                    frame=img,
                    width=frame.width,
                    height=frame.height,
                    fps=state.fps,
                )
                state._last_frame_time = now

            if state._nal_count == 1:
                print(f"[Pipeline] {producer_id}: first NAL processed, frames decoded this packet: {frame_count}")

        except Exception as e:
            print(f"[Pipeline] Error processing NAL for {producer_id}: {e}")
            import traceback
            traceback.print_exc()

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    def remove_stream(self, producer_id: str):
        """Remove a stream and free all its resources."""
        state = self.streams.pop(producer_id, None)
        if not state:
            return

        if state.receiver:
            state.receiver.stop()
        if state.sender:
            state.sender.destroy()

        print(f"[Manager] Removed stream: {producer_id}")

    def cleanup_all(self):
        """Remove and clean up every active stream."""
        for pid in list(self.streams.keys()):
            self.remove_stream(pid)
