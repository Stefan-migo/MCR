"""
Real RTP Receiver using aiortc
Consumes RTP packets from Mediasoup PlainTransport
"""

import asyncio
import logging
import numpy as np
from typing import Optional, Callable
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.contrib.media import MediaRecorder, MediaPlayer
from av import VideoFrame
import time

logger = logging.getLogger(__name__)

class RTPReceiver:
    """
    Receives RTP video stream from Mediasoup PlainTransport
    Extracts frames and forwards to NDI pipeline
    """
    
    def __init__(
        self, 
        stream_id: str, 
        transport_ip: str, 
        transport_port: int,
        on_frame: Optional[Callable[[np.ndarray], None]] = None
    ):
        self.stream_id = stream_id
        self.transport_ip = transport_ip
        self.transport_port = transport_port
        self.on_frame = on_frame
        
        self.pc: Optional[RTCPeerConnection] = None
        self.video_track: Optional[MediaStreamTrack] = None
        self.is_receiving = False
        self.frame_count = 0
        
        # Statistics
        self.stats = {
            "frames_received": 0,
            "frames_dropped": 0,
            "bytes_received": 0,
            "last_frame_time": None,
            "fps": 0.0
        }
        
    async def start(self, rtp_parameters: dict) -> bool:
        """
        Start receiving RTP stream
        
        Args:
            rtp_parameters: RTP parameters from Mediasoup consumer
            
        Returns:
            bool: True if started successfully
        """
        try:
            logger.info(f"Starting RTP receiver for {self.stream_id}")
            logger.info(f"Transport: {self.transport_ip}:{self.transport_port}")
            
            # Create RTCPeerConnection
            self.pc = RTCPeerConnection()
            
            # Handle incoming tracks
            @self.pc.on("track")
            async def on_track(track: MediaStreamTrack):
                logger.info(f"Track received: {track.kind}")
                
                if track.kind == "video":
                    self.video_track = track
                    # Start frame extraction loop
                    asyncio.create_task(self._extract_frames(track))
            
            # Connection state monitoring
            @self.pc.on("connectionstatechange")
            async def on_state_change():
                logger.info(f"RTP connection state: {self.pc.connectionState}")
                
                if self.pc.connectionState == "failed":
                    logger.error(f"RTP connection failed for {self.stream_id}")
                    await self.stop()
            
            # Create SDP offer to receive video
            # For PlainTransport, we need to manually construct SDP
            sdp_offer = self._create_sdp_offer(rtp_parameters)
            
            await self.pc.setRemoteDescription(
                RTCSessionDescription(sdp=sdp_offer, type="offer")
            )
            
            # Create answer
            answer = await self.pc.createAnswer()
            await self.pc.setLocalDescription(answer)
            
            self.is_receiving = True
            logger.info(f"✅ RTP receiver started for {self.stream_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to start RTP receiver: {e}")
            return False
    
    def _create_sdp_offer(self, rtp_parameters: dict) -> str:
        """
        Create SDP offer from Mediasoup RTP parameters
        This is critical for PlainTransport compatibility
        """
        codecs = rtp_parameters.get('codecs', [])
        encodings = rtp_parameters.get('encodings', [])
        
        # Extract codec info
        codec = codecs[0] if codecs else {}
        payload_type = codec.get('payloadType', 96)
        codec_name = codec.get('mimeType', 'video/VP8').split('/')[1]
        clock_rate = codec.get('clockRate', 90000)
        
        # Extract SSRC from encodings
        ssrc = encodings[0].get('ssrc') if encodings else 12345678
        
        sdp = f"""v=0
o=- 0 0 IN IP4 {self.transport_ip}
s=Mediasoup PlainTransport Stream
t=0 0
m=video {self.transport_port} RTP/AVP {payload_type}
c=IN IP4 {self.transport_ip}
a=rtpmap:{payload_type} {codec_name}/{clock_rate}
a=sendonly
a=ssrc:{ssrc} cname:mediasoup-plain-transport
"""
        return sdp
    
    async def _extract_frames(self, track: MediaStreamTrack):
        """
        Extract video frames from RTP track
        Convert to numpy arrays and forward to NDI
        """
        try:
            logger.info(f"Starting frame extraction for {self.stream_id}")
            
            while self.is_receiving:
                try:
                    # Receive frame from track
                    frame: VideoFrame = await asyncio.wait_for(
                        track.recv(), 
                        timeout=5.0
                    )
                    
                    # Convert to numpy array (BGR format for OpenCV/NDI)
                    img = frame.to_ndarray(format="bgr24")
                    
                    # Update statistics
                    self.stats["frames_received"] += 1
                    self.stats["last_frame_time"] = time.time()
                    self.frame_count += 1
                    
                    # Forward to NDI pipeline
                    if self.on_frame:
                        self.on_frame(img)
                    
                    # Log progress
                    if self.frame_count % 100 == 0:
                        logger.info(
                            f"Received {self.frame_count} frames "
                            f"for {self.stream_id} ({img.shape})"
                        )
                    
                except asyncio.TimeoutError:
                    logger.warning(f"Frame timeout for {self.stream_id}")
                    continue
                    
                except Exception as e:
                    logger.error(f"Error extracting frame: {e}")
                    self.stats["frames_dropped"] += 1
                    
        except Exception as e:
            logger.error(f"Frame extraction loop error: {e}")
        finally:
            logger.info(f"Frame extraction stopped for {self.stream_id}")
    
    async def stop(self):
        """Stop receiving RTP stream"""
        try:
            self.is_receiving = False
            
            if self.pc:
                await self.pc.close()
                self.pc = None
            
            logger.info(f"RTP receiver stopped for {self.stream_id}")
            
        except Exception as e:
            logger.error(f"Error stopping RTP receiver: {e}")
    
    def get_stats(self) -> dict:
        """Get reception statistics"""
        return {
            "stream_id": self.stream_id,
            "is_receiving": self.is_receiving,
            **self.stats
        }
