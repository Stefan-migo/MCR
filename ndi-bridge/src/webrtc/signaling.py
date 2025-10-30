"""
WebRTC Signaling - Handles WebSocket communication with backend
"""

import asyncio
import json
import logging
import socketio
import ssl
from typing import Dict, Optional, Callable, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class WebRTCSignaling:
    """
    Handles WebSocket signaling with Mediasoup backend
    """
    
    def __init__(self, backend_url: str):
        """
        Initialize WebRTC signaling
        
        Args:
            backend_url: Backend WebSocket URL
        """
        self.backend_url = backend_url
        self.sio: Optional[socketio.AsyncClient] = None
        self.is_connected = False
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 5
        self.reconnect_delay = 1.0  # seconds
        
        # Callbacks
        self.on_connected: Optional[Callable[[], None]] = None
        self.on_disconnected: Optional[Callable[[], None]] = None
        self.on_error: Optional[Callable[[str], None]] = None
        self.on_message: Optional[Callable[[dict], None]] = None
        
        # Message handlers
        self.message_handlers: Dict[str, Callable[[dict], None]] = {}
        
        logger.info(f"WebRTC Signaling initialized for: {backend_url}")
    
    async def connect(self) -> bool:
        """
        Connect to backend WebSocket
        
        Returns:
            bool: True if connection successful
        """
        try:
            # Create Socket.io client with SSL verification disabled for self-signed certs
            self.sio = socketio.AsyncClient(ssl_verify=False)
            
            # Set up event handlers
            @self.sio.event
            async def connect():
                self.is_connected = True
                self.reconnect_attempts = 0
                logger.info("Connected to backend Socket.io")
                if self.on_connected:
                    self.on_connected()
            
            @self.sio.event
            async def disconnect():
                self.is_connected = False
                logger.info("Disconnected from backend Socket.io")
                if self.on_disconnected:
                    self.on_disconnected()
            
            @self.sio.event
            async def connect_error(data):
                logger.error(f"Socket.io connection error: {data}")
                if self.on_error:
                    self.on_error(str(data))
            
            # Set up message handlers for stream events
            @self.sio.on('stream-started')
            async def on_stream_started(data):
                logger.info(f"📹 Stream started event received: {data}")
                if "stream-started" in self.message_handlers:
                    await self.message_handlers["stream-started"](data)
            
            @self.sio.on('stream-ended')
            async def on_stream_ended(data):
                logger.info(f"🛑 Stream ended event received: {data}")
                if "stream-ended" in self.message_handlers:
                    await self.message_handlers["stream-ended"](data)
            
            @self.sio.on('stream-stats')
            async def on_stream_stats(data):
                logger.debug(f"📊 Stream stats event received: {data}")
                if "stream-stats" in self.message_handlers:
                    await self.message_handlers["stream-stats"](data)
            
            # Connect to the backend
            await self.sio.connect(self.backend_url)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to backend: {e}")
            if self.on_error:
                self.on_error(f"Connection failed: {e}")
            return False
    
    async def disconnect(self):
        """
        Disconnect from backend WebSocket
        """
        try:
            if self.sio:
                await self.sio.disconnect()
                self.sio = None
            
            self.is_connected = False
            
            logger.info("Disconnected from backend WebSocket")
            
            if self.on_disconnected:
                self.on_disconnected()
                
        except Exception as e:
            logger.error(f"Error during disconnect: {e}")
    
    async def send_message(self, message: dict) -> bool:
        """
        Send message to backend
        
        Args:
            message: Message to send
            
        Returns:
            bool: True if message sent successfully
        """
        try:
            if not self.is_connected or not self.sio:
                logger.error("Not connected to backend")
                return False
            
            # Send message using Socket.io emit
            event = message.get('type', 'message')
            data = message.get('data', message)
            await self.sio.emit(event, data)
            
            logger.debug(f"Sent message: {event}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            if self.on_error:
                self.on_error(f"Send failed: {e}")
            return False
    
    async def request_rtp_capabilities(self) -> Optional[dict]:
        """
        Get consumer RTP capabilities for NDI bridge
        
        Returns:
            dict: Consumer RTP capabilities
        """
        try:
            # Return consumer RTP capabilities for NDI bridge
            # These describe what the NDI bridge can receive, not what the backend can produce
            rtp_capabilities = {
                "codecs": [
                    {
                        "kind": "video",
                        "mimeType": "video/VP8",
                        "clockRate": 90000,
                        "parameters": {},
                        "rtcpFeedback": [
                            {"type": "goog-remb"},
                            {"type": "transport-cc"},
                            {"type": "ccm", "parameter": "fir"},
                            {"type": "nack"},
                            {"type": "nack", "parameter": "pli"}
                        ]
                    },
                    {
                        "kind": "video",
                        "mimeType": "video/H264",
                        "clockRate": 90000,
                        "parameters": {
                            "packetization-mode": 1,
                            "profile-level-id": "42e01f"
                        },
                        "rtcpFeedback": [
                            {"type": "nack"},
                            {"type": "nack", "parameter": "pli"},
                            {"type": "ccm", "parameter": "fir"},
                            {"type": "goog-remb"},
                            {"type": "transport-cc"}
                        ]
                    },
                    {
                        "kind": "video",
                        "mimeType": "video/rtx",
                        "clockRate": 90000,
                        "parameters": {
                            "apt": 107
                        },
                        "rtcpFeedback": []
                    },
                    {
                        "kind": "audio",
                        "mimeType": "audio/opus",
                        "clockRate": 48000,
                        "channels": 2,
                        "rtcpFeedback": [
                            {"type": "transport-cc"}
                        ]
                    }
                ],
                "headerExtensions": [
                    {
                        "kind": "video",
                        "uri": "urn:ietf:params:rtp-hdrext:sdes:mid",
                        "id": 9,
                        "preferredId": 9
                    },
                    {
                        "kind": "video",
                        "uri": "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
                        "id": 10,
                        "preferredId": 10
                    },
                    {
                        "kind": "video",
                        "uri": "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
                        "id": 11,
                        "preferredId": 11
                    },
                    {
                        "kind": "video", 
                        "uri": "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
                        "id": 2,
                        "preferredId": 2
                    },
                    {
                        "kind": "video",
                        "uri": "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
                        "id": 4,
                        "preferredId": 4
                    },
                    {
                        "kind": "video",
                        "uri": "urn:3gpp:video-orientation",
                        "id": 3,
                        "preferredId": 3
                    },
                    {
                        "kind": "video",
                        "uri": "urn:ietf:params:rtp-hdrext:toffset",
                        "id": 1,
                        "preferredId": 1
                    },
                    {
                        "kind": "video",
                        "uri": "http://www.webrtc.org/experiments/rtp-hdrext/abs-capture-time",
                        "id": 12,
                        "preferredId": 12
                    },
                    {
                        "kind": "video",
                        "uri": "http://www.webrtc.org/experiments/rtp-hdrext/playout-delay",
                        "id": 5,
                        "preferredId": 5
                    }
                ]
            }
            
            logger.info(f"🔧 NDI Bridge RTP Capabilities: {rtp_capabilities}")
            return rtp_capabilities
            
        except Exception as e:
            logger.error(f"Failed to create consumer RTP capabilities: {e}")
            return None
    
    async def create_plain_transport(self) -> Optional[dict]:
        """
        Create plain transport for NDI bridge
        
        Returns:
            dict: Transport info or None if failed
        """
        try:
            message = {
                "type": "create-plain-transport",
                "data": {
                    "client_type": "ndi-bridge"
                }
            }
            
            if await self.send_message(message):
                response = await self._wait_for_response("plain-transport-created", timeout=5.0)
                return response.get("data") if response else None
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to create plain transport: {e}")
            return None
    
    async def create_consumer(self, producer_id: str, rtp_capabilities: dict) -> Optional[dict]:
        """
        Create consumer for producer
        
        Args:
            producer_id: Producer ID to consume
            rtp_capabilities: RTP capabilities
            
        Returns:
            dict: Consumer info or None if failed
        """
        try:
            logger.info(f"🔧 Creating consumer for producer {producer_id}")
            logger.info(f"🔧 Using RTP capabilities: {rtp_capabilities}")
            
            message = {
                "type": "create-consumer",
                "data": {
                    "producer_id": producer_id,
                    "rtp_capabilities": rtp_capabilities
                }
            }
            
            if await self.send_message(message):
                response = await self._wait_for_response("consumer-created", timeout=5.0)
                logger.info(f"🔧 Consumer creation response: {response}")
                return response.get("data") if response else None
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to create consumer: {e}")
            return None
    
    async def get_active_producers(self) -> Optional[list]:
        """
        Get list of active producers
        
        Returns:
            list: List of active producers or None if failed
        """
        try:
            if not self.is_connected or not self.sio:
                logger.error("Not connected to backend")
                return None
            
            logger.info("🔍 Requesting active streams from backend...")
            # Use the correct backend event for requesting streams
            response = await self.sio.call('ndi-bridge-request-streams', {})
            
            logger.info(f"📡 Backend response: {response}")
            
            if response and response.get('success'):
                streams = response.get('streams', [])
                logger.info(f"✅ Found {len(streams)} active streams")
                return streams
            else:
                logger.error(f"Failed to get active streams: {response.get('error', 'Unknown error')}")
                return None
            
        except Exception as e:
            logger.error(f"Failed to get active producers: {e}")
            return None
    
    def register_message_handler(self, message_type: str, handler: Callable[[dict], None]):
        """
        Register handler for specific message type
        
        Args:
            message_type: Message type to handle
            handler: Handler function
        """
        self.message_handlers[message_type] = handler
        logger.debug(f"Registered handler for message type: {message_type}")
    
    async def _listen_for_messages(self):
        """
        Listen for incoming WebSocket messages
        """
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON message: {message}")
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed")
            self.is_connected = False
            
            if self.on_disconnected:
                self.on_disconnected()
            
            # Attempt reconnection
            await self._attempt_reconnect()
            
        except Exception as e:
            logger.error(f"Error listening for messages: {e}")
            self.is_connected = False
    
    async def _handle_message(self, data: dict):
        """
        Handle incoming WebSocket message
        
        Args:
            data: Message data
        """
        try:
            message_type = data.get("type")
            
            if message_type in self.message_handlers:
                handler = self.message_handlers[message_type]
                await handler(data)
            else:
                logger.debug(f"Unhandled message type: {message_type}")
            
            # Call general message callback
            if self.on_message:
                self.on_message(data)
                
        except Exception as e:
            logger.error(f"Error handling message: {e}")
    
    async def _wait_for_response(self, response_type: str, timeout: float = 5.0) -> Optional[dict]:
        """
        Wait for specific response type
        
        Args:
            response_type: Expected response type
            timeout: Timeout in seconds
            
        Returns:
            dict: Response data or None if timeout
        """
        try:
            response_received = asyncio.Event()
            response_data = None
            
            def response_handler(data):
                nonlocal response_data
                if data.get("type") == response_type:
                    response_data = data
                    response_received.set()
            
            # Register temporary handler
            self.register_message_handler(response_type, response_handler)
            
            # Wait for response
            try:
                await asyncio.wait_for(response_received.wait(), timeout=timeout)
                return response_data
            except asyncio.TimeoutError:
                logger.warning(f"Timeout waiting for response: {response_type}")
                return None
            finally:
                # Remove temporary handler
                if response_type in self.message_handlers:
                    del self.message_handlers[response_type]
                    
        except Exception as e:
            logger.error(f"Error waiting for response: {e}")
            return None
    
    async def _attempt_reconnect(self):
        """
        Attempt to reconnect to backend
        """
        while self.reconnect_attempts < self.max_reconnect_attempts:
            self.reconnect_attempts += 1
            delay = self.reconnect_delay * (2 ** (self.reconnect_attempts - 1))  # Exponential backoff
            
            logger.info(f"Attempting reconnection {self.reconnect_attempts}/{self.max_reconnect_attempts} in {delay}s...")
            await asyncio.sleep(delay)
            
            if await self.connect():
                logger.info("Reconnection successful")
                return
        
        logger.error("Max reconnection attempts reached")
        if self.on_error:
            self.on_error("Max reconnection attempts reached")
    
    def get_connection_status(self) -> dict:
        """
        Get current connection status
        
        Returns:
            dict: Connection status information
        """
        return {
            "is_connected": self.is_connected,
            "backend_url": self.backend_url,
            "reconnect_attempts": self.reconnect_attempts,
            "max_reconnect_attempts": self.max_reconnect_attempts
        }
