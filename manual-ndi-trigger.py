#!/usr/bin/env python3
"""
Manually trigger NDI Bridge to consume streams
"""

import requests
import json
import time

def trigger_ndi_bridge():
    """Manually trigger NDI Bridge stream consumption"""
    
    print("🎬 Manually triggering NDI Bridge...")
    
    # Get active streams from backend
    try:
        response = requests.get('https://192.168.100.19:3001/api/streams', verify=False, timeout=5)
        if response.status_code == 200:
            streams_data = response.json()
            streams = streams_data.get('streams', [])
            
            if streams:
                print(f"Found {len(streams)} active streams")
                
                for i, stream in enumerate(streams):
                    print(f"\n{i+1}. {stream['deviceName']} ({stream['id']})")
                    print(f"   Producer ID: {stream['producerId']}")
                    print(f"   Resolution: {stream['resolution']['width']}x{stream['resolution']['height']}")
                    print(f"   FPS: {stream['fps']}")
                    print(f"   Bitrate: {stream['stats']['bitrate']} bps")
                
                print("\n🎯 The NDI Bridge should automatically detect these streams")
                print("   Check OBS Studio for NDI sources named 'MobileCam_*'")
                
                # Check NDI Bridge status
                ndi_response = requests.get('http://localhost:8000/streams', timeout=5)
                if ndi_response.status_code == 200:
                    ndi_data = ndi_response.json()
                    if ndi_data['count'] > 0:
                        print(f"✅ NDI Bridge has {ndi_data['count']} active streams!")
                        for stream_id, details in ndi_data['details'].items():
                            print(f"   - {stream_id}: {details}")
                    else:
                        print("⚠️  NDI Bridge has no active streams")
                        print("   This may indicate a connection issue between NDI Bridge and Backend")
                        
            else:
                print("❌ No active streams found")
                print("   Start a mobile camera stream first")
        else:
            print(f"❌ Failed to get streams: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    trigger_ndi_bridge()
