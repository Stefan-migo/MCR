"""
Integration Tests for NDI Bridge
"""

import pytest
import asyncio
import numpy as np
from unittest.mock import Mock, AsyncMock, patch
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.stream_manager import StreamManager
from ndi.sender import NDISender
from webrtc.consumer import WebRTCConsumer
from processing.pipeline import StreamPipeline
from config.settings import Settings


class TestNDISender:
    """Test NDI Sender functionality"""
    
    @pytest.mark.asyncio
    async def test_ndi_sender_initialization(self):
        """Test NDI sender initialization"""
        sender = NDISender("TestSource", 1280, 720, 30)
        assert sender.source_name == "TestSource"
        assert sender.width == 1280
        assert sender.height == 720
        assert sender.fps == 30
        assert not sender.is_initialized
    
    @pytest.mark.asyncio
    async def test_ndi_sender_without_sdk(self):
        """Test NDI sender behavior without SDK"""
        sender = NDISender("TestSource")
        
        # Mock the NDI import to fail
        with patch('ndi.sender.NDIlib', side_effect=ImportError):
            result = await sender.initialize()
            assert not result
            assert not sender.is_initialized
    
    def test_ndi_sender_stats(self):
        """Test NDI sender statistics"""
        sender = NDISender("TestSource")
        stats = sender.get_stats()
        
        assert stats["source_name"] == "TestSource"
        assert stats["is_initialized"] == False
        assert stats["frame_count"] == 0


class TestStreamPipeline:
    """Test Stream Pipeline functionality"""
    
    @pytest.mark.asyncio
    async def test_pipeline_creation(self):
        """Test pipeline creation"""
        mock_sender = Mock()
        pipeline = StreamPipeline("test_stream", mock_sender, max_queue_size=5)
        
        assert pipeline.stream_id == "test_stream"
        assert pipeline.max_queue_size == 5
        assert not pipeline.is_processing
    
    @pytest.mark.asyncio
    async def test_pipeline_start_stop(self):
        """Test pipeline start and stop"""
        mock_sender = Mock()
        pipeline = StreamPipeline("test_stream", mock_sender)
        
        # Start pipeline
        await pipeline.start()
        assert pipeline.is_processing
        
        # Stop pipeline
        await pipeline.stop()
        assert not pipeline.is_processing
    
    @pytest.mark.asyncio
    async def test_pipeline_frame_processing(self):
        """Test frame processing"""
        mock_sender = Mock()
        mock_sender.send_frame = AsyncMock(return_value=True)
        
        pipeline = StreamPipeline("test_stream", mock_sender)
        await pipeline.start()
        
        # Create test frame
        test_frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
        
        # Add frame to pipeline
        await pipeline.add_frame(test_frame)
        
        # Wait a bit for processing
        await asyncio.sleep(0.1)
        
        # Check that send_frame was called
        mock_sender.send_frame.assert_called()
        
        await pipeline.stop()
    
    def test_pipeline_stats(self):
        """Test pipeline statistics"""
        mock_sender = Mock()
        pipeline = StreamPipeline("test_stream", mock_sender)
        
        stats = pipeline.get_stats()
        assert stats["stream_id"] == "test_stream"
        assert stats["is_processing"] == False
        assert stats["queue_size"] == 0


class TestWebRTCConsumer:
    """Test WebRTC Consumer functionality"""
    
    @pytest.mark.asyncio
    async def test_consumer_initialization(self):
        """Test consumer initialization"""
        consumer = WebRTCConsumer("ws://localhost:3001")
        
        assert consumer.backend_url == "ws://localhost:3001"
        assert not consumer.is_connected
        assert len(consumer.peer_connections) == 0
    
    @pytest.mark.asyncio
    async def test_consumer_connection_failure(self):
        """Test consumer connection failure"""
        consumer = WebRTCConsumer("ws://invalid-url")
        
        result = await consumer.connect()
        assert not result
        assert not consumer.is_connected


class TestStreamManager:
    """Test Stream Manager functionality"""
    
    @pytest.mark.asyncio
    async def test_stream_manager_initialization(self):
        """Test stream manager initialization"""
        manager = StreamManager("ws://localhost:3001", "TestPrefix")
        
        assert manager.backend_url == "ws://localhost:3001"
        assert manager.ndi_source_prefix == "TestPrefix"
        assert len(manager.active_streams) == 0
    
    @pytest.mark.asyncio
    async def test_stream_manager_without_connection(self):
        """Test stream manager without backend connection"""
        manager = StreamManager("ws://invalid-url", "TestPrefix")
        
        result = await manager.initialize()
        assert not result
    
    def test_stream_manager_stats(self):
        """Test stream manager statistics"""
        manager = StreamManager("ws://localhost:3001", "TestPrefix")
        
        stats = manager.get_all_stats()
        assert "manager_stats" in stats
        assert "stream_stats" in stats
        assert "total_active_streams" in stats


class TestSettings:
    """Test Configuration Settings"""
    
    def test_default_settings(self):
        """Test default settings"""
        settings = Settings()
        
        assert settings.backend_url == "http://localhost:3001"
        assert settings.ndi_source_prefix == "MobileCam"
        assert settings.max_streams == 10
        assert settings.default_width == 1280
        assert settings.default_height == 720
    
    def test_settings_validation(self):
        """Test settings validation"""
        settings = Settings()
        errors = settings.validate_configuration()
        
        # Should have no errors with default settings
        assert len(errors) == 0
    
    def test_invalid_settings(self):
        """Test invalid settings validation"""
        # Create settings with invalid values
        settings = Settings(
            max_streams=-1,
            default_width=0,
            processing_quality="invalid"
        )
        
        errors = settings.validate_configuration()
        assert len(errors) > 0
        assert any("max_streams must be greater than 0" in error for error in errors)
        assert any("default_width and default_height must be greater than 0" in error for error in errors)
        assert any("processing_quality must be" in error for error in errors)
    
    def test_ndi_source_name_generation(self):
        """Test NDI source name generation"""
        settings = Settings()
        
        name1 = settings.get_ndi_source_name("iPhone 12")
        assert name1 == "MobileCam_iPhone_12"
        
        name2 = settings.get_ndi_source_name("Device@#$%")
        assert name2 == "MobileCam_Device"
    
    def test_ice_servers_list(self):
        """Test ICE servers list"""
        settings = Settings()
        ice_servers = settings.get_ice_servers_list()
        
        assert isinstance(ice_servers, list)
        assert len(ice_servers) > 0
        assert "urls" in ice_servers[0]


class TestIntegration:
    """Integration tests"""
    
    @pytest.mark.asyncio
    async def test_full_pipeline_simulation(self):
        """Test full pipeline simulation without actual NDI/WebRTC"""
        # Mock NDI sender
        mock_sender = Mock()
        mock_sender.initialize = AsyncMock(return_value=True)
        mock_sender.send_frame = AsyncMock(return_value=True)
        mock_sender.get_stats = Mock(return_value={"frame_count": 0})
        
        # Create pipeline
        pipeline = StreamPipeline("test_stream", mock_sender)
        await pipeline.start()
        
        # Simulate frame processing
        for i in range(10):
            test_frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
            await pipeline.add_frame(test_frame)
            await asyncio.sleep(0.01)  # Small delay
        
        # Wait for processing
        await asyncio.sleep(0.1)
        
        # Check results
        stats = pipeline.get_stats()
        assert stats["frames_received"] == 10
        assert mock_sender.send_frame.call_count > 0
        
        await pipeline.stop()
    
    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test error handling in pipeline"""
        mock_sender = Mock()
        mock_sender.send_frame = AsyncMock(side_effect=Exception("Test error"))
        
        pipeline = StreamPipeline("test_stream", mock_sender)
        await pipeline.start()
        
        # Add frame that will cause error
        test_frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
        await pipeline.add_frame(test_frame)
        
        # Wait for processing
        await asyncio.sleep(0.1)
        
        # Pipeline should still be running despite error
        assert pipeline.is_processing
        
        await pipeline.stop()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
