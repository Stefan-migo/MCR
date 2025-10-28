#!/usr/bin/env python3
"""
Create Real Mobile Camera NDI Source
This script creates an NDI source that connects to the real mobile camera stream
"""

import asyncio
import aiohttp
import subprocess
import logging
import time
import signal
import sys

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class RealMobileNDI:
    def __init__(self):
        self.backend_url = "https://192.168.100.19:3001"
        self.session = None
        self.ndi_process = None
        self.running = False
        
    async def start(self):
        """Start the real mobile NDI source"""
        try:
            self.session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
            self.running = True
            
            # Get active streams from backend
            streams = await self.get_active_streams()
            if not streams:
                logger.error("No active streams found in backend")
                return False
                
            # Find video stream
            video_stream = None
            for stream in streams:
                if stream.get('kind') == 'video':
                    video_stream = stream
                    break
                    
            if not video_stream:
                logger.error("No video streams found")
                return False
                
            logger.info(f"Found video stream: {video_stream['id']}")
            
            # Create NDI source name
            ndi_name = f"FEDORA (Real_Mobile_{video_stream['id'][-8:]})"
            
            # Start NDI processor
            cmd = [
                "./real_mobile_processor",
                ndi_name,
                str(video_stream['resolution']['width']),
                str(video_stream['resolution']['height']),
                str(video_stream.get('fps', 30))
            ]
            
            self.ndi_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            logger.info(f"✅ Started NDI source: {ndi_name}")
            logger.info("📺 Open OBS Studio and add NDI Source")
            logger.info(f"🔍 Look for: {ndi_name}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to start real mobile NDI: {e}")
            return False
    
    async def get_active_streams(self):
        """Get active streams from backend"""
        try:
            async with self.session.get(f"{self.backend_url}/api/streams") as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('streams', [])
                else:
                    logger.error(f"Backend returned status {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Failed to get streams from backend: {e}")
            return []
    
    async def run(self):
        """Run the NDI source"""
        try:
            if await self.start():
                logger.info("🎬 Real mobile camera NDI source is running!")
                logger.info("Press Ctrl+C to stop")
                
                # Keep running
                while self.running:
                    await asyncio.sleep(1)
                    
                    # Check if NDI process is still running
                    if self.ndi_process and self.ndi_process.poll() is not None:
                        logger.error("NDI process stopped unexpectedly")
                        break
                        
        except KeyboardInterrupt:
            logger.info("Stopping...")
        finally:
            await self.stop()
    
    async def stop(self):
        """Stop the NDI source"""
        self.running = False
        
        if self.ndi_process:
            self.ndi_process.terminate()
            self.ndi_process.wait()
            logger.info("NDI process stopped")
            
        if self.session:
            await self.session.close()
            logger.info("Session closed")

def signal_handler(signum, frame):
    """Handle Ctrl+C"""
    logger.info("Received interrupt signal")
    sys.exit(0)

async def main():
    # Setup signal handler
    signal.signal(signal.SIGINT, signal_handler)
    
    # Create and run NDI source
    ndi_source = RealMobileNDI()
    await ndi_source.run()

if __name__ == "__main__":
    asyncio.run(main())
