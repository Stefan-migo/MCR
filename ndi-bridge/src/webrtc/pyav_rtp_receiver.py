"""
PyAV-based RTP Receiver for VP8 video streams
Receives RTP packets via UDP socket and decodes VP8 frames using PyAV
"""

import asyncio
import logging
import struct
import time
from typing import Optional, Callable, Tuple
import numpy as np
import av

logger = logging.getLogger(__name__)

class UDPRTPReceiver:
    """
    UDP RTP Receiver using PyAV for VP8 decoding
    Receives RTP packets from Mediasoup PlainTransport and decodes VP8 frames
    """
    
    def __init__(
        self, 
        stream_id: str, 
        transport_ip: str, 
        transport_port: int,
        on_frame: Optional[Callable[[np.ndarray], None]] = None
    ):
        """
        Initialize UDP RTP receiver
        
        Args:
            stream_id: Stream identifier
            transport_ip: IP address to bind to (usually 0.0.0.0)
            transport_port: UDP port to receive RTP packets
            on_frame: Callback function for decoded frames
        """
        self.stream_id = stream_id
        self.transport_ip = transport_ip
        self.transport_port = transport_port
        self.on_frame = on_frame
        
        # UDP transport and protocol
        self.transport: Optional[asyncio.DatagramTransport] = None
        self.protocol: Optional[asyncio.DatagramProtocol] = None
        self.is_receiving = False
        
        # PyAV codec for VP8 decoding
        self.codec_context: Optional[av.CodecContext] = None
        
        # RTP packet handling
        self.expected_sequence = 0
        self.packet_buffer = {}  # For handling out-of-order packets
        self.vp8_frame_buffers = {}  # timestamp -> bytearray for assembling VP8 frames
        
        # Statistics
        self.stats = {
            "packets_received": 0,
            "packets_dropped": 0,
            "frames_decoded": 0,
            "bytes_received": 0,
            "last_packet_time": 0,
            "fps": 0.0
        }
        
        # Frame timing
        self.last_frame_time = 0
        self.frame_times = []
        
        logger.info(f"UDP RTP Receiver initialized for {stream_id} on {transport_ip}:{transport_port}")
    
    async def start(self) -> bool:
        """
        Start receiving RTP stream via UDP socket.
        """
        try:
            loop = asyncio.get_running_loop()
            
            # Create UDP socket
            self.transport, self.protocol = await loop.create_datagram_endpoint(
                lambda: RTPReceiverProtocol(self),
                local_addr=(self.transport_ip, self.transport_port)
            )
            
            # Initialize PyAV VP8 decoder
            self.codec_context = av.CodecContext.create('vp8', 'r')
            
            self.is_receiving = True
            logger.info(f"✅ UDP RTP receiver started for {self.stream_id} on {self.transport_ip}:{self.transport_port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start UDP RTP receiver for {self.stream_id}: {e}")
            return False

    async def stop(self):
        """
        Stop receiving RTP stream.
        """
        if self.is_receiving:
            self.is_receiving = False
            if self.transport:
                self.transport.close()
            logger.info(f"UDP RTP receiver stopped for {self.stream_id}")

    def _process_rtp_packet(self, data: bytes, addr: Tuple[str, int]):
        """
        Process a single RTP packet.
        """
        if not self.is_receiving or not self.codec_context:
            return

        # Basic RTP header parsing (12 bytes)
        # V=2, P, X, CC, M, PT, Sequence Number, Timestamp, SSRC
        # We are primarily interested in the payload
        
        if len(data) < 12:
            logger.warning(f"Received malformed RTP packet (too short): {len(data)} bytes")
            return

        # Extract RTP header fields
        # Byte 0: V P X CC
        # Byte 1: M PT PT PT PT PT PT PT
        # Bytes 2-3: Sequence Number
        # Bytes 4-7: Timestamp
        # Bytes 8-11: SSRC
        
        header = (
            (data[0] >> 6) & 0x03,  # Version (V)
            (data[0] >> 5) & 0x01,  # Padding (P)
            (data[0] >> 4) & 0x01,  # Extension (X)
            data[0] & 0x0F,         # CSRC Count (CC)
            (data[1] >> 7) & 0x01,  # Marker (M)
            data[1] & 0x7F,         # Payload Type (PT)
            int.from_bytes(data[2:4], 'big'), # Sequence Number
            int.from_bytes(data[4:8], 'big'), # Timestamp
            int.from_bytes(data[8:12], 'big') # SSRC
        )
        
        version, padding, extension, cc, marker, payload_type, sequence, timestamp, ssrc = header
        
        self.stats["packets_received"] += 1
        self.stats["bytes_received"] += len(data)
        self.stats["last_packet_time"] = time.time()
        
        # Skip if not VP8 payload (PT=107 for VP8 from mobile device, PT=101 for NDI bridge)
        if payload_type not in [101, 107]:
            return
        
        # Debug logging for RTP packets
        if self.stats["packets_received"] % 100 == 0:
            logger.info(f"📦 RTP packet: PT={payload_type}, Seq={sequence}, SSRC={ssrc}, Size={len(data)}")
        
        # Calculate header length (12 + 4*cc + extension length)
        header_length = 12 + 4 * cc
        if extension:
            if len(data) < header_length + 4:
                logger.warning(f"Received malformed RTP packet with extension (too short): {len(data)} bytes")
                return
            # Read extension header (2 bytes ID, 2 bytes length in 4-byte words)
            ext_header_len = int.from_bytes(data[header_length+2:header_length+4], 'big') * 4
            header_length += (4 + ext_header_len) # Add extension header and data length
        
        # VP8 payload (starts with VP8 payload descriptor per RFC 7741)
        vp8_payload = data[header_length:]

        if not vp8_payload:
            logger.debug("Received empty VP8 payload")
            return

        try:
            # Parse VP8 payload descriptor to find the start of actual VP8 payload
            # https://datatracker.ietf.org/doc/html/rfc7741
            desc_offset = 0
            b0 = vp8_payload[0]
            X = (b0 >> 7) & 0x01
            S = (b0 >> 4) & 0x01  # Start of partition
            # N and PartID not used for basic depacketization
            desc_offset += 1

            I = L = T = K = 0
            if X:
                b1 = vp8_payload[desc_offset]
                I = (b1 >> 7) & 0x01
                L = (b1 >> 6) & 0x01
                T = (b1 >> 5) & 0x01
                K = (b1 >> 4) & 0x01
                desc_offset += 1
                if I:
                    # PictureID, 1 or 2 bytes depending on M bit
                    picid_b = vp8_payload[desc_offset]
                    Mbit = (picid_b >> 7) & 0x01
                    desc_offset += 1
                    if Mbit:
                        # 15-bit picture id, read one more byte
                        desc_offset += 1
                if L:
                    # TL0PICIDX
                    desc_offset += 1
                if T or K:
                    # TID/Y/KEYIDX
                    desc_offset += 1

            # Actual VP8 payload after descriptor and any extensions
            elementary_payload = vp8_payload[desc_offset:]
            if not elementary_payload:
                return

            # Assemble fragments for this RTP timestamp
            buf = self.vp8_frame_buffers.get(timestamp)
            if buf is None or S:
                # Start new buffer on start bit or if none exists
                buf = bytearray()
                self.vp8_frame_buffers[timestamp] = buf
            buf.extend(elementary_payload)

            # If marker bit set, frame is complete for this timestamp -> decode
            if marker:
                frame_bytes = bytes(self.vp8_frame_buffers.pop(timestamp, b""))
                if not frame_bytes:
                    return
                packet = av.Packet(frame_bytes)
                packet.pts = timestamp
                packet.dts = timestamp
                frames = self.codec_context.decode(packet)
            
            for frame in frames:
                # Convert PyAV VideoFrame to NumPy array (BGR format)
                # NDI expects BGRA, but our sender converts BGR to BGRA
                img = frame.to_ndarray(format='bgr24')
                
                if self.on_frame:
                    self.on_frame(img)
                self.stats["frames_decoded"] += 1
                if self.stats["frames_decoded"] % 30 == 0:
                    logger.debug(f"Decoded {self.stats['frames_decoded']} frames for {self.stream_id}")

        except av.AVError as e:
            logger.warning(f"PyAV decoding error for {self.stream_id}: {e}")
        except Exception as e:
            logger.error(f"Error processing RTP packet for {self.stream_id}: {e}")

class RTPReceiverProtocol(asyncio.DatagramProtocol):
    def __init__(self, receiver: UDPRTPReceiver):
        self.receiver = receiver
        self.transport = None

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        self.receiver._process_rtp_packet(data, addr)

    def error_received(self, exc):
        logger.error(f"UDP error received: {exc}")

    def connection_lost(self, exc):
        logger.info("UDP connection lost")