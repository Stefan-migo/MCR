"""
Stream Manager - Manages multiple WebRTC streams and NDI outputs
"""

import asyncio
import logging
from typing import Dict, Optional, Callable, Any
from datetime import datetime

from ndi.ffmpeg_sender import FFmpegNDISender
from webrtc.consumer import WebRTCConsumer
from webrtc.signaling import WebRTCSignaling
from processing.pipeline import StreamPipeline

logger = logging.getLogger(__name__)

class StreamManager:
    """
    Manages multiple WebRTC streams and their NDI outputs
    """
    
    def __init__(self, backend_url: str, ndi_source_prefix: str = "MobileCam"):
        """
        Initialize stream manager
        
        Args:
            backend_url: Backend WebSocket URL
            ndi_source_prefix: Prefix for NDI source names
        """
        self.backend_url = backend_url
        self.ndi_source_prefix = ndi_source_prefix
        
        # Services
        self.signaling = WebRTCSignaling(backend_url)
        self.webrtc_consumer = WebRTCConsumer(self.signaling)
        
        # Stream management
        self.active_streams: Dict[str, dict] = {}
        self.ndi_senders: Dict[str, NDISender] = {}
        self.pipelines: Dict[str, StreamPipeline] = {}
        
        # Configuration
        self.max_streams = 10
        self.auto_consume = True
        
        # Callbacks
        self.on_stream_started: Optional[Callable[[str, dict], None]] = None
        self.on_stream_stopped: Optional[Callable[[str], None]] = None
        self.on_error: Optional[Callable[[str, Exception], None]] = None
        
        # Statistics
        self.stats = {
            "total_streams_created": 0,
            "active_streams": 0,
            "total_frames_processed": 0,
            "start_time": datetime.now()
        }
        
        logger.info(f"Stream Manager initialized with backend: {backend_url}")
    
    async def initialize(self) -> bool:
        """
        Initialize all services
        
        Returns:
            bool: True if initialization successful
        """
        try:
            # Set up signaling callbacks
            self.signaling.on_connected = self._on_signaling_connected
            self.signaling.on_disconnected = self._on_signaling_disconnected
            self.signaling.on_error = self._on_signaling_error
            
            # Set up WebRTC consumer callbacks
            self.webrtc_consumer.on_frame_received = self._on_frame_received
            self.webrtc_consumer.on_connection_state_change = self._on_connection_state_change
            self.webrtc_consumer.on_error = self._on_webrtc_error
            
            # Connect to backend
            if not await self.signaling.connect():
                logger.error("Failed to connect to backend signaling")
                return False
            
            # Set WebRTC consumer connection state
            self.webrtc_consumer.set_connected(True)
            
            # Register message handlers
            self.signaling.register_message_handler("stream-started", self._handle_new_producer)
            self.signaling.register_message_handler("stream-ended", self._handle_producer_closed)
            self.signaling.register_message_handler("stream-stats", self._handle_stream_stats)
            
            # Get initial active producers
            await self._discover_existing_streams()
            
            logger.info("Stream Manager initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Stream Manager: {e}")
            return False
    
    async def shutdown(self):
        """
        Shutdown all services and cleanup
        """
        try:
            # Stop all streams
            for stream_id in list(self.active_streams.keys()):
                await self.stop_stream(stream_id)
            
            # Disconnect services
            await self.webrtc_consumer.disconnect()
            await self.signaling.disconnect()
            
            logger.info("Stream Manager shutdown complete")
            
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")
    
    async def start_stream(self, stream_info: dict) -> bool:
        """
        Start a new stream
        
        Args:
            stream_info: Stream information from backend
            
        Returns:
            bool: True if stream started successfully
        """
        try:
            stream_id = stream_info.get("id")
            producer_id = stream_info.get("producer_id") or stream_info.get("producerId")
            device_name = stream_info.get("device_name", "Unknown")
            resolution = stream_info.get("resolution", {"width": 1280, "height": 720})
            
            if not stream_id or not producer_id:
                logger.error("Invalid stream info: missing stream_id or producer_id")
                return False
            
            if stream_id in self.active_streams:
                logger.warning(f"Stream {stream_id} already active")
                return True
            
            # Create FFmpeg NDI sender
            ndi_source_name = f"{self.ndi_source_prefix}_{device_name}"
            ndi_sender = FFmpegNDISender(
                source_name=ndi_source_name,
                width=resolution.get("width", 1280),
                height=resolution.get("height", 720),
                fps=30,
                port=5004 + len(self.active_streams)  # Use different ports for different streams
            )
            
            # Initialize NDI sender
            if not await ndi_sender.initialize():
                logger.error(f"Failed to initialize NDI sender for {stream_id}")
                return False
            
            # Create stream pipeline
            pipeline = StreamPipeline(stream_id, ndi_sender)
            await pipeline.start()
            
            # Get RTP capabilities
            rtp_capabilities = await self.signaling.request_rtp_capabilities()
            if not rtp_capabilities:
                logger.error("Failed to get RTP capabilities")
                await ndi_sender.close()
                return False
            
            # Start consuming WebRTC stream
            if not await self.webrtc_consumer.consume_stream(stream_id, producer_id, rtp_capabilities):
                logger.error(f"Failed to consume WebRTC stream {stream_id}")
                await pipeline.stop()
                await ndi_sender.close()
                return False
            
            # Store stream info
            self.active_streams[stream_id] = {
                "stream_info": stream_info,
                "ndi_sender": ndi_sender,
                "pipeline": pipeline,
                "started_at": datetime.now()
            }
            
            self.ndi_senders[stream_id] = ndi_sender
            self.pipelines[stream_id] = pipeline
            
            # Update statistics
            self.stats["total_streams_created"] += 1
            self.stats["active_streams"] = len(self.active_streams)
            
            logger.info(f"Started stream {stream_id} -> {ndi_source_name}")
            
            if self.on_stream_started:
                self.on_stream_started(stream_id, stream_info)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to start stream {stream_id}: {e}")
            if self.on_error:
                self.on_error(f"start-stream-{stream_id}", e)
            return False
    
    async def stop_stream(self, stream_id: str) -> bool:
        """
        Stop a stream
        
        Args:
            stream_id: Stream identifier
            
        Returns:
            bool: True if stream stopped successfully
        """
        try:
            if stream_id not in self.active_streams:
                logger.warning(f"Stream {stream_id} not found")
                return False
            
            # Stop WebRTC consumption
            await self.webrtc_consumer.stop_stream(stream_id)
            
            # Stop pipeline
            pipeline = self.pipelines.get(stream_id)
            if pipeline:
                await pipeline.stop()
                del self.pipelines[stream_id]
            
            # Close NDI sender
            ndi_sender = self.ndi_senders.get(stream_id)
            if ndi_sender:
                ndi_sender.close()
                del self.ndi_senders[stream_id]
            
            # Remove from active streams
            del self.active_streams[stream_id]
            
            # Update statistics
            self.stats["active_streams"] = len(self.active_streams)
            
            logger.info(f"Stopped stream {stream_id}")
            
            if self.on_stream_stopped:
                self.on_stream_stopped(stream_id)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop stream {stream_id}: {e}")
            return False
    
    async def get_stream_stats(self, stream_id: str) -> Optional[dict]:
        """
        Get statistics for a specific stream
        
        Args:
            stream_id: Stream identifier
            
        Returns:
            dict: Stream statistics or None if not found
        """
        if stream_id not in self.active_streams:
            return None
        
        try:
            stream_data = self.active_streams[stream_id]
            pipeline = stream_data.get("pipeline")
            ndi_sender = stream_data.get("ndi_sender")
            
            stats = {
                "stream_id": stream_id,
                "started_at": stream_data.get("started_at"),
                "uptime": (datetime.now() - stream_data.get("started_at", datetime.now())).total_seconds(),
                "ndi_sender_stats": ndi_sender.get_stats() if ndi_sender else {},
                "pipeline_stats": pipeline.get_stats() if pipeline else {}
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get stats for stream {stream_id}: {e}")
            return None
    
    def get_all_stats(self) -> dict:
        """
        Get statistics for all streams
        
        Returns:
            dict: All stream statistics
        """
        try:
            stream_stats = {}
            for stream_id in self.active_streams:
                stream_stats[stream_id] = asyncio.create_task(self.get_stream_stats(stream_id))
            
            # Wait for all stats
            for stream_id, task in stream_stats.items():
                try:
                    stream_stats[stream_id] = asyncio.run(task)
                except Exception as e:
                    logger.error(f"Error getting stats for {stream_id}: {e}")
                    stream_stats[stream_id] = None
            
            return {
                "manager_stats": self.stats,
                "stream_stats": stream_stats,
                "total_active_streams": len(self.active_streams)
            }
            
        except Exception as e:
            logger.error(f"Failed to get all stats: {e}")
            return {"error": str(e)}
    
    async def _discover_existing_streams(self):
        """
        Discover and start existing streams
        """
        try:
            producers = await self.signaling.get_active_producers()
            if not producers:
                logger.info("No existing streams found")
                return
            
            logger.info(f"Found {len(producers)} existing streams")
            
            for producer in producers:
                if self.auto_consume:
                    await self.start_stream(producer)
                    
        except Exception as e:
            logger.error(f"Failed to discover existing streams: {e}")
    
    def _on_frame_received(self, stream_id: str, frame):
        """
        Handle received video frame
        
        Args:
            stream_id: Stream identifier
            frame: Video frame
        """
        try:
            if stream_id in self.pipelines:
                pipeline = self.pipelines[stream_id]
                asyncio.create_task(pipeline.add_frame(frame))
                self.stats["total_frames_processed"] += 1
            else:
                logger.warning(f"No pipeline found for stream {stream_id}")
                
        except Exception as e:
            logger.error(f"Error handling frame for {stream_id}: {e}")
    
    def _on_connection_state_change(self, stream_id: str, state: str):
        """
        Handle connection state change
        
        Args:
            stream_id: Stream identifier
            state: New connection state
        """
        logger.info(f"Connection state changed for {stream_id}: {state}")
        
        if state == "failed" or state == "disconnected":
            # Auto-stop stream on connection failure
            asyncio.create_task(self.stop_stream(stream_id))
    
    def _on_webrtc_error(self, stream_id: str, error: Exception):
        """
        Handle WebRTC error
        
        Args:
            stream_id: Stream identifier
            error: Error exception
        """
        logger.error(f"WebRTC error for {stream_id}: {error}")
        
        if self.on_error:
            self.on_error(f"webrtc-{stream_id}", error)
    
    def _on_signaling_connected(self):
        """
        Handle signaling connection
        """
        logger.info("Signaling connected")
        self.webrtc_consumer.set_connected(True)
    
    def _on_signaling_disconnected(self):
        """
        Handle signaling disconnection
        """
        logger.warning("Signaling disconnected")
        self.webrtc_consumer.set_connected(False)
    
    def _on_signaling_error(self, error: str):
        """
        Handle signaling error
        
        Args:
            error: Error message
        """
        logger.error(f"Signaling error: {error}")
        self.webrtc_consumer.set_connected(False)
    
    async def _handle_new_producer(self, data: dict):
        """
        Handle stream started event
        
        Args:
            data: Event data
        """
        try:
            stream_info = data.get("stream", {})
            if self.auto_consume and stream_info:
                logger.info(f"🎥 New stream detected: {stream_info.get('id', 'unknown')}")
                await self.start_stream(stream_info)
                
        except Exception as e:
            logger.error(f"Error handling stream started: {e}")
    
    async def _handle_producer_closed(self, data: dict):
        """
        Handle stream ended event
        
        Args:
            data: Event data
        """
        try:
            stream_id = data.get("streamId")
            if stream_id:
                logger.info(f"🛑 Stream ended: {stream_id}")
                await self.stop_stream(stream_id)
                
        except Exception as e:
            logger.error(f"Error handling stream ended: {e}")
    
    async def _handle_stream_stats(self, data: dict):
        """
        Handle stream statistics update
        
        Args:
            data: Event data
        """
        try:
            # Update stream statistics if needed
            pass
        except Exception as e:
            logger.error(f"Error handling stream stats: {e}")
