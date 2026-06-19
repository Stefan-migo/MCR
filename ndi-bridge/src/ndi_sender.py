import numpy as np
import NDIlib as ndi
from typing import Optional


_ndi_initialized = False


def ndi_init():
    """Initialize NDI SDK once (call from main thread before creating senders).

    Runs destroy + initialize to reset any stale state from crashed runs.
    """
    global _ndi_initialized
    if _ndi_initialized:
        return
    # Clean up any stale NDI state from previous crashed processes
    ndi.destroy()
    if not ndi.initialize():
        raise RuntimeError("Failed to initialize NDI")
    _ndi_initialized = True
    print("[NDI] SDK initialized")


def ndi_shutdown():
    """Shut down NDI SDK once (call from main thread on exit)."""
    global _ndi_initialized
    if not _ndi_initialized:
        return
    ndi.destroy()
    _ndi_initialized = False
    print("[NDI] SDK shut down")


class NdiSender:
    """NDI source that pushes BGRA-format frames at a fixed resolution.

    Creates an NDI sender with the given source name, converts incoming
    frames to BGRA if necessary, and pushes them via NDIlib.
    The output resolution is locked to the first frame received — subsequent
    frames at different resolutions are resized to match. This prevents
    resolution changes during streaming (common on Android with dynamic
    encoder adjustments or simulcast layer switches).

    Note: Call ndi_init() once before creating any senders.
    """

    def __init__(self, source_name: str):
        self.source_name = source_name
        self._send = None
        self._fixed_w: Optional[int] = None
        self._fixed_h: Optional[int] = None

    def initialize(self):
        """Create the NDI source. Must be called before send_frame()."""
        import time
        send_desc = ndi.SendCreate()
        send_desc.ndi_name = self.source_name
        send_desc.clock_video = True
        send_desc.clock_audio = False

        self._send = ndi.send_create(send_desc)
        # Retry once: NDI SDK on Windows can transiently fail send_create
        # after a previous sender was destroyed on the same process.
        if not self._send:
            time.sleep(0.2)
            self._send = ndi.send_create(send_desc)

        if not self._send:
            raise RuntimeError(f"Failed to create NDI source: {self.source_name}")

        print(f"[NDI] Created source: {self.source_name}")

    def send_frame(
        self,
        frame: np.ndarray,
        width: int,
        height: int,
        fps: float = 30.0,
    ):
        """Encode and send a video frame via NDI at fixed resolution.

        The output resolution is locked on the first frame. If the incoming
        frame has a different resolution, it is resized to match using
        Lanczos interpolation before sending. This ensures the NDI source
        never changes size during streaming.

        Parameters
        ----------
        frame : np.ndarray
            RGB or BGRA image data (H x W x 3 or H x W x 4).
        width : int
            Frame width in pixels.
        height : int
            Frame height in pixels.
        fps : float
            Target frame rate (used for NDI frame-rate metadata).
        """
        if self._send is None:
            return

        # Convert to BGRA if needed
        if frame.shape[2] == 3:
            bgra = np.zeros((height, width, 4), dtype=np.uint8)
            bgra[:, :, :3] = frame[:, :, ::-1]  # RGB → BGR
            bgra[:, :, 3] = 255
        else:
            bgra = frame

        # Lock output resolution to the first frame received
        if self._fixed_w is None:
            self._fixed_w = width
            self._fixed_h = height
            print(f"[NDI] Resolution locked: {width}x{height}")
        elif width != self._fixed_w or height != self._fixed_h:
            # Resize frame to the locked resolution using Pillow (Lanczos)
            from PIL import Image
            img = Image.frombuffer('RGBA', (width, height), bgra, 'raw', 'BGRA', 0, 1)
            img = img.resize((self._fixed_w, self._fixed_h), Image.LANCZOS)
            bgra = np.array(img, dtype=np.uint8)
            # Pillow returns RGBA — swap R and B channels back to BGRA
            bgra[:, :, [0, 2]] = bgra[:, :, [2, 0]]
            width, height = self._fixed_w, self._fixed_h

        video_frame = ndi.VideoFrameV2()
        video_frame.data = bgra
        video_frame.FourCC = ndi.FOURCC_VIDEO_TYPE_BGRA
        video_frame.xres = width
        video_frame.yres = height
        video_frame.frame_rate_D = 1001
        video_frame.frame_rate_N = int(fps * 1001)
        video_frame.picture_aspect_ratio = width / height

        ndi.send_send_video_v2(self._send, video_frame)

    def send_black(self):
        """Send a single black frame to clear the frozen frame from NDI receivers.

        Uses the locked resolution if available, falls back to 1920x1080.
        No blocking — single shot, returns immediately.
        """
        if not self._send:
            return
        w = self._fixed_w or 1920
        h = self._fixed_h or 1080
        black = np.zeros((h, w, 4), dtype=np.uint8)
        black[:, :, 3] = 255
        vf = ndi.VideoFrameV2()
        vf.data = black
        vf.FourCC = ndi.FOURCC_VIDEO_TYPE_BGRA
        vf.xres = w
        vf.yres = h
        ndi.send_send_video_v2(self._send, vf)

    def destroy(self):
        """Clean up the NDI source."""
        if self._send:
            ndi.send_destroy(self._send)
            self._send = None
            print(f"[NDI] Destroyed source: {self.source_name}")
