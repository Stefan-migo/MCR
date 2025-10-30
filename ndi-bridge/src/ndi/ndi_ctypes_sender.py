"""
NDI Sender using ctypes for direct NDI SDK access
Creates network-accessible NDI sources that OBS can discover
"""

import logging
import numpy as np
import time
import asyncio
from typing import Optional, Tuple
from datetime import datetime
import ctypes

from .ndi_sdk import get_ndi_sdk, initialize_ndi_sdk, NDIlib_FourCC_type_BGRA, NDIlib_FourCC_type_UYVY

logger = logging.getLogger(__name__)

class NDICtypesSender:
    """
    NDI Sender using ctypes for direct NDI SDK access
    Creates network-accessible NDI sources that OBS can discover
    """
    
    def __init__(self, source_name: str, width: int = 1280, height: int = 720, fps: int = 30):
        """
        Initialize NDI ctypes sender
        
        Args:
            source_name: Name of the NDI source (e.g., "MobileCam_DeviceName")
            width: Video width in pixels
            height: Video height in pixels
            fps: Frames per second
        """
        self.source_name = source_name
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_duration = 1.0 / fps  # Duration of one frame in seconds
        
        # NDI SDK objects
        self.ndi_sdk = None
        self.sender = None
        self.is_initialized = False
        
        # Frame timing
        self.last_frame_time = 0
        self.frame_count = 0
        self.start_time = None
        
        # Statistics
        self.frames_sent = 0
        self.frames_dropped = 0
        self.last_stats_time = time.time()
        
        logger.info(f"NDI Ctypes Sender initialized: {source_name} ({width}x{height}@{fps}fps)")
    
    async def initialize(self) -> bool:
        """
        Initialize NDI SDK and create sender
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Get NDI SDK instance
            self.ndi_sdk = get_ndi_sdk()
            if not self.ndi_sdk:
                logger.error("Failed to get NDI SDK instance")
                return False
            
            # Initialize NDI SDK
            if not self.ndi_sdk.initialize():
                logger.error("Failed to initialize NDI SDK")
                return False
            
            # Create NDI sender
            self.sender = self.ndi_sdk.create_sender(
                source_name=self.source_name,
                groups=None,
                clock_video=True,
                clock_audio=False
            )
            
            if not self.sender:
                logger.error(f"Failed to create NDI sender: {self.source_name}")
                return False
            
            self.is_initialized = True
            self.start_time = datetime.now()
            logger.info(f"NDI Ctypes Sender '{self.source_name}' initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize NDI ctypes sender: {e}")
            return False
    
    async def send_frame(self, frame: np.ndarray) -> bool:
        """
        Send video frame to NDI network
        
        Args:
            frame: Video frame as numpy array (BGR format, uint8)
            
        Returns:
            bool: True if frame sent successfully
        """
        if not self.is_initialized or not self.sender:
            logger.warning("NDI ctypes sender not initialized")
            return False
        
        # Debug logging
        logger.debug(f"NDI ctypes sender received frame: shape={frame.shape}, dtype={frame.dtype}")
        
        try:
            current_time = time.time()
            
            # Frame rate limiting
            if current_time - self.last_frame_time < self.frame_duration:
                self.frames_dropped += 1
                return True  # Skip frame to maintain frame rate
            
            # Ensure frame has correct dimensions
            if frame.shape[:2] != (self.height, self.width):
                # Resize frame if needed
                import cv2
                frame = cv2.resize(frame, (self.width, self.height))
            
            # Ensure frame is BGR format
            if len(frame.shape) == 3 and frame.shape[2] == 3:
                # Frame is already BGR, convert to BGRA for NDI
                bgra_frame = np.zeros((self.height, self.width, 4), dtype=np.uint8)
                bgra_frame[:, :, :3] = frame
                bgra_frame[:, :, 3] = 255  # Alpha channel
                frame = bgra_frame
            elif len(frame.shape) == 3 and frame.shape[2] == 4:
                # Frame is already BGRA
                pass
            else:
                logger.error(f"Unsupported frame format: {frame.shape}")
                return False
            
            # Send frame to NDI
            success = self.ndi_sdk.send_video_frame(
                sender=self.sender,
                frame=frame,
                fourcc=NDIlib_FourCC_type_BGRA,
                fps=(self.fps, 1)
            )
            
            if success:
                self.frames_sent += 1
                self.last_frame_time = current_time
                self.frame_count += 1
                
                # Log progress every 30 frames
                if self.frame_count % 30 == 0:
                    logger.info(f"✅ Sent {self.frame_count} frames to NDI for {self.source_name}")
                
                return True
            else:
                logger.error(f"❌ Failed to send frame {self.frame_count} for {self.source_name}")
                return False
                
        except Exception as e:
            logger.error(f"Error sending frame: {e}")
            return False
    
    def get_stats(self) -> dict:
        """Get sender statistics"""
        current_time = time.time()
        uptime = current_time - self.last_stats_time if self.last_stats_time else 0
        
        return {
            'source_name': self.source_name,
            'width': self.width,
            'height': self.height,
            'fps': self.fps,
            'frames_sent': self.frames_sent,
            'frames_dropped': self.frames_dropped,
            'frame_count': self.frame_count,
            'is_initialized': self.is_initialized,
            'uptime': uptime,
            'method': 'ndi-ctypes'
        }
    
    async def stop(self) -> None:
        """Stop NDI sender and cleanup resources"""
        try:
            if self.sender and self.ndi_sdk:
                self.ndi_sdk.destroy_sender(self.sender)
                self.sender = None
                logger.info(f"NDI sender '{self.source_name}' stopped")
            
            self.is_initialized = False
            
        except Exception as e:
            logger.error(f"Error stopping NDI ctypes sender: {e}")
    
    def close(self) -> None:
        """Close the sender (alias for stop for compatibility)"""
        asyncio.create_task(self.stop())
    
    def update_dimensions(self, width: int, height: int) -> None:
        """Update video dimensions"""
        self.width = width
        self.height = height
        logger.info(f"Updated dimensions to {width}x{height} for {self.source_name}")
    
    def get_tally(self) -> Optional[dict]:
        """Get tally information (program/preview status)"""
        try:
            if not self.sender or not self.ndi_sdk:
                return None
                
            tally = self.ndi_sdk.get_tally(self.sender)
            if tally:
                return {
                    'on_program': tally.on_program,
                    'on_preview': tally.on_preview
                }
            return None
            
        except Exception as e:
            logger.error(f"Error getting tally: {e}")
            return None
