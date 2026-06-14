"""Async stream manager — orchestrates WebRTC → NDI pipeline."""

import asyncio
import time
from typing import Dict, Optional

from .ndi_sender import NdiSender
from .webrtc_consumer import WebRtcConsumer


class StreamState:
    def __init__(self, producer_id: str, source_name: str):
        self.producer_id = producer_id
        self.source_name = source_name
        self.sender: Optional[NdiSender] = None
        self.consumer: Optional[WebRtcConsumer] = None
        self._last_frame_time: float = 0.0
        self._fps: float = 30.0
        self._frame_count: int = 0


class AsyncStreamManager:
    def __init__(self, signaling, max_streams: int = 8, source_prefix: str = "MCR-"):
        self.streams: Dict[str, StreamState] = {}
        self.signaling = signaling
        self.max_streams = max_streams
        self.source_prefix = source_prefix
        self._stream_to_producer: Dict[str, str] = {}
        self._rtp_caps: Optional[dict] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        """Set the asyncio event loop for background tasks."""
        self._loop = loop

    def on_stream_started(self, data: dict):
        """Handle stream-started — schedule async setup."""
        producer_id = data.get("producerId")
        if not producer_id and "stream" in data:
            sid = data["stream"].get("id")
            producer_id = data["stream"].get("producerId") or sid
            if sid:
                self._stream_to_producer[sid] = producer_id
        if not producer_id:
            return
        if len(self.streams) >= self.max_streams:
            print(f"[Manager] Max streams reached, skipping {producer_id}")
            return
        if self._loop:
            asyncio.run_coroutine_threadsafe(self._setup(producer_id), self._loop)
        else:
            print(f"[Manager] No event loop available")

    async def _setup(self, producer_id: str):
        """Full async setup pipeline."""
        source_name = f"{self.source_prefix}{producer_id[:8]}"
        state = StreamState(producer_id, source_name)
        self.streams[producer_id] = state

        sig = self.signaling

        # 1. Get RTP capabilities
        caps = self._rtp_caps
        if not caps:
            r = await sig.emit_ack("get-rtp-capabilities")
            if "rtpCapabilities" in r:
                self._rtp_caps = caps = r["rtpCapabilities"]
                print(f"[Manager] Got RTP capabilities")
            else:
                print(f"[Manager] No RTP caps: {r}")
                self.remove_stream(producer_id)
                return

        # 2. Create WebRTC transport
        transport = await sig.emit_ack("create-recv-transport")
        if "id" not in transport:
            print(f"[Manager] Transport error: {transport}")
            self.remove_stream(producer_id)
            return
        tport_id = transport["id"]
        print(f"[Manager] Created transport: {tport_id}")

        # 3. Create Consumer
        r = await sig.emit_ack("consume-stream", {
            "transportId": tport_id, "producerId": producer_id, "rtpCapabilities": caps,
        })
        if "id" not in r:
            print(f"[Manager] Consume error: {r}")
            self.remove_stream(producer_id)
            return
        consumer_id = r["id"]
        print(f"[Manager] Consumer: {consumer_id}")

        # 4. Resume
        await sig.emit_ack("resume-consumer", {"consumerId": consumer_id})
        print(f"[Manager] Consumer resumed")

        # 5. WebRTC consumer (aiortc)
        consumer = WebRtcConsumer(source_name, on_frame=lambda f: self._on_frame(producer_id, f))
        consumer.start(transport)
        state.consumer = consumer

        if not consumer.local_fingerprint:
            print(f"[Manager] No fingerprint")
            self.remove_stream(producer_id)
            return

        # 6. Connect transport
        fp = consumer.local_fingerprint.split(" ", 1)
        cr = await sig.emit_ack("connect-recv-transport", {
            "transportId": tport_id,
            "dtlsParameters": {
                "role": "client",
                "fingerprints": [{"algorithm": fp[0], "value": fp[1] if len(fp) > 1 else fp[0]}],
            },
        })
        if "error" in cr:
            print(f"[Manager] Connect error: {cr}")
            self.remove_stream(producer_id)
            return
        print(f"[Manager] Transport connected")

        # 7. NDI source
        sender = NdiSender(source_name)
        try:
            sender.initialize()
            state.sender = sender
            print(f"[NDI] Created: {source_name}")
        except Exception as e:
            print(f"[Manager] NDI error: {e}")

    def _on_frame(self, producer_id: str, frame: dict):
        state = self.streams.get(producer_id)
        if not state or not state.sender:
            return
        try:
            now = time.time()
            interval = 1.0 / max(state._fps, 1.0)
            if now - state._last_frame_time < interval * 0.5:
                return
            state.sender.send_frame(frame["data"], frame["width"], frame["height"], state._fps)
            state._last_frame_time = now
            state._frame_count += 1
            if state._frame_count % 150 == 0:
                print(f"[Pipeline] {producer_id}: {state._frame_count} frames")
        except Exception as e:
            print(f"[Pipeline] Error: {e}")

    def on_stream_stopped(self, data: dict):
        producer_id = data.get("producerId")
        if not producer_id:
            sid = data.get("streamId")
            if sid:
                producer_id = self._stream_to_producer.pop(sid, None)
        if producer_id:
            self.remove_stream(producer_id)

    def remove_stream(self, producer_id: str):
        state = self.streams.pop(producer_id, None)
        if not state:
            return
        if state.consumer:
            state.consumer.stop()
        if state.sender:
            state.sender.destroy()
        print(f"[Manager] Removed: {producer_id}")

    def cleanup_all(self):
        for pid in list(self.streams.keys()):
            self.remove_stream(pid)
