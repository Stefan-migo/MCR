"""
Prometheus metrics for monitoring
"""

from prometheus_client import Counter, Gauge, Histogram, start_http_server
import logging

logger = logging.getLogger(__name__)

# Metrics
streams_total = Counter('ndi_bridge_streams_total', 'Total streams created')
streams_active = Gauge('ndi_bridge_streams_active', 'Currently active streams')
frames_received = Counter('ndi_bridge_frames_received_total', 'Total frames received', ['stream_id'])
frames_sent_ndi = Counter('ndi_bridge_frames_sent_ndi_total', 'Total frames sent to NDI', ['stream_id', 'method'])
frames_dropped = Counter('ndi_bridge_frames_dropped_total', 'Total frames dropped', ['stream_id', 'reason'])
frame_processing_latency = Histogram('ndi_bridge_frame_latency_seconds', 'Frame processing latency', ['stream_id'])
rtp_packets_received = Counter('ndi_bridge_rtp_packets_total', 'RTP packets received', ['stream_id'])
rtp_errors = Counter('ndi_bridge_rtp_errors_total', 'RTP reception errors', ['stream_id', 'error_type'])

def start_metrics_server(port: int = 9090):
    """
    Start Prometheus metrics HTTP server
    
    Args:
        port: Port to start metrics server on
    """
    try:
        start_http_server(port)
        logger.info(f"📊 Metrics server started on port {port}")
    except Exception as e:
        logger.error(f"Failed to start metrics server: {e}")

def record_frame_received(stream_id: str):
    """Record a frame received event"""
    frames_received.labels(stream_id=stream_id).inc()

def record_frame_sent_ndi(stream_id: str, method: str):
    """Record a frame sent to NDI event"""
    frames_sent_ndi.labels(stream_id=stream_id, method=method).inc()

def record_frame_dropped(stream_id: str, reason: str):
    """Record a frame dropped event"""
    frames_dropped.labels(stream_id=stream_id, reason=reason).inc()

def record_frame_latency(stream_id: str, latency_seconds: float):
    """Record frame processing latency"""
    frame_processing_latency.labels(stream_id=stream_id).observe(latency_seconds)

def record_rtp_packet(stream_id: str):
    """Record an RTP packet received event"""
    rtp_packets_received.labels(stream_id=stream_id).inc()

def record_rtp_error(stream_id: str, error_type: str):
    """Record an RTP error event"""
    rtp_errors.labels(stream_id=stream_id, error_type=error_type).inc()

def update_active_streams(count: int):
    """Update the active streams gauge"""
    streams_active.set(count)

def record_stream_created():
    """Record a stream creation event"""
    streams_total.inc()
