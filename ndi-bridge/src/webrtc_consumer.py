"""WebRTC consumer — receives H.264 video via mediasoup WebRTC.

Builds an RTCPeerConnection from mediasoup's transport parameters,
receives the video track via aiortc, and yields decoded frames.
"""

import asyncio
import logging
import threading
from typing import Callable, Optional

import numpy as np

from .sdp_builder import build_remote_sdp, extract_dtls_fingerprint

# Quiet aiortc logging — no per-packet debug spew.
# Suppress H264 decoder failures — PyAV 16 compatibility issue on Python 3.14
logging.basicConfig(level=logging.WARNING, format="[aiortc] %(name)s %(message)s")
aiortc_logger = logging.getLogger("aiortc")
aiortc_logger.setLevel(logging.WARNING)
logging.getLogger("aiortc.codecs.h264").setLevel(logging.ERROR)
logging.getLogger("aiortc.rtcrtpreceiver").setLevel(logging.ERROR)


class WebRtcConsumer:
    """Receives decoded frames from a mediasoup WebRTC stream.

    Connects to a mediasoup WebRtcTransport using aiortc,
    receives H.264 frames, decodes them (aiortc handles RTP/decoding),
    and calls on_frame with BGRA numpy arrays.
    """

    def __init__(self, source_name: str, on_frame: Callable):
        self.source_name = source_name
        self.on_frame = on_frame
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._track = None
        self.local_fingerprint: Optional[str] = None
        self.pc = None
        self._pending_track = None  # track that arrived before loop was ready

    async def _connect(self, transport_params: dict):
        """Connect to the mediasoup WebRTC transport."""
        from aiortc import RTCPeerConnection, RTCSessionDescription

        self.pc = RTCPeerConnection()

        # Add a recvonly video transceiver
        self.pc.addTransceiver("video", direction="recvonly")

        # Create an SDP offer to get our ICE/DTLS params
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        # Extract our DTLS fingerprint from the local SDP
        self.local_fingerprint = extract_dtls_fingerprint(
            self.pc.localDescription.sdp,
        )
        print(f"[WebRTC] Local DTLS fingerprint: {self.local_fingerprint}")

        # Build a remote SDP from mediasoup's transport params
        remote_sdp = build_remote_sdp(
            ice_ufrag=transport_params["iceParameters"]["usernameFragment"],
            ice_pwd=transport_params["iceParameters"]["password"],
            ice_candidates=transport_params["iceCandidates"],
            dtls_fingerprints=transport_params["dtlsParameters"]["fingerprints"],
            dtls_role="auto",
        )

        # Set as remote description (this is like the server's answer)
        await self.pc.setRemoteDescription(
            RTCSessionDescription(sdp=remote_sdp, type="answer"),
        )

        # Handle incoming video track
        @self.pc.on("track")
        def on_track(track):
            print(f"[WebRTC] Received {track.kind} track")
            if track.kind == "video":
                self._track = track
                self._loop.create_task(self._receive_frames(track))

        print(f"[WebRTC] Waiting for ICE/DTLS connection...")

    async def _receive_frames(self, track):
        """Receive decoded frames from the WebRTC video track."""
        count = 0
        first_frame = True
        while self._running:
            try:
                if first_frame:
                    print(f"[WebRTC] Waiting for first frame from track...")
                    first_frame = False
                # Longer timeout for first frame (reconnect may be slow)
                timeout = 30.0 if count == 0 else 10.0
                frame = await asyncio.wait_for(track.recv(), timeout=timeout)
                count += 1

                try:
                    img = frame.to_ndarray(format="bgra")
                except Exception as e:
                    print(f"[WebRTC] Frame convert error: {e}")
                    continue

                # Validate frame — skip corrupt decoder output (VP8 on Python 3.14)
                if img.size == 0 or img.shape[0] < 100 or img.shape[1] < 100:
                    if count <= 5:
                        print(f"[WebRTC] Skipping corrupt frame: {frame.width}x{frame.height}")
                    continue

                if count <= 3 or count % 150 == 0:
                    print(f"[WebRTC] Frame #{count}: {frame.width}x{frame.height}")

                self.on_frame({
                    "data": img,
                    "width": frame.width,
                    "height": frame.height,
                })
            except asyncio.TimeoutError:
                if count == 0:
                    print(f"[WebRTC] No first frame after 30s")
                else:
                    print(f"[WebRTC] Frame timeout ({count} received)")
            except Exception as e:
                if self._running:
                    msg = str(e)
                    if msg:
                        print(f"[WebRTC] Frame error: {msg}")
                    await asyncio.sleep(0.1)

    def setup_and_get_fingerprint(
        self, transport_params: dict, consumer_rtp_params: dict | None = None
    ) -> Optional[str]:
        """Set up the WebRTC PC, extract DTLS fingerprint (blocking, creates temp loop).

        After this returns, call start_loop() in a thread to handle ICE/DTLS/frames.

        Parameters
        ----------
        transport_params : dict
            Server transport params (iceParameters, iceCandidates, dtlsParameters).
        consumer_rtp_params : dict | None
            Consumer's rtpParameters (codecs, encodings) from mediasoup consume-stream ack.
            Used to build SDP with correct payload types.
        """
        self._running = True
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            loop.run_until_complete(self._setup(transport_params, consumer_rtp_params))
        except Exception as e:
            print(f"[WebRTC] Setup error: {e}")
            import traceback
            traceback.print_exc()
            self._running = False
            return None

        self._loop = loop
        return self.local_fingerprint

    def start_loop(self):
        """Run the event loop forever (handles ICE/DTLS + frames).

        Must be called in a background thread after setup_and_get_fingerprint().
        Processes any track that arrived before the loop was ready.
        """
        if not self._loop:
            return

        # If a track arrived early (before loop was running), start receiving now.
        # Capture track by value BEFORE scheduling to avoid race with cleanup.
        if self._pending_track:
            track = self._pending_track
            self._pending_track = None
            print(f"[WebRTC] Starting late frame reception for early track")
            asyncio.run_coroutine_threadsafe(
                self._receive_frames(track), self._loop
            )

        try:
            self._loop.run_forever()
        except Exception as e:
            if self._running:
                print(f"[WebRTC] Loop error: {e}")

    def _patch_jitter_buffer(self):
        """Reduce jitter buffer for lowest possible latency.

        aiortc 1.14.0 default: capacity=128, prefetch=4 (buffers ~133ms at 30fps).
        We set prefetch=1 (one frame = ~33ms) and capacity=16 for LAN streaming.
        """
        try:
            transceivers = self.pc._RTCPeerConnection__transceivers
            for transceiver in transceivers:
                rtp_receiver = transceiver.receiver
                jb = rtp_receiver._RTCRtpReceiver__jitter_buffer
                old_cap = jb.capacity
                old_prefetch = jb._prefetch
                jb._capacity = 32
                jb._prefetch = 2
                # Try to clear stale packets (API changed in 1.14.0, may fail)
                try:
                    jb.remove(1)  # clear 1 packet
                except Exception:
                    pass
                print(f"[WebRTC] Jitter buffer: capacity={old_cap}→32, prefetch={old_prefetch}→2")

                # Decoder: auto threads + FAST flag for minimum decode latency
                try:
                    decoder = rtp_receiver._RTCRtpReceiver__decoder
                    if hasattr(decoder, 'codec'):
                        import av
                        if isinstance(decoder.codec, av.CodecContext):
                            decoder.codec.threads = 0
                            decoder.codec.flags2 |= av.codec.context.Flags2.FAST
                            print(f"[WebRTC] Decoder: threads=0, FAST")
                except Exception as de:
                    print(f"[WebRTC] Decoder patch: {de}")
        except Exception as e:
            print(f"[WebRTC] Jitter buffer patch: {e}")

    async def _setup(self, transport_params: dict, consumer_rtp_params: dict | None = None):
        """Set up the WebRTC connection."""
        from aiortc import RTCPeerConnection, RTCSessionDescription

        self.pc = RTCPeerConnection()

        # Log connection state changes with more detail
        @self.pc.on("iceconnectionstatechange")
        def on_ice_state():
            state = self.pc.iceConnectionState
            print(f"[WebRTC] ICE state: {state}")
            if state == "failed":
                print(f"[WebRTC] [!!] ICE FAILED — local candidates may not reach server")

        @self.pc.on("connectionstatechange")
        def on_conn_state():
            state = self.pc.connectionState
            print(f"[WebRTC] Connection state: {state}")
            if state == "failed":
                print(f"[WebRTC] [!!] CONNECTION FAILED — DTLS handshake likely failed")
                print(f"[WebRTC]    Remote fingerprint sent: "
                      f"{transport_params.get('dtlsParameters', {}).get('fingerprints', [{}])[0]}")
            elif state == "connected":
                print(f"[WebRTC] [OK] CONNECTED — DTLS handshake succeeded!")

        # Also monitor ICE gathering state
        @self.pc.on("icegatheringstatechange")
        def on_ice_gathering():
            print(f"[WebRTC] ICE gathering state: {self.pc.iceGatheringState}")

        # Add a recvonly video transceiver
        self.pc.addTransceiver("video", direction="recvonly")

        # Handle incoming video track
        @self.pc.on("track")
        def on_track(track):
            print(f"[WebRTC] Received {track.kind} track from mediasoup")
            if track.kind == "video":
                self._track = track
                if self._loop:
                    self._loop.create_task(self._receive_frames(track))
                else:
                    # Track arrived before event loop started — store for later
                    print(f"[WebRTC] Track arrived early, will start receiving when loop is ready")
                    self._pending_track = track

        # Build a remote SDP from mediasoup's transport params.
        # In mediasoup consuming flow, the server is the offerer.
        # mediasoup uses ICE Lite → server is always controlling.
        # DTLS: server is passive, client (bridge) is active.
        ice_params = transport_params["iceParameters"]
        dtls_params = transport_params["dtlsParameters"]
        ice_candidates = transport_params["iceCandidates"]

        print(f"[WebRTC] Server ICE params: ufrag={ice_params['usernameFragment']}, "
              f"iceLite={ice_params.get('iceLite', True)}")
        print(f"[WebRTC] Server DTLS fingerprints: {dtls_params.get('fingerprints', [])}")
        print(f"[WebRTC] Server ICE candidates: {len(ice_candidates)}")

        # Build SDP from server transport params + consumer's real codecs
        codecs = (consumer_rtp_params or {}).get("codecs", [])
        encodings = (consumer_rtp_params or {}).get("encodings", [])
        print(f"[WebRTC] Consumer codecs for SDP: {[(c.get('mimeType'), c.get('payloadType')) for c in codecs]}")

        remote_sdp = build_remote_sdp(
            ice_ufrag=ice_params["usernameFragment"],
            ice_pwd=ice_params["password"],
            ice_candidates=ice_candidates,
            dtls_fingerprints=dtls_params["fingerprints"],
            dtls_role="passive",
            codecs=codecs if codecs else None,
            encodings=encodings if encodings else None,
        )

        print(f"[WebRTC] Remote SDP ({len(remote_sdp)} bytes):")
        for line in remote_sdp.split("\r\n"):
            if line.strip():
                print(f"[WebRTC]   {line}")

        # Set server's transport as the remote offer
        await self.pc.setRemoteDescription(
            RTCSessionDescription(sdp=remote_sdp, type="offer"),
        )
        print(f"[WebRTC] Remote description set (offer)")

        # Create our answer (we're the DTLS active/client)
        answer = await self.pc.createAnswer()
        print(f"[WebRTC] Local answer SDP ({len(answer.sdp)} bytes):")
        for line in answer.sdp.split("\r\n"):
            if line.strip():
                print(f"[WebRTC]   {line}")

        await self.pc.setLocalDescription(answer)
        print(f"[WebRTC] Local description set (answer)")

        # Extract our DTLS fingerprint from the local SDP (our answer)
        self.local_fingerprint = extract_dtls_fingerprint(answer.sdp)
        print(f"[WebRTC] Local DTLS fingerprint: {self.local_fingerprint}")

        # Patch jitter buffer for low latency (LAN streaming, near-zero jitter)
        self._patch_jitter_buffer()

        print(f"[WebRTC] Setup complete, waiting for ICE/DTLS handshake...")
        await asyncio.sleep(0.5)

    async def _close(self):
        if self.pc:
            await self.pc.close()

    def stop(self):
        self._running = False
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=3)
