"""WebRTC consumer — receives H.264 video via mediasoup WebRTC.

Builds an RTCPeerConnection from mediasoup's transport parameters,
receives the video track via aiortc, and yields decoded frames.
"""

import asyncio
import threading
from typing import Callable, Optional

import numpy as np

from .sdp_builder import build_remote_sdp, extract_dtls_fingerprint


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
            dtls_fingerprint=transport_params["dtlsParameters"]["fingerprints"][0],
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
        while self._running:
            try:
                frame = await track.recv()
                count += 1

                img = frame.to_ndarray(format="bgr24")

                if count <= 3 or count % 150 == 0:
                    print(f"[WebRTC] Frame #{count}: {frame.width}x{frame.height}")

                self.on_frame({
                    "data": img,
                    "width": frame.width,
                    "height": frame.height,
                })
            except Exception as e:
                if self._running:
                    print(f"[WebRTC] Frame error: {e}")
                    await asyncio.sleep(0.1)

    def start(self, transport_params: dict):
        """Start the WebRTC connection.

        Creates the PC, offer, and extracts the DTLS fingerprint
        synchronously (blocking). The frame receive loop runs in a
        background thread.
        
        After this returns, ``local_fingerprint`` is available.
        """
        self._running = True
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

        # Synchonous setup: create PC, offer, export fingerprint
        try:
            self._loop.run_until_complete(self._setup(transport_params))
        except Exception as e:
            print(f"[WebRTC] Setup error: {e}")
            import traceback
            traceback.print_exc()
            return

        # Frame receive runs in background
        self._thread = threading.Thread(
            target=self._loop.run_forever, daemon=True,
        )
        self._thread.start()

    async def _setup(self, transport_params: dict):
        """Set up the WebRTC connection (synchronous part)."""
        from aiortc import RTCPeerConnection, RTCSessionDescription

        self.pc = RTCPeerConnection()

        # Add a recvonly video transceiver
        self.pc.addTransceiver("video", direction="recvonly")

        # Handle incoming video track
        @self.pc.on("track")
        def on_track(track):
            print(f"[WebRTC] Received {track.kind} track")
            if track.kind == "video":
                self._track = track
                self._loop.create_task(self._receive_frames(track))

        # Create an SDP offer to get our ICE/DTLS params
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        # Extract our DTLS fingerprint from the local SDP
        self.local_fingerprint = extract_dtls_fingerprint(
            self.pc.localDescription.sdp,
        )
        print(f"[WebRTC] Local fingerprint: {self.local_fingerprint}")

        # Build a remote SDP from mediasoup's transport params
        # aiortc acts as the DTLS client ("active")
        remote_sdp = build_remote_sdp(
            ice_ufrag=transport_params["iceParameters"]["usernameFragment"],
            ice_pwd=transport_params["iceParameters"]["password"],
            ice_candidates=transport_params["iceCandidates"],
            dtls_fingerprint=transport_params["dtlsParameters"]["fingerprints"][0],
            dtls_role="passive",  # server is passive (actpass), client is active
        )

        # Set as remote description (the server's transport acts as the answer)
        await self.pc.setRemoteDescription(
            RTCSessionDescription(sdp=remote_sdp, type="answer"),
        )

        print(f"[WebRTC] Connection setup complete")

    async def _close(self):
        if self.pc:
            await self.pc.close()

    def stop(self):
        self._running = False
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join(timeout=3)
