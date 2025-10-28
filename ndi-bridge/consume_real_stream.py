#!/usr/bin/env python3
"""
Consume Real Mobile Camera Stream and Send to NDI
This script connects to the backend, consumes the real mobile camera stream,
and sends it to NDI for OBS Studio.
"""

import asyncio
import aiohttp
import json
import subprocess
import os
import sys
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class RealStreamConsumer:
    def __init__(self, backend_url="https://192.168.100.19:3001", ndi_bridge_url="http://192.168.100.19:8000"):
        self.backend_url = backend_url
        self.ndi_bridge_url = ndi_bridge_url
        self.session = None
        self.ndi_process = None
        
    async def start(self):
        """Start consuming real mobile camera stream"""
        try:
            self.session = aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False))
            
            # Get active streams from backend
            streams = await self.get_active_streams()
            if not streams:
                logger.error("No active streams found in backend")
                return False
                
            logger.info(f"Found {len(streams)} active streams")
            
            # Get the first video stream
            video_stream = None
            for stream in streams:
                if stream.get('kind') == 'video':
                    video_stream = stream
                    break
                    
            if not video_stream:
                logger.error("No video streams found")
                return False
                
            logger.info(f"Consuming video stream: {video_stream['id']}")
            
            # Start NDI source
            await self.start_ndi_source(video_stream)
            
            # Consume the stream via NDI bridge
            await self.consume_stream_via_ndi_bridge(video_stream)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to start stream consumption: {e}")
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
    
    async def start_ndi_source(self, stream):
        """Start NDI source for the stream"""
        try:
            # Create NDI source name
            ndi_name = f"FEDORA (Real_Mobile_{stream['id'][-8:]})"
            
            # Start the NDI processor
            cmd = [
                "./real_mobile_processor",
                ndi_name,
                str(stream['resolution']['width']),
                str(stream['resolution']['height']),
                str(stream.get('fps', 30))
            ]
            
            self.ndi_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            logger.info(f"Started NDI source: {ndi_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start NDI source: {e}")
            return False
    
    async def consume_stream_via_ndi_bridge(self, stream):
        """Consume stream via NDI bridge"""
        try:
            # Request NDI bridge to consume the stream
            consume_data = {
                "streamId": stream['id'],
                "producerId": stream['producerId'],
                "clientId": stream['clientId']
            }
            
            async with self.session.post(
                f"{self.ndi_bridge_url}/consume-stream",
                json=consume_data
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    logger.info(f"NDI bridge consuming stream: {result}")
                    return True
                else:
                    logger.error(f"NDI bridge returned status {response.status}")
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to consume stream via NDI bridge: {e}")
            return False
    
    async def stop(self):
        """Stop the consumer"""
        if self.ndi_process:
            self.ndi_process.terminate()
            self.ndi_process.wait()
            
        if self.session:
            await self.session.close()
    
    async def run_forever(self):
        """Run the consumer forever"""
        try:
            if await self.start():
                logger.info("✅ Real mobile camera stream consumer started!")
                logger.info("📺 Check OBS Studio for the NDI source")
                
                # Keep running
                while True:
                    await asyncio.sleep(1)
                    
                    # Check if NDI process is still running
                    if self.ndi_process and self.ndi_process.poll() is not None:
                        logger.error("NDI process stopped unexpectedly")
                        break
                        
        except KeyboardInterrupt:
            logger.info("Stopping consumer...")
        finally:
            await self.stop()

async def main():
    consumer = RealStreamConsumer()
    await consumer.run_forever()

if __name__ == "__main__":
    asyncio.run(main())
