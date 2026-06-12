import numpy as np
import NDIlib as ndi
from typing import Optional


class NdiSender:
    """NDI source that pushes BGRA-format frames.

    Creates an NDI sender with the given source name, converts incoming
    frames to BGRA if necessary, and pushes them via NDIlib.
    """

    def __init__(self, source_name: str):
        self.source_name = source_name
        self._send: Optional[ndi.send_instance_t] = None

    def initialize(self):
        """Create the NDI source. Must be called before send_frame()."""
        if not ndi.initialize():
            raise RuntimeError("Failed to initialize NDI")

        send_desc = ndi.send_create_t()
        send_desc.ndi_name = self.source_name
        send_desc.clock_video = True
        send_desc.clock_audio = False

        self._send = ndi.send_create(send_desc)
        if not self._send:
            ndi.destroy()
            raise RuntimeError(f"Failed to create NDI source: {self.source_name}")

        print(f"[NDI] Created source: {self.source_name}")

    def send_frame(
        self,
        frame: np.ndarray,
        width: int,
        height: int,
        fps: float = 30.0,
    ):
        """Encode and send a video frame via NDI.

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

        video_frame = ndi.VideoFrameV2()
        video_frame.data = bgra
        video_frame.FourCC = ndi.FOURCC_VIDEO_TYPE_BGRA
        video_frame.xres = width
        video_frame.yres = height
        video_frame.frame_rate_D = 1001
        video_frame.frame_rate_N = int(fps * 1001)
        video_frame.picture_aspect_ratio = width / height

        ndi.send_send_video_v2(self._send, video_frame)

    def destroy(self):
        """Clean up the NDI source."""
        if self._send:
            ndi.send_destroy(self._send)
            self._send = None
            print(f"[NDI] Destroyed source: {self.source_name}")
