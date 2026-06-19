"""Async stream manager — orchestrates WebRTC → NDI pipeline."""

import asyncio
import time
from typing import Dict, Optional, Set

from .ndi_sender import NdiSender
from .webrtc_consumer import WebRtcConsumer


class StreamState:
    def __init__(self, producer_id: str, source_name: str, device_id: str = ""):
        self.producer_id = producer_id
        self.source_name = source_name
        self.device_id = device_id
        self.sender: Optional[NdiSender] = None
        self.consumer: Optional[WebRtcConsumer] = None
        self._fps: float = 30.0
        self._frame_count: int = 0
        self.paused: bool = False  # NDI sender alive but not sending frames
        # Timer-based frame sender state
        self._latest_frame: Optional[dict] = None
        self._sender_task: Optional[asyncio.Task] = None


class AsyncStreamManager:
    def __init__(self, signaling, max_streams: int = 8, source_prefix: str = "MCR-"):
        self.streams: Dict[str, StreamState] = {}
        self.signaling = signaling
        self.max_streams = max_streams
        self.source_prefix = source_prefix
        self._stream_to_producer: Dict[str, str] = {}
        self._rtp_caps: Optional[dict] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        # Persistent NDI senders keyed by deviceId — survive stream disconnects
        self._senders: Dict[str, NdiSender] = {}
        self._paused_devices: Set[str] = set()

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        """Set the asyncio event loop for background tasks."""
        self._loop = loop

    def on_stream_started(self, data: dict):
        """Handle stream-started — schedule async setup."""
        producer_id = data.get("producerId")
        stream_data = data.get("stream", {}) or {}
        if not producer_id:
            sid = stream_data.get("id")
            producer_id = stream_data.get("producerId") or sid
            if sid:
                self._stream_to_producer[sid] = producer_id
        if not producer_id:
            return

        # Extract deviceId for stable NDI naming — stable across reconnects
        device_id = stream_data.get("deviceId", "")
        if not device_id:
            print(f"[Manager] No deviceId in stream-started, falling back to producerId")
            device_id = producer_id

        if len(self.streams) >= self.max_streams:
            print(f"[Manager] Max streams reached, skipping {producer_id}")
            return
        if self._loop:
            asyncio.run_coroutine_threadsafe(
                self._setup(producer_id, device_id), self._loop
            )
        else:
            print(f"[Manager] No event loop available")

    async def _setup(self, producer_id: str, device_id: str = ""):
        """Full async setup pipeline.

        CRITICAL: consumer is created FIRST (on unconnected transport) to obtain
        actual rtpParameters. Then aiortc SDP is built from those real parameters.
        Transport is connected before resuming the consumer.
        """
        source_name = f"{self.source_prefix}{device_id[:8]}" if device_id else f"{self.source_prefix}{producer_id[:8]}"
        state = StreamState(producer_id, source_name, device_id)
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
        print(f"[Manager] Transport created: {tport_id}")

        # 3. Create Consumer FIRST (before transport connect) to get real rtpParameters.
        #    Consumer on unconnected transport = 0 packets, but we just need params.
        r = await sig.emit_ack("consume-stream", {
            "transportId": tport_id, "producerId": producer_id, "rtpCapabilities": caps,
        })
        if "id" not in r:
            print(f"[Manager] Consume error: {r}")
            self.remove_stream(producer_id)
            return
        consumer_id = r["id"]
        consumer_rtp_params = r.get("rtpParameters", {})
        codecs = consumer_rtp_params.get("codecs", [])
        print(f"[Manager] Consumer: {consumer_id}")
        print(f"[Manager] Consumer codecs: {[(c.get('mimeType'), c.get('payloadType')) for c in codecs]}")

        # 4. Setup aiortc PC → use consumer's rtpParameters for SDP
        consumer = WebRtcConsumer(source_name, on_frame=lambda f: self._on_frame(producer_id, f))
        state.consumer = consumer
        fingerprint = await asyncio.to_thread(
            consumer.setup_and_get_fingerprint, transport, consumer_rtp_params
        )
        if not fingerprint:
            print(f"[Manager] No fingerprint — setup failed")
            self.remove_stream(producer_id)
            return

        # 5. Connect transport NOW (before resuming consumer)
        fp_parts = consumer.local_fingerprint.split(" ", 1)
        cr = await sig.emit_ack("connect-recv-transport", {
            "transportId": tport_id,
            "dtlsParameters": {
                "role": "client",
                "fingerprints": [{
                    "algorithm": fp_parts[0],
                    "value": fp_parts[1] if len(fp_parts) > 1 else fp_parts[0],
                }],
            },
        })
        if "error" in cr:
            print(f"[Manager] Connect error: {cr}")
            self.remove_stream(producer_id)
            return
        print(f"[Manager] Transport connected")

        # 6. Resume consumer on now-connected transport
        await sig.emit_ack("resume-consumer", {"consumerId": consumer_id})
        print(f"[Manager] Consumer resumed")

        # 7. Start event loop in bg thread (handles ICE/DTLS + frames)
        import threading as _t
        _t.Thread(target=consumer.start_loop, daemon=True).start()

        # 8. NDI source — reuse persistent sender or create new one.
        # Sender survives stream disconnects so Resolume doesn't lose the source.
        if device_id in self._senders:
            state.sender = self._senders[device_id]
            state.paused = device_id in self._paused_devices
            if state.paused:
                print(f"[NDI] Reusing paused sender: {source_name}")
            else:
                print(f"[NDI] Reusing sender: {source_name}")
        else:
            sender = NdiSender(source_name)
            try:
                sender.initialize()
                state.sender = sender
                self._senders[device_id] = sender
                print(f"[NDI] Created: {source_name}")
            except Exception as e:
                print(f"[Manager] NDI error: {e}")

        # 9. Start timer-based frame sender (sends at consistent 30fps)
        loop = asyncio.get_event_loop()
        interval = 1.0 / 30.0  # send at 30fps
        state._sender_task = loop.create_task(self._frame_sender(producer_id, interval))

    def _on_frame(self, producer_id: str, frame: dict):
        """Store the latest frame — actual NDI send happens in _frame_sender timer."""
        state = self.streams.get(producer_id)
        if not state or not state.sender or state.paused:
            return
        state._latest_frame = frame

    async def _frame_sender(self, producer_id: str, interval: float):
        """Timer-based NDI sender — sends latest frame at fixed interval (~30fps).
        This is better than per-frame throttle because NDI SDK receives frames
        at consistent timing, avoiding encoding glitches from irregular frame bursts.
        """
        state = self.streams.get(producer_id)
        if not state:
            return
        while state in self.streams.values() and not state.paused:
            frame = state._latest_frame
            if frame and state.sender:
                try:
                    state.sender.send_frame(frame["data"], frame["width"], frame["height"], state._fps)
                    state._frame_count += 1
                    if state._frame_count % 150 == 0:
                        print(f"[Pipeline] {producer_id}: {state._frame_count} frames")
                except Exception as e:
                    print(f"[Pipeline] Send error: {e}")
            await asyncio.sleep(interval)

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
        # Cancel the timer-based frame sender
        if state._sender_task:
            state._sender_task.cancel()
            state._sender_task = None
        if state.consumer:
            state.consumer.stop()
        # Do NOT destroy the NDI sender — it survives the stream lifecycle.
        # Resolume keeps the source visible (no signal) until the stream
        # reconnects and reuses the same sender.
        print(f"[Manager] Removed stream: {producer_id} (NDI sender kept alive)")

    async def on_ndi_control(self, data: dict) -> dict:
        """Handle NDI control event — enable/disable the NDI source.

        Toggle OFF destroys the NDI sender so the source disappears from
        Resolume/OBS entirely. Toggle ON recreates it.
        """
        device_id = data.get("deviceId")
        producer_id = data.get("producerId")
        enabled = data.get("enabled", True)

        if not device_id and not producer_id:
            return {"error": "deviceId or producerId required"}

        # Find stream state by deviceId or producerId
        state = next(
            (s for s in self.streams.values()
             if (device_id and s.device_id == device_id) or s.producer_id == producer_id),
            None
        )

        if enabled:
            self._paused_devices.discard(device_id)
            if state:
                state.paused = False
                # Restart the frame sender if it exited
                if not state._sender_task or state._sender_task.done():
                    loop = asyncio.get_event_loop()
                    interval = 1.0 / 30.0
                    state._sender_task = loop.create_task(
                        self._frame_sender(state.producer_id, interval)
                    )
                # Reuse or create persistent sender
                if device_id in self._senders:
                    state.sender = self._senders[device_id]
                else:
                    sender = NdiSender(state.source_name)
                    try:
                        sender.initialize()
                        state.sender = sender
                        self._senders[device_id] = sender
                    except Exception as e:
                        return {"deviceId": device_id, "active": False, "error": str(e)}
                print(f"[NDI] Resumed: {state.source_name}")
            else:
                print(f"[NDI] Resume queued for {device_id} (no active stream)")
            source_name = self._senders[device_id].source_name if device_id in self._senders else ""
            return {"deviceId": device_id, "active": True, "sourceName": source_name}
        else:
            # Destroy the NDI sender so the source disappears from Resolume/OBS
            self._paused_devices.add(device_id)
            if state:
                state.paused = True
            # Destroy persistent sender and remove from tracking
            if device_id in self._senders:
                try:
                    self._senders[device_id].destroy()
                except Exception:
                    pass
                del self._senders[device_id]
                print(f"[NDI] Destroyed sender for {device_id}")
            if state and state.sender:
                state.sender = None
            print(f"[NDI] Disabled: {device_id}")
            return {"deviceId": device_id, "active": False, "sourceName": None}

    def cleanup_all(self):
        for pid in list(self.streams.keys()):
            self.remove_stream(pid)
        # Destroy all persistent NDI senders (bridge disconnect = full cleanup)
        for device_id, sender in list(self._senders.items()):
            sender.destroy()
        self._senders.clear()
        self._paused_devices.clear()
