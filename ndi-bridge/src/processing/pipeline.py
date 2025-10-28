"""
Stream Pipeline - Processes video frames from WebRTC to NDI
"""

import asyncio
import logging
import numpy as np
from typing import Optional, Callable, Dict, Any
from datetime import datetime, timedelta
import time

logger = logging.getLogger(__name__)

class StreamPipeline:
    """
    Processes video frames from WebRTC stream to NDI output
    """
    
    def __init__(self, stream_id: str, ndi_sender, max_queue_size: int = 10):
        """
        Initialize stream pipeline
        
        Args:
            stream_id: Unique stream identifier
            ndi_sender: NDI sender instance
            max_queue_size: Maximum frame queue size
        """
        self.stream_id = stream_id
        self.ndi_sender = ndi_sender
        self.max_queue_size = max_queue_size
        
        # Frame processing
        self.frame_queue = asyncio.Queue(maxsize=max_queue_size)
        self.is_processing = False
        self.processing_task: Optional[asyncio.Task] = None
        
        # Statistics
        self.stats = {
            "frames_received": 0,
            "frames_processed": 0,
            "frames_dropped": 0,
            "last_frame_time": None,
            "processing_fps": 0.0,
            "queue_size": 0,
            "processing_latency": 0.0
        }
        
        # Performance monitoring
        self.fps_calculator = FPSCalculator()
        self.latency_tracker = LatencyTracker()
        
        logger.info(f"Stream pipeline initialized for: {stream_id}")
    
    async def start(self):
        """
        Start the processing pipeline
        """
        if self.is_processing:
            logger.warning(f"Pipeline already running for stream: {self.stream_id}")
            return
        
        self.is_processing = True
        self.processing_task = asyncio.create_task(self._process_frames())
        
        logger.info(f"Started processing pipeline for stream: {self.stream_id}")
    
    async def stop(self):
        """
        Stop the processing pipeline
        """
        if not self.is_processing:
            return
        
        self.is_processing = False
        
        if self.processing_task:
            self.processing_task.cancel()
            try:
                await self.processing_task
            except asyncio.CancelledError:
                pass
        
        # Clear queue
        while not self.frame_queue.empty():
            try:
                self.frame_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        
        logger.info(f"Stopped processing pipeline for stream: {self.stream_id}")
    
    async def add_frame(self, frame: np.ndarray, timestamp: Optional[float] = None):
        """
        Add frame to processing queue
        
        Args:
            frame: Video frame as numpy array
            timestamp: Frame timestamp (optional)
        """
        try:
            if timestamp is None:
                timestamp = time.time()
            
            frame_data = {
                "frame": frame,
                "timestamp": timestamp,
                "queue_time": time.time()
            }
            
            # Try to add frame to queue
            try:
                self.frame_queue.put_nowait(frame_data)
                self.stats["frames_received"] += 1
                self.stats["last_frame_time"] = timestamp
                
            except asyncio.QueueFull:
                # Queue is full, drop oldest frame
                try:
                    self.frame_queue.get_nowait()  # Remove oldest
                    self.frame_queue.put_nowait(frame_data)  # Add new
                    self.stats["frames_dropped"] += 1
                    logger.debug(f"Dropped frame due to full queue: {self.stream_id}")
                except asyncio.QueueEmpty:
                    pass
            
            self.stats["queue_size"] = self.frame_queue.qsize()
            
        except Exception as e:
            logger.error(f"Error adding frame to pipeline {self.stream_id}: {e}")
    
    async def _process_frames(self):
        """
        Main frame processing loop
        """
        try:
            while self.is_processing:
                try:
                    # Get frame from queue with timeout
                    frame_data = await asyncio.wait_for(
                        self.frame_queue.get(), 
                        timeout=1.0
                    )
                    
                    await self._process_single_frame(frame_data)
                    
                except asyncio.TimeoutError:
                    # No frames available, continue
                    continue
                except Exception as e:
                    logger.error(f"Error processing frame in {self.stream_id}: {e}")
                    
        except asyncio.CancelledError:
            logger.info(f"Frame processing cancelled for {self.stream_id}")
        except Exception as e:
            logger.error(f"Frame processing error for {self.stream_id}: {e}")
    
    async def _process_single_frame(self, frame_data: dict):
        """
        Process a single frame
        
        Args:
            frame_data: Frame data dictionary
        """
        try:
            frame = frame_data["frame"]
            timestamp = frame_data["timestamp"]
            queue_time = frame_data["queue_time"]
            
            # Calculate processing latency
            processing_start = time.time()
            queue_latency = processing_start - queue_time
            
            # Update NDI sender dimensions if needed
            height, width = frame.shape[:2]
            if self.ndi_sender.width != width or self.ndi_sender.height != height:
                self.ndi_sender.update_dimensions(width, height)
            
            # Send frame to NDI
            success = await self.ndi_sender.send_frame(frame)
            
            if success:
                self.stats["frames_processed"] += 1
                
                # Update FPS calculation
                self.fps_calculator.add_frame(timestamp)
                self.stats["processing_fps"] = self.fps_calculator.get_fps()
                
                # Update latency tracking
                processing_time = time.time() - processing_start
                total_latency = queue_latency + processing_time
                self.latency_tracker.add_measurement(total_latency)
                self.stats["processing_latency"] = self.latency_tracker.get_average_latency()
                
                # Log every 100 frames
                if self.stats["frames_processed"] % 100 == 0:
                    logger.debug(f"Processed {self.stats['frames_processed']} frames for {self.stream_id}")
            else:
                logger.warning(f"Failed to send frame to NDI for {self.stream_id}")
            
        except Exception as e:
            logger.error(f"Error processing single frame for {self.stream_id}: {e}")
    
    def get_stats(self) -> dict:
        """
        Get pipeline statistics
        
        Returns:
            dict: Pipeline statistics
        """
        return {
            "stream_id": self.stream_id,
            "is_processing": self.is_processing,
            "queue_size": self.frame_queue.qsize(),
            "max_queue_size": self.max_queue_size,
            **self.stats
        }
    
    def get_performance_stats(self) -> dict:
        """
        Get detailed performance statistics
        
        Returns:
            dict: Performance statistics
        """
        return {
            "stream_id": self.stream_id,
            "fps": self.fps_calculator.get_fps(),
            "average_latency": self.latency_tracker.get_average_latency(),
            "min_latency": self.latency_tracker.get_min_latency(),
            "max_latency": self.latency_tracker.get_max_latency(),
            "frame_drop_rate": self.stats["frames_dropped"] / max(self.stats["frames_received"], 1),
            "queue_utilization": self.stats["queue_size"] / self.max_queue_size
        }


class FPSCalculator:
    """
    Calculates frames per second
    """
    
    def __init__(self, window_size: int = 30):
        self.window_size = window_size
        self.frame_times = []
    
    def add_frame(self, timestamp: float):
        """
        Add frame timestamp
        
        Args:
            timestamp: Frame timestamp
        """
        self.frame_times.append(timestamp)
        
        # Keep only recent frames
        if len(self.frame_times) > self.window_size:
            self.frame_times.pop(0)
    
    def get_fps(self) -> float:
        """
        Get current FPS
        
        Returns:
            float: Frames per second
        """
        if len(self.frame_times) < 2:
            return 0.0
        
        time_span = self.frame_times[-1] - self.frame_times[0]
        if time_span <= 0:
            return 0.0
        
        return (len(self.frame_times) - 1) / time_span


class LatencyTracker:
    """
    Tracks processing latency
    """
    
    def __init__(self, window_size: int = 100):
        self.window_size = window_size
        self.latencies = []
    
    def add_measurement(self, latency: float):
        """
        Add latency measurement
        
        Args:
            latency: Latency in seconds
        """
        self.latencies.append(latency)
        
        # Keep only recent measurements
        if len(self.latencies) > self.window_size:
            self.latencies.pop(0)
    
    def get_average_latency(self) -> float:
        """
        Get average latency
        
        Returns:
            float: Average latency in seconds
        """
        if not self.latencies:
            return 0.0
        
        return sum(self.latencies) / len(self.latencies)
    
    def get_min_latency(self) -> float:
        """
        Get minimum latency
        
        Returns:
            float: Minimum latency in seconds
        """
        return min(self.latencies) if self.latencies else 0.0
    
    def get_max_latency(self) -> float:
        """
        Get maximum latency
        
        Returns:
            float: Maximum latency in seconds
        """
        return max(self.latencies) if self.latencies else 0.0
