#!/usr/bin/env python3
"""
NDI Bridge Launcher Script
This script sets up the Python path and launches the NDI bridge
"""

import sys
import os

# Add src directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# Add NDI SDK library path
ndi_sdk_path = os.path.join(os.path.dirname(__file__), '..', 'NDI SDK for Linux', 'lib', 'x86_64-linux-gnu')
sys.path.append(ndi_sdk_path)
os.environ['LD_LIBRARY_PATH'] = ndi_sdk_path

# Import and run the main module
if __name__ == "__main__":
    from src.main import app, settings
    import uvicorn
    
    # Get configuration
    host = settings.ndi_bridge_host
    port = settings.ndi_bridge_port
    
    print(f"🚀 Starting NDI Bridge on http://{host}:{port}")
    print(f"📡 Backend URL: {settings.backend_url}")
    print(f"🎬 NDI Source Prefix: {settings.ndi_source_prefix}")
    
    # Run FastAPI server
    uvicorn.run(app, host=host, port=port)
