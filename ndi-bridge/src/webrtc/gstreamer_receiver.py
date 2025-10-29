"""
GStreamer-based RTP receiver as fallback for aiortc
More robust for production environments
"""

import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import numpy as np
import logging
from typing import Optional, Callable

logger = logging.getLogger(__name__)

Gst.init(None)

class GStreamerRTPReceiver:
    """
    Alternative RTP receiver using GStreamer
    Automatically falls back if aiortc fails
    """
    
    def __init__(
        self, 
        stream_id: str,
        transport_ip: str,
        transport_port: int,
        codec: str = "VP8",
        on_frame: Optional[Callable] = None
    ):
        self.stream_id = stream_id
        self.transport_ip = transport_ip
        self.transport_port = transport_port
        self.codec = codec
        self.on_frame = on_frame
        
        self.pipeline: Optional[Gst.Pipeline] = None
        self.mainloop: Optional[GLib.MainLoop] = None
        self.is_running = False
        
    async def start(self) -> bool:
        """Start GStreamer RTP reception"""
        try:
            # Build GStreamer pipeline based on codec
            if self.codec.upper() == "VP8":
                pipeline_str = (
                    f"udpsrc port={self.transport_port} "
                    f"! application/x-rtp,media=video,encoding-name=VP8 "
                    f"! rtpvp8depay "
                    f"! vp8dec "
                    f"! videoconvert "
                    f"! video/x-raw,format=BGR "
                    f"! appsink name=sink emit-signals=true"
                )
            elif self.codec.upper() == "H264":
                pipeline_str = (
                    f"udpsrc port={self.transport_port} "
                    f"! application/x-rtp,media=video,encoding-name=H264 "
                    f"! rtph264depay "
                    f"! h264parse "
                    f"! avdec_h264 "
                    f"! videoconvert "
                    f"! video/x-raw,format=BGR "
                    f"! appsink name=sink emit-signals=true"
                )
            else:
                raise ValueError(f"Unsupported codec: {self.codec}")
            
            logger.info(f"GStreamer pipeline: {pipeline_str}")
            
            self.pipeline = Gst.parse_launch(pipeline_str)
            
            # Get appsink and connect signal
            appsink = self.pipeline.get_by_name("sink")
            appsink.connect("new-sample", self._on_new_sample)
            
            # Start pipeline
            self.pipeline.set_state(Gst.State.PLAYING)
            self.is_running = True
            
            logger.info(f"✅ GStreamer RTP receiver started for {self.stream_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start GStreamer receiver: {e}")
            return False
    
    def _on_new_sample(self, appsink):
        """Callback for new video sample"""
        try:
            sample = appsink.emit("pull-sample")
            if sample:
                buffer = sample.get_buffer()
                caps = sample.get_caps()
                
                # Extract frame dimensions
                structure = caps.get_structure(0)
                width = structure.get_value("width")
                height = structure.get_value("height")
                
                # Extract frame data
                success, map_info = buffer.map(Gst.MapFlags.READ)
                if success:
                    # Convert to numpy array
                    frame_data = np.ndarray(
                        shape=(height, width, 3),
                        dtype=np.uint8,
                        buffer=map_info.data
                    )
                    
                    # Forward to NDI
                    if self.on_frame:
                        self.on_frame(frame_data.copy())
                    
                    buffer.unmap(map_info)
                    
        except Exception as e:
            logger.error(f"Error processing GStreamer sample: {e}")
        
        return Gst.FlowReturn.OK
    
    async def stop(self):
        """Stop GStreamer pipeline"""
        try:
            if self.pipeline:
                self.pipeline.set_state(Gst.State.NULL)
                self.pipeline = None
            
            self.is_running = False
            logger.info(f"GStreamer receiver stopped for {self.stream_id}")
            
        except Exception as e:
            logger.error(f"Error stopping GStreamer: {e}")
