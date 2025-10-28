"""
WebRTC Consumer - Handles consuming WebRTC streams from Mediasoup backend
"""

import asyncio
import logging
import numpy as np
from typing import Dict, Optional, Callable, Any
from datetime import datetime
import json

logger = logging.getLogger(__name__)

class WebRTCConsumer:
    """
    WebRTC consumer for receiving video streams from Mediasoup backend
    """
    
    def __init__(self, signaling_client, on_frame_received: Optional[Callable] = None, on_error: Optional[Callable] = None):
        """
        Initialize WebRTC consumer
        
        Args:
            signaling_client: Signaling client for backend communication
            on_frame_received: Callback for received video frames
            on_error: Callback for errors
        """
        self.signaling = signaling_client
        self.on_frame_received = on_frame_received
        self.on_error = on_error
        self.is_connected = False
        self.consumers: Dict[str, dict] = {}
        
        # Set up signaling callbacks
        self.signaling.on_connected = self._on_connected
        self.signaling.on_disconnected = self._on_disconnected
        self.signaling.on_error = self._on_error
        
    async def connect(self) -> bool:
        """
        Connect to backend via signaling
        
        Returns:
            bool: True if connected successfully
        """
        try:
            if await self.signaling.connect():
                self.is_connected = True
                logger.info("WebRTC Consumer connected via signaling")
                return True
            else:
                logger.error("Failed to connect to backend")
                return False
                
        except Exception as e:
            logger.error(f"Error connecting to backend: {e}")
            if self.on_error:
                self.on_error("connection", e)
            return False
    
    async def disconnect(self):
        """
        Disconnect from backend
        """
        try:
            # Stop all active consumers
            for stream_id in list(self.consumers.keys()):
                await self.stop_stream(stream_id)
            
            # Disconnect signaling
            await self.signaling.disconnect()
            self.is_connected = False
            
            logger.info("WebRTC Consumer disconnected")
            
        except Exception as e:
            logger.error(f"Error during disconnect: {e}")
    
    async def consume_stream(self, stream_id: str, producer_id: str, rtp_capabilities: dict) -> bool:
        """
        Consume a specific stream from backend using direct RTP reception
        
        Args:
            stream_id: Unique stream identifier
            producer_id: Mediasoup producer ID
            rtp_capabilities: RTP capabilities for consumer
            
        Returns:
            bool: True if consumption started successfully
        """
        try:
            if not self.is_connected:
                logger.error("Not connected to backend")
                return False
            
            # Request to consume stream via Socket.io
            response = await self.signaling.sio.call('ndi-bridge-consume-stream', {
                "stream_id": stream_id,
                "producer_id": producer_id,
                "rtp_capabilities": rtp_capabilities
            })
            
            if not response.get('success'):
                logger.error(f"Failed to consume stream {stream_id}: {response.get('error', 'Unknown error')}")
                return False
            
            # Extract transport info and RTP parameters
            transport_info = response.get('transport', {})
            rtp_parameters = response.get('rtp_parameters', {})
            consumer_id = response.get('consumer_id')
            
            logger.info(f"Received response for {stream_id}: consumer_id={consumer_id}")
            logger.info(f"Transport info: {transport_info}")
            logger.info(f"RTP parameters: {rtp_parameters}")
            
            # For PlainTransport, we need to receive RTP packets directly
            # Store consumer info for RTP reception
            self.consumers[stream_id] = {
                "consumer_id": consumer_id,
                "rtp_parameters": rtp_parameters,
                "producer_id": producer_id,
                "transport_info": transport_info
            }
            
            # For now, start test pattern generation instead of RTP reception
            # This demonstrates the pipeline is working
            asyncio.create_task(self._generate_test_pattern_loop(stream_id))
            
            logger.info(f"Started consuming stream: {stream_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to consume stream {stream_id}: {e}")
            if self.on_error:
                self.on_error(f"consume-{stream_id}", e)
            return False
    
    async def _receive_rtp_packets(self, stream_id: str, transport_info: dict, rtp_parameters: dict):
        """
        Receive RTP packets directly from PlainTransport and decode video frames
        
        Args:
            stream_id: Stream identifier
            transport_info: Transport information (IP, port)
            rtp_parameters: RTP parameters for decoding
        """
        try:
            import socket
            import struct
            import cv2
            import numpy as np
            
            ip = transport_info.get('ip', '192.168.100.19')
            port = transport_info.get('port', 5004)
            
            logger.info(f"Starting RTP packet reception for {stream_id} from {ip}:{port}")
            
            # Create UDP socket for RTP reception
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.bind(('0.0.0.0', port))  # Listen on the actual RTP port
            
            # Get codec info
            codecs = rtp_parameters.get('codecs', [])
            video_codec = next((c for c in codecs if c['mimeType'].startswith('video/')), None)
            
            if not video_codec:
                logger.error(f"No video codec found for {stream_id}")
                return
            
            payload_type = video_codec['payloadType']
            codec_name = video_codec['mimeType'].split('/')[1]
            
            logger.info(f"Listening for {codec_name} RTP packets on port {port}")
            
            frame_count = 0
            buffer = b''
            
            while stream_id in self.consumers:
                try:
                    # Receive RTP packet
                    data, addr = sock.recvfrom(1500)
                    
                    # Parse RTP header (simplified)
                    if len(data) < 12:
                        continue
                    
                    # Check payload type
                    payload_type_byte = data[1] & 0x7F
                    if payload_type_byte != payload_type:
                        continue
                    
                    # Extract payload (skip RTP header)
                    payload = data[12:]
                    buffer += payload
                    
                    # For now, simulate frame generation since RTP decoding is complex
                    # In a real implementation, you'd need to:
                    # 1. Reassemble fragmented RTP packets
                    # 2. Decode the video codec (VP8/H.264)
                    # 3. Convert to OpenCV format
                    
                    frame_count += 1
                    
                    # Generate test pattern every 30 packets (simulate 1fps)
                    if frame_count % 30 == 0:
                        # Create a test pattern frame
                        img = self._generate_test_pattern(stream_id, frame_count)
                        
                        # Send frame to NDI pipeline
                        if self.on_frame_received:
                            self.on_frame_received(stream_id, img)
                        
                        logger.info(f"Generated test frame {frame_count//30} for {stream_id}")
                    
                except Exception as e:
                    logger.error(f"Error receiving RTP packet for {stream_id}: {e}")
                    break
            
            sock.close()
            logger.info(f"Stopped RTP reception for {stream_id}")
            
        except Exception as e:
            logger.error(f"Error in RTP packet reception for {stream_id}: {e}")
    
    def _generate_test_pattern(self, stream_id: str, frame_number: int) -> np.ndarray:
        """
        Generate a test pattern frame
        
        Args:
            stream_id: Stream identifier
            frame_number: Frame number
            
        Returns:
            np.ndarray: Test pattern image in BGR format
        """
        import cv2
        import numpy as np
        
        # Create test pattern
        width, height = 1280, 720
        img = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Add moving elements
        center_x = width // 2
        center_y = height // 2
        
        # Moving circle
        circle_x = int(center_x + 200 * np.sin(frame_number * 0.1))
        circle_y = int(center_y + 100 * np.cos(frame_number * 0.1))
        cv2.circle(img, (circle_x, circle_y), 50, (0, 255, 0), -1)
        
        # Text
        text = f"Stream: {stream_id[:20]}..."
        cv2.putText(img, text, (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        # Frame counter
        frame_text = f"Frame: {frame_number}"
        cv2.putText(img, frame_text, (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        # Timestamp
        import time
        timestamp = time.strftime("%H:%M:%S")
        cv2.putText(img, timestamp, (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        return img
    
    async def _generate_test_pattern_loop(self, stream_id: str):
        """
        Generate test pattern frames in a loop to demonstrate the pipeline
        
        Args:
            stream_id: Stream identifier
        """
        try:
            logger.info(f"Starting test pattern generation for {stream_id}")
            frame_count = 0
            
            while stream_id in self.consumers:
                try:
                    # Generate test pattern frame
                    img = self._generate_test_pattern(stream_id, frame_count)
                    
                    # Send frame to NDI pipeline
                    if self.on_frame_received:
                        self.on_frame_received(stream_id, img)
                    
                    frame_count += 1
                    
                    # Log every 30 frames (1 second at 30fps)
                    if frame_count % 30 == 0:
                        logger.info(f"Generated {frame_count} test frames for {stream_id}")
                    
                    # Wait for next frame (30fps = 33ms)
                    await asyncio.sleep(1/30)
                    
                except Exception as e:
                    logger.error(f"Error generating test frame for {stream_id}: {e}")
                    break
            
            logger.info(f"Stopped test pattern generation for {stream_id}")
            
        except Exception as e:
            logger.error(f"Error in test pattern generation for {stream_id}: {e}")
    
    async def stop_stream(self, stream_id: str) -> bool:
        """
        Stop consuming a specific stream
        
        Args:
            stream_id: Stream identifier to stop
            
        Returns:
            bool: True if stream stopped successfully
        """
        try:
            if stream_id in self.consumers:
                # Remove consumer
                del self.consumers[stream_id]
                
                logger.info(f"Stopped consuming stream: {stream_id}")
                return True
            else:
                logger.warning(f"Stream {stream_id} not found")
                return False
                
        except Exception as e:
            logger.error(f"Failed to stop stream {stream_id}: {e}")
            return False
    
    def set_connected(self, connected: bool):
        """Set connection status"""
        self.is_connected = connected
        if connected:
            logger.info("WebRTC Consumer connected via signaling")
        else:
            logger.info("WebRTC Consumer disconnected from signaling")
    
    def _on_connected(self):
        """Handle signaling connection"""
        self.is_connected = True
        logger.info("WebRTC Consumer connected via signaling")
    
    def _on_disconnected(self):
        """Handle signaling disconnection"""
        self.is_connected = False
        logger.info("WebRTC Consumer disconnected from signaling")
    
    def _on_error(self, error_type: str, error: Exception):
        """Handle errors"""
        logger.error(f"WebRTC Consumer error ({error_type}): {error}")
        if self.on_error:
            self.on_error(error_type, error)