"""
Mobile Camera Receptor - NDI Bridge
Main entry point for the NDI bridge service
"""

import asyncio
import logging
import signal
import sys
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os
from datetime import datetime

# Import our modules
from config.settings import get_settings, Settings
from services.stream_manager import StreamManager

# Load environment variables
load_dotenv()

# Get settings
settings = get_settings()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format=settings.log_format
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="Mobile Camera Receptor - NDI Bridge",
    description="WebRTC to NDI converter service",
    version="1.0.0"
)

@app.on_event("startup")
async def startup_event():
    """Initialize the NDI bridge on startup"""
    await start_ndi_bridge()

@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown the NDI bridge on shutdown"""
    await stop_ndi_bridge()

# Global stream manager
stream_manager: Optional[StreamManager] = None
shutdown_event = asyncio.Event()


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        if stream_manager:
            stats = stream_manager.get_all_stats()
            return {
                "status": "ok",
                "service": "NDI Bridge",
                "version": "1.0.0",
                "uptime": (datetime.now() - stats["manager_stats"]["start_time"]).total_seconds(),
                "active_streams": stats["total_active_streams"],
                "ndi_sdk_available": settings._check_ndi_sdk_availability(),
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "initializing",
                "service": "NDI Bridge",
                "version": "1.0.0",
                "timestamp": datetime.now().isoformat()
            }
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )


@app.get("/streams")
async def list_streams():
    """List all active streams"""
    try:
        if not stream_manager:
            raise HTTPException(status_code=503, detail="Stream manager not initialized")
        
        stats = stream_manager.get_all_stats()
        return {
            "streams": list(stats["stream_stats"].keys()),
            "count": stats["total_active_streams"],
            "details": stats["stream_stats"]
        }
    except Exception as e:
        logger.error(f"Error listing streams: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/streams/{stream_id}")
async def get_stream_details(stream_id: str):
    """Get details for a specific stream"""
    try:
        if not stream_manager:
            raise HTTPException(status_code=503, detail="Stream manager not initialized")
        
        stats = await stream_manager.get_stream_stats(stream_id)
        if not stats:
            raise HTTPException(status_code=404, detail="Stream not found")
        
        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting stream details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/streams/{stream_id}/stop")
async def stop_stream(stream_id: str):
    """Stop a specific stream"""
    try:
        if not stream_manager:
            raise HTTPException(status_code=503, detail="Stream manager not initialized")
        
        success = await stream_manager.stop_stream(stream_id)
        if not success:
            raise HTTPException(status_code=404, detail="Stream not found")
        
        return {"message": f"Stream {stream_id} stopped successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stats")
async def get_stats():
    """Get detailed statistics"""
    try:
        if not stream_manager:
            raise HTTPException(status_code=503, detail="Stream manager not initialized")
        
        return stream_manager.get_all_stats()
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/config")
async def get_config():
    """Get current configuration"""
    try:
        return {
            "backend_url": settings.backend_url,
            "backend_ws_url": settings.get_backend_ws_url(),
            "ndi_source_prefix": settings.ndi_source_prefix,
            "max_streams": settings.max_streams,
            "frame_buffer_size": settings.frame_buffer_size,
            "auto_consume": settings.auto_consume,
            "default_resolution": f"{settings.default_width}x{settings.default_height}",
            "default_fps": settings.default_fps,
            "processing_quality": settings.processing_quality,
            "log_level": settings.log_level
        }
    except Exception as e:
        logger.error(f"Error getting config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def start_ndi_bridge():
    """Initialize and start the NDI bridge service"""
    global stream_manager
    
    try:
        logger.info("🚀 Starting NDI Bridge service...")
        logger.info(f"📡 Backend URL: {settings.backend_url}")
        logger.info(f"🔌 WebSocket URL: {settings.get_backend_ws_url()}")
        logger.info(f"🎬 NDI Source Prefix: {settings.ndi_source_prefix}")
        logger.info(f"📊 Max Streams: {settings.max_streams}")
        logger.info(f"🎯 Processing Quality: {settings.processing_quality}")
        
        # Validate configuration
        config_errors = settings.validate_configuration()
        if config_errors:
            logger.error("Configuration validation failed:")
            for error in config_errors:
                logger.error(f"  - {error}")
            return False
        
        # Check NDI SDK availability
        if not settings._check_ndi_sdk_availability():
            logger.warning("NDI SDK not available - NDI output will not work")
            logger.warning("Please install NDI SDK and ndi-python package")
        else:
            logger.info("✅ NDI SDK available")
        
        # Initialize stream manager
        stream_manager = StreamManager(
            backend_url=settings.get_backend_ws_url(),
            ndi_source_prefix=settings.ndi_source_prefix
        )
        
        # Set up callbacks
        stream_manager.on_stream_started = _on_stream_started
        stream_manager.on_stream_stopped = _on_stream_stopped
        stream_manager.on_error = _on_stream_error
        
        # Initialize stream manager
        if not await stream_manager.initialize():
            logger.error("Failed to initialize stream manager")
            return False
        
        logger.info("✅ NDI Bridge service ready")
        logger.info("🎥 Waiting for mobile camera streams...")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to start NDI Bridge: {e}")
        return False


async def stop_ndi_bridge():
    """Stop the NDI bridge service"""
    global stream_manager
    
    try:
        logger.info("🛑 Stopping NDI Bridge service...")
        
        if stream_manager:
            await stream_manager.shutdown()
            stream_manager = None
        
        logger.info("✅ NDI Bridge service stopped")
        
    except Exception as e:
        logger.error(f"Error stopping NDI Bridge: {e}")


def _on_stream_started(stream_id: str, stream_info: dict):
    """Handle stream started event"""
    device_name = stream_info.get("device_name", "Unknown")
    resolution = stream_info.get("resolution", {})
    width = resolution.get("width", "unknown")
    height = resolution.get("height", "unknown")
    
    logger.info(f"🎥 Stream started: {stream_id} ({device_name}) - {width}x{height}")


def _on_stream_stopped(stream_id: str):
    """Handle stream stopped event"""
    logger.info(f"🛑 Stream stopped: {stream_id}")


def _on_stream_error(stream_id: str, error: Exception):
    """Handle stream error event"""
    logger.error(f"❌ Stream error {stream_id}: {error}")


async def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    await stop_ndi_bridge()
    shutdown_event.set()


async def main():
    """Main application entry point"""
    try:
        # Set up signal handlers
        signal.signal(signal.SIGINT, lambda s, f: asyncio.create_task(signal_handler(s, f)))
        signal.signal(signal.SIGTERM, lambda s, f: asyncio.create_task(signal_handler(s, f)))
        
        # Start the NDI bridge
        if not await start_ndi_bridge():
            logger.error("Failed to start NDI Bridge")
            sys.exit(1)
        
        # Wait for shutdown signal
        await shutdown_event.wait()
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    import uvicorn
    
    # Get configuration from environment
    host = settings.ndi_bridge_host
    port = settings.ndi_bridge_port
    
    # Run FastAPI server with startup event
    logger.info(f"🌐 Starting API server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)

