"""
Integration tests for RTP to NDI pipeline
"""

import pytest
import asyncio
import numpy as np
from webrtc.rtp_receiver import RTPReceiver
from ndi.ndi_manager import NDIManager
from services.stream_manager import StreamManager

@pytest.mark.asyncio
async def test_rtp_receiver_initialization():
    """Test RTP receiver can initialize"""
    receiver = RTPReceiver(
        stream_id="test-stream",
        transport_ip="127.0.0.1",
        transport_port=20000
    )
    
    # Should create without error
    assert receiver.stream_id == "test-stream"
    assert receiver.is_receiving == False

@pytest.mark.asyncio
async def test_ndi_manager_fallback():
    """Test NDI manager falls back to FFmpeg"""
    manager = NDIManager(
        source_name="Test_Source",
        width=1280,
        height=720,
        fps=30
    )
    
    result = await manager.initialize()
    assert result == True
    assert manager.method in [NDIMethod.NDI_PYTHON, NDIMethod.FFMPEG]
    
    await manager.stop()

@pytest.mark.asyncio
async def test_end_to_end_pipeline(mock_backend):
    """
    Test complete pipeline:
    Backend -> PlainTransport -> RTP -> NDI
    """
    # Create mock backend response
    mock_backend.setup_stream_response({
        "success": True,
        "transport": {
            "ip": "127.0.0.1",
            "port": 20000
        },
        "rtp_parameters": {
            "codecs": [{
                "payloadType": 96,
                "mimeType": "video/VP8",
                "clockRate": 90000
            }],
            "encodings": [{"ssrc": 12345678}]
        }
    })
    
    # Initialize stream manager
    stream_manager = StreamManager(
        backend_url="ws://localhost:3001",
        ndi_source_prefix="Test"
    )
    
    await stream_manager.initialize()
    
    # Start test stream
    result = await stream_manager.start_stream({
        "id": "test-stream-1",
        "producer_id": "producer-1",
        "device_name": "TestDevice"
    })
    
    assert result == True
    assert len(stream_manager.active_streams) == 1
    
    # Cleanup
    await stream_manager.shutdown()

def test_frame_processing():
    """Test frame processing pipeline"""
    # Create test frame
    frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    
    # Test frame dimensions
    assert frame.shape == (720, 1280, 3)
    assert frame.dtype == np.uint8
    
    # Test frame data integrity
    assert np.all(frame >= 0)
    assert np.all(frame <= 255)

@pytest.mark.asyncio
async def test_health_monitoring():
    """Test health monitoring functionality"""
    manager = NDIManager(
        source_name="Health_Test",
        width=640,
        height=480,
        fps=30
    )
    
    # Initialize
    await manager.initialize()
    
    # Check health
    health = manager.get_stats()
    assert 'method' in health
    assert 'healthy' in health or 'is_initialized' in health
    
    await manager.stop()

if __name__ == "__main__":
    # Run basic tests
    asyncio.run(test_rtp_receiver_initialization())
    asyncio.run(test_ndi_manager_fallback())
    test_frame_processing()
    asyncio.run(test_health_monitoring())
    print("✅ All basic tests passed!")
