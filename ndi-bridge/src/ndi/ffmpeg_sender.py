"""
FFmpeg-based NDI Sender - Clean, production-ready solution
Uses FFmpeg to create local MPEG-TS files that can be consumed by OBS Studio
This approach works better with Wayland systems that have network streaming issues
"""

import asyncio
import logging
import subprocess
import numpy as np
from typing import Optional, Dict, Any
from datetime import datetime
import tempfile
import os
import signal
import threading
import time

logger = logging.getLogger(__name__)

class FFmpegNDISender:
    """
    FFmpeg-based NDI sender for publishing video streams
    Creates local MPEG-TS files that can be consumed by OBS Studio
    This approach works better with Wayland systems that have network streaming issues
    """
    
    def __init__(self, source_name: str, width: int = 1280, height: int = 720, fps: int = 30, port: int = 5004):
        """
        Initialize FFmpeg NDI sender
        
        Args:
            source_name: Name of the NDI source (e.g., "MobileCam_DeviceName")
            width: Video width in pixels
            height: Video height in pixels
            fps: Frames per second
            port: Port number (used for file naming, not networking)
        """
        self.source_name = source_name
        self.width = width
        self.height = height
        self.fps = fps
        self.port = port
        
        # File management
        self.temp_dir = tempfile.mkdtemp(prefix=f"ndi_bridge_{source_name}_")
        self.current_file = os.path.join(self.temp_dir, f"stream_{port}.ts")
        self.output_file = os.path.join(os.path.expanduser("~"), f"{source_name}_{port}.ts")
        
        # FFmpeg process
        self.ffmpeg_process: Optional[subprocess.Popen] = None
        self.is_initialized = False
        self.is_streaming = False
        
        # Statistics
        self.frame_count = 0
        self.last_frame_time = None
        self.start_time = None
        
        # File rotation
        self.file_duration = 2  # seconds - rotate more frequently per file
        self.current_file_start = None
        self.file_rotation_thread = None
        self.stop_rotation = False
        
        logger.info(f"FFmpeg NDI Sender initialized: {source_name} ({width}x{height}@{fps}fps) -> {self.output_file}")
    
    async def initialize(self) -> bool:
        """
        Initialize FFmpeg NDI sender
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Create initial file
            self.current_file_start = time.time()
            
            # Start file rotation thread
            self.stop_rotation = False
            self.file_rotation_thread = threading.Thread(target=self._file_rotation_worker, daemon=True)
            self.file_rotation_thread.start()
            
            self.is_initialized = True
            self.start_time = datetime.now()
            logger.info(f"FFmpeg NDI Sender '{self.source_name}' initialized successfully")
            logger.info(f"Output file: {self.output_file}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize FFmpeg NDI sender: {e}")
            return False
    
    def _file_rotation_worker(self):
        """
        Worker thread for file rotation
        """
        while not self.stop_rotation:
            time.sleep(1)  # Check every second
            
            if self.current_file_start and time.time() - self.current_file_start >= self.file_duration:
                self._rotate_file()
    
    def _rotate_file(self):
        """
        Rotate to a new file
        """
        try:
            # Copy current file to output location
            if os.path.exists(self.current_file):
                import shutil
                shutil.copy2(self.current_file, self.output_file)
                file_size = os.path.getsize(self.output_file)
                logger.info(f"🔄 Rotated file: {self.current_file} -> {self.output_file} ({file_size} bytes)")
            else:
                logger.warning(f"Current file does not exist: {self.current_file}")
            
            # Start new file
            self.current_file_start = time.time()
            logger.debug(f"Started new file: {self.current_file}")
            
        except Exception as e:
            logger.error(f"Error rotating file: {e}")
    
    async def _create_ffmpeg_file(self, frame: np.ndarray):
        """
        Create a continuous MPEG-TS file using FFmpeg
        """
        try:
            # Ensure frame is the correct size and format
            if frame.shape[:2] != (self.height, self.width):
                import cv2
                frame = cv2.resize(frame, (self.width, self.height))
            
            # Ensure frame is BGR format
            if frame.shape[2] != 3:
                logger.error(f"Unsupported frame format: {frame.shape}")
                return False
            
            # Create a longer video file (10 seconds) with the current frame repeated
            # This creates a more substantial video file for OBS to consume
            raw_file = os.path.join(self.temp_dir, f"frame_{self.frame_count}.raw")
            with open(raw_file, 'wb') as f:
                # Write the frame multiple times to create a longer video
                for _ in range(self.fps * 10):  # 10 seconds of video
                    f.write(frame.tobytes())
            
            # Use FFmpeg to create MPEG-TS file
            ffmpeg_cmd = [
                'ffmpeg',
                '-y',  # Overwrite output files
                '-f', 'rawvideo',
                '-vcodec', 'rawvideo',
                '-s', f'{self.width}x{self.height}',
                '-pix_fmt', 'bgr24',
                '-r', str(self.fps),
                '-i', raw_file,
                '-c:v', 'libopenh264',
                '-preset', 'ultrafast',
                '-crf', '18',
                '-maxrate', '2M',
                '-bufsize', '4M',
                '-g', str(self.fps),
                '-keyint_min', str(self.fps),
                '-sc_threshold', '0',
                '-f', 'mpegts',
                '-t', '10',  # 10 seconds duration
                self.current_file
            ]
            
            # Run FFmpeg
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            
            # Clean up raw file
            if os.path.exists(raw_file):
                os.remove(raw_file)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg error (return code {result.returncode}): {result.stderr}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error creating FFmpeg file: {e}")
            return False
    
    async def send_frame(self, frame: np.ndarray) -> bool:
        """
        Send video frame to create MPEG-TS file
        
        Args:
            frame: Video frame as numpy array (BGR format, uint8)
            
        Returns:
            bool: True if frame sent successfully
        """
        if not self.is_initialized:
            logger.warning("FFmpeg NDI sender not initialized")
            return False
        
        try:
            logger.info(f"📹 Sending frame {self.frame_count} for {self.source_name}")
            
            # Create MPEG-TS file from frame
            success = await self._create_ffmpeg_file(frame)
            
            if success:
                self.frame_count += 1
                self.last_frame_time = datetime.now().timestamp()
                logger.info(f"✅ Successfully sent frame {self.frame_count} for {self.source_name}")
                
                # Log file size every 10 frames
                if self.frame_count % 10 == 0:
                    file_size = os.path.getsize(self.output_file) if os.path.exists(self.output_file) else 0
                    logger.info(f"📊 Sent {self.frame_count} frames for {self.source_name}, file size: {file_size} bytes")
            else:
                logger.error(f"❌ Failed to send frame {self.frame_count} for {self.source_name}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to send frame: {e}")
            return False
    
    def update_dimensions(self, width: int, height: int):
        """
        Update video dimensions (restart required)
        
        Args:
            width: New video width
            height: New video height
        """
        if width != self.width or height != self.height:
            logger.info(f"Updating dimensions from {self.width}x{self.height} to {width}x{height}")
            self.width = width
            self.height = height
            # Note: In a production system, you'd restart the FFmpeg process here
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get sender statistics
        
        Returns:
            dict: Sender statistics
        """
        current_time = datetime.now().timestamp()
        time_since_last_frame = 0
        if self.last_frame_time:
            time_since_last_frame = current_time - self.last_frame_time
        
        uptime = 0
        if self.start_time:
            uptime = current_time - self.start_time.timestamp()
        
        return {
            "source_name": self.source_name,
            "frame_count": self.frame_count,
            "dimensions": f"{self.width}x{self.height}",
            "fps": self.fps,
            "port": self.port,
            "output_file": self.output_file,
            "current_file": self.current_file,
            "time_since_last_frame": time_since_last_frame,
            "uptime": uptime,
            "is_initialized": self.is_initialized,
            "is_streaming": self.is_initialized and not self.stop_rotation,
            "file_exists": os.path.exists(self.output_file)
        }
    
    async def stop(self):
        """
        Stop the FFmpeg NDI sender
        """
        try:
            # Stop file rotation
            self.stop_rotation = True
            if self.file_rotation_thread:
                self.file_rotation_thread.join(timeout=2)
            
            # Final file rotation
            self._rotate_file()
            
            # Clean up temporary files
            if os.path.exists(self.temp_dir):
                import shutil
                shutil.rmtree(self.temp_dir)
            
            self.is_initialized = False
            self.is_streaming = False
            
            logger.info(f"FFmpeg NDI Sender '{self.source_name}' stopped")
            logger.info(f"Final output file: {self.output_file}")
            
        except Exception as e:
            logger.error(f"Error stopping FFmpeg NDI sender: {e}")
    
    def close(self):
        """
        Close the FFmpeg NDI sender (alias for stop)
        """
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If we're in an async context, schedule the stop
                asyncio.create_task(self.stop())
            else:
                # If we're not in an async context, run the stop
                loop.run_until_complete(self.stop())
        except:
            # Fallback: just set the stop flag
            self.stop_rotation = True

    def __del__(self):
        """
        Cleanup on destruction
        """
        if hasattr(self, 'stop_rotation'):
            self.stop_rotation = True
