#!/usr/bin/env python3
"""
Test script to manually trigger NDI Bridge to consume streams
"""

import asyncio
import aiohttp
import json

async def test_ndi_bridge():
    """Test NDI Bridge stream consumption"""
    
    # Get active streams from backend
    async with aiohttp.ClientSession() as session:
        try:
            # Get streams from backend
            async with session.get('https://192.168.100.19:3001/api/streams', ssl=False) as resp:
                if resp.status == 200:
                    streams_data = await resp.json()
                    streams = streams_data.get('streams', [])
                    print(f"Found {len(streams)} active streams")
                    
                    if streams:
                        # Take the first stream
                        stream = streams[0]
                        stream_id = stream['id']
                        producer_id = stream['producerId']
                        device_name = stream['deviceName']
                        
                        print(f"Testing with stream: {stream_id}")
                        print(f"Producer ID: {producer_id}")
                        print(f"Device: {device_name}")
                        
                        # Get RTP capabilities from backend
                        async with session.get('https://192.168.100.19:3001/api/rtp-capabilities', ssl=False) as resp:
                            if resp.status == 200:
                                rtp_data = await resp.json()
                                rtp_capabilities = rtp_data.get('rtpCapabilities')
                                
                                print("RTP capabilities received")
                                
                                # Request NDI Bridge to consume stream
                                ndi_request = {
                                    "stream_id": stream_id,
                                    "producer_id": producer_id,
                                    "rtp_capabilities": rtp_capabilities
                                }
                                
                                print("Requesting NDI Bridge to consume stream...")
                                
                                # Use WebSocket to communicate with backend
                                import socketio
                                
                                sio = socketio.AsyncClient()
                                
                                @sio.event
                                async def connect():
                                    print("Connected to backend")
                                    
                                    # Request stream consumption
                                    response = await sio.call('ndi-bridge-consume-stream', ndi_request)
                                    
                                    if response.get('success'):
                                        print("✅ NDI Bridge successfully started consuming stream!")
                                        print(f"Consumer ID: {response.get('consumer_id')}")
                                        print(f"Transport: {response.get('transport')}")
                                        print(f"RTP Parameters: {response.get('rtp_parameters')}")
                                        
                                        # Check NDI Bridge status
                                        async with session.get('http://localhost:8000/streams') as resp:
                                            if resp.status == 200:
                                                ndi_data = await resp.json()
                                                print(f"NDI Bridge streams: {ndi_data}")
                                    else:
                                        print(f"❌ Failed to consume stream: {response.get('error')}")
                                    
                                    await sio.disconnect()
                                
                                @sio.event
                                async def disconnect():
                                    print("Disconnected from backend")
                                
                                # Connect to backend
                                await sio.connect('https://192.168.100.19:3001')
                                await sio.wait()
                                
                            else:
                                print("Failed to get RTP capabilities")
                    else:
                        print("No active streams found")
                else:
                    print(f"Failed to get streams: {resp.status}")
                    
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_ndi_bridge())
