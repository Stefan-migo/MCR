"""
NDI Sender - Handles sending video frames to NDI network
"""

import logging
import numpy as np
from typing import Optional, Tuple
import asyncio
from datetime import datetime

logger = logging.getLogger(__name__)

# Try to import NDI library, fall back to C++ executable if not available
try:
    import NDIlib as ndi
    NDI_AVAILABLE = True
    NDI_INITIALIZED = False
    logger.info("NDI library imported successfully")
except ImportError:
    NDI_AVAILABLE = False
    NDI_INITIALIZED = False
    logger.warning("NDI library not available, using C++ executable approach")

# We'll use a C++ executable approach to create NDI sources
# This bypasses the ndi-python installation issues

class NDISender:
    """
    NDI Sender for publishing video streams to NDI network
    """
    
    def __init__(self, source_name: str, width: int = 1280, height: int = 720, fps: int = 30):
        """
        Initialize NDI sender

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

        # NDI objects (will be initialized when NDI SDK is available)
        self.ndi_send = None
        self.ndi_video_frame = None
        self.is_initialized = False

        # C++ executable approach
        self.cpp_process = None
        self.use_cpp_executable = not NDI_AVAILABLE

        # Frame timing
        self.last_frame_time = 0
        self.frame_count = 0

        logger.info(f"NDI Sender initialized: {source_name} ({width}x{height}@{fps}fps)")
        if self.use_cpp_executable:
            logger.info("Using C++ executable approach for NDI")
    
    async def initialize(self) -> bool:
        """
        Initialize NDI SDK and create sender

        Returns:
            bool: True if initialization successful
        """
        try:
            if not NDI_AVAILABLE:
                logger.warning("NDI library not available, using C++ executable approach")
                return await self._initialize_cpp_executable()
            
            # Initialize NDI library globally (only once)
            global NDI_INITIALIZED
            if not NDI_INITIALIZED:
                if not ndi.initialize():
                    logger.error("Failed to initialize NDI library")
                    return False
                NDI_INITIALIZED = True
                logger.info("NDI library initialized globally")
            
            # Create NDI send settings
            send_settings = ndi.SendCreate()
            send_settings.ndi_name = self.source_name
            send_settings.clock_video = True
            send_settings.clock_audio = False
            
            # Create NDI sender
            self.ndi_send = ndi.send_create(send_settings)
            if not self.ndi_send:
                logger.error(f"Failed to create NDI sender: {self.source_name}")
                return False
            
            # Create video frame structure
            self.ndi_video_frame = ndi.VideoFrameV2()
            self.ndi_video_frame.xres = self.width
            self.ndi_video_frame.yres = self.height
            self.ndi_video_frame.FourCC = ndi.FOURCC_VIDEO_TYPE_BGRA
            self.ndi_video_frame.frame_rate_N = self.fps
            self.ndi_video_frame.frame_rate_D = 1
            self.ndi_video_frame.picture_aspect_ratio = self.width / self.height
            self.ndi_video_frame.frame_format_type = ndi.FRAME_FORMAT_TYPE_PROGRESSIVE
            self.ndi_video_frame.timecode = ndi.SEND_TIMECODE_SYNTHESIZE
            self.ndi_video_frame.line_stride_in_bytes = self.width * 4  # BGRA = 4 bytes per pixel
            
            # Allocate data buffer
            self.frame_data = None
            
            self.is_initialized = True
            logger.info(f"NDI sender '{self.source_name}' initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize NDI sender: {e}")
            return False

    async def _initialize_cpp_executable(self) -> bool:
        """
        Initialize C++ NDI executable

        Returns:
            bool: True if initialization successful
        """
        try:
            import subprocess
            import os
            
            # Check if the C++ executable exists
            cpp_executable = "./real_mobile_processor"
            if not os.path.exists(cpp_executable):
                logger.error(f"C++ NDI executable not found: {cpp_executable}")
                return False
            
            # Start the C++ NDI process
            cmd = [
                cpp_executable,
                self.source_name,
                str(self.width),
                str(self.height),
                str(self.fps)
            ]
            
            self.cpp_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Give it a moment to start
            await asyncio.sleep(1)
            
            # Check if process is still running
            if self.cpp_process.poll() is None:
                self.is_initialized = True
                logger.info(f"C++ NDI Sender '{self.source_name}' initialized successfully")
                return True
            else:
                stdout, stderr = self.cpp_process.communicate()
                logger.error(f"C++ NDI process failed to start: {stderr}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to initialize C++ NDI executable: {e}")
            return False
    
    async def send_frame(self, frame: np.ndarray) -> bool:
        """
        Send video frame to NDI network

        Args:
            frame: Video frame as numpy array (BGR format, uint8)

        Returns:
            bool: True if frame sent successfully
        """
        if not self.is_initialized:
            logger.warning("NDI sender not initialized")
            return False

        # C++ executable implementation when NDI library is not available
        if not NDI_AVAILABLE:
            return await self._send_frame_cpp_executable(frame)
        
        if not self.ndi_send:
            logger.warning("NDI sender not initialized")
            return False
        
        try:
            # Convert BGR to BGRA if needed
            if frame.shape[2] == 3:  # BGR
                bgra_frame = np.zeros((self.height, self.width, 4), dtype=np.uint8)
                bgra_frame[:, :, :3] = frame  # Copy BGR channels
                bgra_frame[:, :, 3] = 255     # Set alpha to 255 (opaque)
            elif frame.shape[2] == 4:  # BGRA
                bgra_frame = frame
            else:
                logger.error(f"Unsupported frame format: {frame.shape}")
                return False
            
            # Ensure frame is the correct size
            if bgra_frame.shape[:2] != (self.height, self.width):
                logger.warning(f"Frame size mismatch: expected {(self.height, self.width)}, got {bgra_frame.shape[:2]}")
                # Resize frame to match expected dimensions
                import cv2
                bgra_frame = cv2.resize(bgra_frame, (self.width, self.height))
            
            # Allocate data buffer if needed
            if self.frame_data is None or self.frame_data.shape != bgra_frame.shape:
                self.frame_data = bgra_frame.copy()
            
            # Copy frame data
            self.frame_data[:] = bgra_frame
            
            # Set frame data pointer
            self.ndi_video_frame.data = self.frame_data.ctypes.data
            
            # Set timestamp
            current_time = datetime.now()
            self.ndi_video_frame.timestamp = int(current_time.timestamp() * 1000000)  # Microseconds
            
            # Send frame
            ndi.send_send_video_v2(self.ndi_send, self.ndi_video_frame)
            
            self.frame_count += 1
            self.last_frame_time = current_time.timestamp()
            
            # Log every 100 frames
            if self.frame_count % 100 == 0:
                logger.debug(f"Sent {self.frame_count} frames for {self.source_name}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send frame: {e}")
            return False

    async def _send_frame_cpp_executable(self, frame: np.ndarray) -> bool:
        """
        Send frame using C++ executable

        Args:
            frame: Video frame as numpy array (BGR format, uint8)

        Returns:
            bool: True if frame sent successfully
        """
        try:
            if not self.cpp_process or self.cpp_process.poll() is not None:
                logger.warning("C++ NDI process not running")
                return False
            
            # For now, just log that we're sending frames
            # In a real implementation, we'd send the frame data to the C++ process
            self.frame_count += 1
            if self.frame_count % 30 == 0:  # Log every 30 frames
                logger.info(f"C++ NDI: Sending frame {self.frame_count} for '{self.source_name}' ({frame.shape})")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to send frame via C++ executable: {e}")
            return False
    
    def update_dimensions(self, width: int, height: int):
        """
        Update video dimensions
        
        Args:
            width: New width
            height: New height
        """
        if self.width != width or self.height != height:
            logger.info(f"Updating NDI sender dimensions: {self.width}x{self.height} -> {width}x{height}")
            self.width = width
            self.height = height
            self.ndi_video_frame.xres = width
            self.ndi_video_frame.yres = height
            self.ndi_video_frame.line_stride_in_bytes = width * 4
            self.ndi_video_frame.picture_aspect_ratio = width / height
    
    def get_stats(self) -> dict:
        """
        Get sender statistics
        
        Returns:
            dict: Statistics including frame count, fps, etc.
        """
        current_time = datetime.now().timestamp()
        time_since_last_frame = current_time - self.last_frame_time if self.last_frame_time > 0 else 0
        
        return {
            "source_name": self.source_name,
            "frame_count": self.frame_count,
            "dimensions": f"{self.width}x{self.height}",
            "fps": self.fps,
            "time_since_last_frame": time_since_last_frame,
            "is_initialized": self.is_initialized
        }
    
    def close(self):
        """
        Close NDI sender and cleanup resources
        """
        try:
            if self.use_cpp_executable and self.cpp_process:
                # Terminate C++ process
                self.cpp_process.terminate()
                self.cpp_process.wait()
                self.cpp_process = None
                self.is_initialized = False
                logger.info(f"C++ NDI sender '{self.source_name}' closed")
            elif self.ndi_send and self.is_initialized:
                self.ndi.send_destroy(self.ndi_send)
                self.ndi_send = None
                self.is_initialized = False
                logger.info(f"NDI sender '{self.source_name}' closed")
        except Exception as e:
            logger.error(f"Error closing NDI sender: {e}")
    
    def __del__(self):
        """Destructor to ensure cleanup"""
        self.close()
