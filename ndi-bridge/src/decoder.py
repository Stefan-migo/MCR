import av
from typing import Optional


class H264Decoder:
    """PyAV-based H.264 decoder for depacketized NAL units.

    Creates an ffmpeg CodecContext for H.264, feeds NAL unit bytes,
    and yields decoded av.VideoFrame objects. Handles decode errors
    gracefully by logging and skipping the offending packet.
    """

    def __init__(self, codec_params: Optional[dict] = None):
        self.codec = av.CodecContext.create("h264", "r")
        self._frame_count = 0

    def decode(self, nal_data: bytes):
        """Feed a NAL unit to the decoder and yield decoded frames.

        Parameters
        ----------
        nal_data : bytes
            Complete H.264 NAL unit (including the NAL header byte).

        Yields
        ------
        av.VideoFrame
            Decoded video frames when a picture is complete.
        """
        try:
            packet = av.Packet(nal_data)
            frames = self.codec.decode(packet)
            for frame in frames:
                self._frame_count += 1
                yield frame
        except Exception as e:
            print(f"[Decoder] Error decoding packet: {e}")

    def flush(self):
        """Flush any remaining frames from the decoder."""
        try:
            frames = self.codec.decode(None)
            for frame in frames:
                yield frame
        except Exception:
            pass

    @property
    def frames_decoded(self) -> int:
        return self._frame_count
