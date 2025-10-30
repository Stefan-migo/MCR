#!/usr/bin/env python3
"""
Simple test to check NDI Bridge connection and manually trigger stream consumption
"""

import requests
import json
import ssl
import urllib3

# Disable SSL warnings for self-signed certificates
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def test_ndi_bridge():
    """Test NDI Bridge manually"""
    
    print("🔍 Testing NDI Bridge connection...")
    
    # Check NDI Bridge health
    try:
        response = requests.get('http://localhost:8000/health', timeout=5)
        if response.status_code == 200:
            health = response.json()
            print(f"✅ NDI Bridge is running: {health['status']}")
            print(f"   Active streams: {health['active_streams']}")
            print(f"   NDI SDK available: {health['ndi_sdk_available']}")
        else:
            print(f"❌ NDI Bridge health check failed: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Cannot connect to NDI Bridge: {e}")
        return
    
    # Check backend streams
    try:
        response = requests.get('https://192.168.100.19:3001/api/streams', verify=False, timeout=5)
        if response.status_code == 200:
            streams_data = response.json()
            streams = streams_data.get('streams', [])
            print(f"✅ Backend has {len(streams)} active streams")
            
            if streams:
                stream = streams[0]
                print(f"   Testing with: {stream['deviceName']} ({stream['id']})")
                
                # Get RTP capabilities
                rtp_response = requests.get('https://192.168.100.19:3001/api/rtp-capabilities', verify=False, timeout=5)
                if rtp_response.status_code == 200:
                    rtp_data = rtp_response.json()
                    print("✅ RTP capabilities received")
                    
                    # Try to manually trigger NDI Bridge consumption via API
                    print("🎬 Attempting to manually trigger NDI Bridge...")
                    
                    # This would require the NDI Bridge to have an API endpoint for manual consumption
                    # For now, let's just check if it's working
                    print("📋 Current NDI Bridge streams:")
                    streams_response = requests.get('http://localhost:8000/streams', timeout=5)
                    if streams_response.status_code == 200:
                        ndi_streams = streams_response.json()
                        print(f"   NDI Bridge streams: {ndi_streams}")
                    
                    print("\n🎯 Next steps:")
                    print("1. The NDI Bridge should automatically detect streams from the backend")
                    print("2. Check OBS Studio for NDI sources named 'MobileCam_*'")
                    print("3. If no NDI sources appear, the NDI Bridge may need to be restarted")
                    
                else:
                    print(f"❌ Failed to get RTP capabilities: {rtp_response.status_code}")
            else:
                print("❌ No active streams found on backend")
        else:
            print(f"❌ Backend streams check failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Cannot connect to backend: {e}")

if __name__ == "__main__":
    test_ndi_bridge()
