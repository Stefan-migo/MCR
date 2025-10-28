"""
Mobile Camera Receptor - NDI Bridge
Main entry point for the NDI bridge service
"""

import asyncio
import logging
from typing import Dict
from fastapi import FastAPI
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="Mobile Camera Receptor - NDI Bridge",
    description="WebRTC to NDI converter service",
    version="0.1.0"
)

# Store active streams
active_streams: Dict[str, any] = {}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "NDI Bridge",
        "active_streams": len(active_streams),
        "timestamp": asyncio.get_event_loop().time()
    }


@app.get("/streams")
async def list_streams():
    """List all active streams"""
    return {
        "streams": list(active_streams.keys()),
        "count": len(active_streams)
    }


async def start_ndi_bridge():
    """Initialize and start the NDI bridge service"""
    logger.info("🚀 Starting NDI Bridge service...")
    logger.info(f"📡 Backend URL: {os.getenv('BACKEND_URL', 'http://localhost:3001')}")
    logger.info(f"🎬 NDI Source Prefix: {os.getenv('NDI_SOURCE_PREFIX', 'MobileCam')}")
    
    # TODO: Initialize NDI SDK
    # TODO: Connect to backend WebSocket
    # TODO: Start consuming streams
    
    logger.info("✅ NDI Bridge service ready")


if __name__ == "__main__":
    import uvicorn
    
    # Get configuration from environment
    host = os.getenv("NDI_BRIDGE_HOST", "0.0.0.0")
    port = int(os.getenv("NDI_BRIDGE_PORT", "8000"))
    
    # Start the bridge
    asyncio.run(start_ndi_bridge())
    
    # Run FastAPI server
    logger.info(f"🌐 Starting API server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)

