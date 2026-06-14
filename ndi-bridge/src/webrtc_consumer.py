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
        """Start the WebRTC connection (must be called from a thread).

        Creates the PC, sets up the SDP, extracts the DTLS fingerprint
        synchronously. Frame receive runs in the same loop.
        """
        self._running = True
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

        try:
            self._loop.run_until_complete(self._setup(transport_params))
        except Exception as e:
            print(f"[WebRTC] Setup error: {e}")
            import traceback
            traceback.print_exc()
            return

        # Run the event loop forever (handles ICE/DTLS + frames)
        try:
            self._loop.run_forever()
        except Exception as e:
            if self._running:
                print(f"[WebRTC] Loop error: {e}")

    async def _setup(self, transport_params: dict):
        """Set up the WebRTC connection (synchronous part)."""
        from aiortc import RTCPeerConnection, RTCSessionDescription

        self.pc = RTCPeerConnection()

        # Log connection state changes
        @self.pc.on("iceconnectionstatechange")
        def on_ice_state():
            print(f"[WebRTC] ICE state: {self.pc.iceConnectionState}")

        @self.pc.on("connectionstatechange")
        def on_conn_state():
            print(f"[WebRTC] Connection state: {self.pc.connectionState}")

        # Add a recvonly video transceiver
        self.pc.addTransceiver("video", direction="recvonly")

        # Handle incoming video track
        @self.pc.on("track")
        def on_track(track):
            print(f"[WebRTC] Received {track.kind} track")
            if track.kind == "video":
                self._track = track
                self._loop.create_task(self._receive_frames(track))

        # Build a remote SDP from mediasoup's transport params.
        # In mediasoup consuming flow, the server is the offerer.
        remote_sdp = build_remote_sdp(
            ice_ufrag=transport_params["iceParameters"]["usernameFragment"],
            ice_pwd=transport_params["iceParameters"]["password"],
            ice_candidates=transport_params["iceCandidates"],
            dtls_fingerprint=transport_params["dtlsParameters"]["fingerprints"][0],
            dtls_role="passive",
        )

        # Set server's transport as the remote offer
        await self.pc.setRemoteDescription(
            RTCSessionDescription(sdp=remote_sdp, type="offer"),
        )

        # Create our answer (we're the DTLS active/client)
        answer = await self.pc.createAnswer()
        await self.pc.setLocalDescription(answer)

        # Extract our DTLS fingerprint from the local SDP (our answer)
        self.local_fingerprint = extract_dtls_fingerprint(
            self.pc.localDescription.sdp,
        )
        print(f"[WebRTC] Local fingerprint: {self.local_fingerprint}")

        # Log certificate fingerprint for debugging DTLS
        try:
            from hashlib import sha256
            from OpenSSL.crypto import dump_certificate, FILETYPE_ASN1
            if hasattr(self.pc, '_certificate') and self.pc._certificate:
                cert_der = dump_certificate(FILETYPE_ASN1, self.pc._certificate.x509)
                cert_fp = sha256(cert_der).hexdigest().upper()
                fp_str = ':'.join(cert_fp[i:i+2] for i in range(0, len(cert_fp), 2))
                sdp_fp = (self.local_fingerprint or '').split(' ')[-1]
                print(f"[WebRTC] Cert fingerprint: {fp_str}")
                print(f"[WebRTC] SDP fingerprint:   {sdp_fp}")
                print(f"[WebRTC] Match: {fp_str == sdp_fp}")
        except Exception as e:
            print(f"[WebRTC] Cert logging skipped: {e}")

        print(f"[WebRTC] Setup complete, waiting for ICE/DTLS...")
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
