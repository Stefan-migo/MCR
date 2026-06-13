import socket
import threading
from typing import Callable, Optional


# NAL unit type constants
NAL_TYPE_SINGLE_MIN = 0
NAL_TYPE_SINGLE_MAX = 23
NAL_TYPE_STAP_A = 24
NAL_TYPE_FU_A = 28


class RtpReceiver:
    """UDP receiver that captures RTP/H.264 packets and depacketizes NAL units.

    Per-stream instance: binds to an ephemeral port, sends a dummy packet for
    the comedia handshake, then runs a receive loop that extracts H.264 NAL
    units from the RTP payload (single NAL, FU-A fragmentation, STAP-A
    aggregation).
    """

    def __init__(self, local_port: int = 0):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind(("0.0.0.0", local_port))
        self.sock.settimeout(1.0)
        self.local_port = self.sock.getsockname()[1]
        self.running = False
        self._thread: Optional[threading.Thread] = None
        # FU-A fragment buffer keyed by (ssrc, timestamp)
        self._fua_buffer: dict[tuple[int, int], bytes] = {}
        self._last_sequence: dict[int, int] = {}

    @property
    def local_address(self) -> tuple:
        return ("0.0.0.0", self.local_port)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def send_dummy_packet(self, target_ip: str, target_port: int):
        """Comedia handshake: send a single byte to wake up PlainTransport."""
        self.sock.sendto(b"\x00", (target_ip, target_port))

    def start(self, callback: Callable[[dict], None]):
        """Start the receive loop in a daemon thread."""
        self.running = True
        self._thread = threading.Thread(
            target=self._recv_loop, args=(callback,), daemon=True
        )
        self._thread.start()

    def stop(self):
        """Stop the receive loop and close the socket."""
        self.running = False
        if self._thread:
            self._thread.join(timeout=2)
        self.sock.close()
        self._fua_buffer.clear()

    # ------------------------------------------------------------------
    # Internal: receive loop
    # ------------------------------------------------------------------

    def _recv_loop(self, callback: Callable[[dict], None]):
        pkt_count = 0
        while self.running:
            try:
                data, addr = self.sock.recvfrom(65535)
                pkt_count += 1
                if pkt_count <= 3:
                    print(f"[RTP] Packet #{pkt_count} from {addr}, size={len(data)}B, "
                          f"payload_type={(data[1] & 0x7F) if len(data) > 1 else '?'}, "
                          f"seq={(data[2] << 8 | data[3]) if len(data) > 3 else '?'}")
                if pkt_count % 500 == 0:
                    print(f"[RTP] Received {pkt_count} packets so far")

                nals = self._depacketize_h264(data)
                for nal in nals:
                    callback(nal)
            except socket.timeout:
                continue
            except OSError:
                break  # socket closed
            except Exception as e:
                print(f"[RTP] Error: {e}")

    # ------------------------------------------------------------------
    # H.264 RTP depacketization  (RFC 6184)
    # ------------------------------------------------------------------

    def _depacketize_h264(self, rtp_packet: bytes) -> list[dict]:
        """Parse RTP header and extract H.264 NAL units.

        Returns a list of dicts with keys: data (NAL unit bytes),
        timestamp, sequence.
        """
        if len(rtp_packet) < 12:
            return []

        # RTP header fields (first 12 bytes)
        # payload_type = rtp_packet[1] & 0x7F
        sequence_number = (rtp_packet[2] << 8) | rtp_packet[3]
        timestamp = int.from_bytes(rtp_packet[4:8], "big")
        ssrc = int.from_bytes(rtp_packet[8:12], "big")

        payload = rtp_packet[12:]
        if not payload:
            return []

        nal_type = payload[0] & 0x1F

        if nal_type <= NAL_TYPE_SINGLE_MAX:
            return [
                {
                    "data": payload,
                    "timestamp": timestamp,
                    "sequence": sequence_number,
                }
            ]
        elif nal_type == NAL_TYPE_FU_A:
            return self._parse_fua(payload, timestamp, sequence_number, ssrc)
        elif nal_type == NAL_TYPE_STAP_A:
            return self._parse_stap(payload, timestamp, sequence_number)
        # Other aggregation / fragmentation modes: silently dropped
        return []

    def _parse_fua(
        self,
        payload: bytes,
        timestamp: int,
        sequence: int,
        ssrc: int,
    ) -> list[dict]:
        """Parse FU-A fragmented NAL unit.

        Reassembles fragments across consecutive RTP packets using
        (ssrc, timestamp) as the fragment key.
        """
        if len(payload) < 2:
            return []

        fu_indicator = payload[0]
        fu_header = payload[1]
        start_bit = (fu_header >> 7) & 0x01
        end_bit = (fu_header >> 6) & 0x01
        nal_type = fu_header & 0x1F

        # Reconstruct the original NAL header from FU indicator + FU header
        nal_header = bytes([(fu_indicator & 0xE0) | nal_type])
        fragment_payload = payload[2:]

        key = (ssrc, timestamp)

        if start_bit:
            # Start of a new fragmented NAL unit
            self._fua_buffer[key] = nal_header + fragment_payload
            self._last_sequence[ssrc] = sequence
            return []
        elif key in self._fua_buffer:
            # Continuation or end of a fragmented NAL unit
            self._fua_buffer[key] += fragment_payload
            self._last_sequence[ssrc] = sequence

            if end_bit:
                nal_data = self._fua_buffer.pop(key)
                return [
                    {
                        "data": nal_data,
                        "timestamp": timestamp,
                        "sequence": sequence,
                    }
                ]
        # else: middle fragment, keep buffering
        return []

    def _parse_stap_a(
        self,
        payload: bytes,
        timestamp: int,
        sequence: int,
    ) -> list[dict]:
        """Parse STAP-A aggregated NAL unit packet."""
        # Skip the STAP-A NAL type byte
        offset = 1
        result: list[dict] = []

        while offset < len(payload):
            if offset + 2 > len(payload):
                break
            nalu_size = (payload[offset] << 8) | payload[offset + 1]
            offset += 2
            if offset + nalu_size > len(payload):
                break
            nal_data = payload[offset : offset + nalu_size]
            result.append(
                {
                    "data": nal_data,
                    "timestamp": timestamp,
                    "sequence": sequence,
                }
            )
            offset += nalu_size

        return result

    # Alias for backward compatibility with the spec naming
    _parse_stap = _parse_stap_a
