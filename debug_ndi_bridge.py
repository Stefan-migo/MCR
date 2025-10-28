#!/usr/bin/env python3
"""
Debug NDI Bridge Connection
"""

import asyncio
import aiohttp
import socketio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_ndi_bridge_connection():
    """Test NDI bridge connection to backend"""
    
    # Test HTTP connection to NDI bridge
    try:
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
            async with session.get("http://192.168.100.19:8000/health") as response:
                if response.status == 200:
                    data = await response.json()
                    logger.info(f"✅ NDI Bridge HTTP: {data}")
                else:
                    logger.error(f"❌ NDI Bridge HTTP: {response.status}")
    except Exception as e:
        logger.error(f"❌ NDI Bridge HTTP error: {e}")
    
    # Test WebSocket connection to backend
    try:
        sio = socketio.AsyncClient(ssl_verify=False)
        
        @sio.event
        async def connect():
            logger.info("✅ Connected to backend WebSocket")
            
            # Request streams
            try:
                response = await sio.call('ndi-bridge-request-streams', {})
                logger.info(f"✅ Backend streams response: {response}")
            except Exception as e:
                logger.error(f"❌ Error requesting streams: {e}")
        
        @sio.event
        async def disconnect():
            logger.info("Disconnected from backend WebSocket")
        
        @sio.event
        async def connect_error(data):
            logger.error(f"❌ Backend WebSocket connection error: {data}")
        
        # Connect to backend
        await sio.connect('wss://192.168.100.19:3001')
        
        # Wait a bit
        await asyncio.sleep(2)
        
        # Disconnect
        await sio.disconnect()
        
    except Exception as e:
        logger.error(f"❌ Backend WebSocket error: {e}")

if __name__ == "__main__":
    asyncio.run(test_ndi_bridge_connection())
