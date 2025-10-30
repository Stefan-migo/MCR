#!/usr/bin/env python3
"""
Test alternative methods for OBS Studio integration
"""

import requests
import json
import subprocess
import time

def test_obs_alternatives():
    """Test alternative methods for OBS Studio integration"""
    
    print("🎬 Testing OBS Studio Integration Alternatives")
    print("=" * 50)
    
    # Check current system status
    print("\n📊 Current System Status:")
    
    # Check backend streams
    try:
        response = requests.get('https://192.168.100.19:3001/api/streams', verify=False, timeout=5)
        if response.status_code == 200:
            streams_data = response.json()
            streams = streams_data.get('streams', [])
            print(f"✅ Backend: {len(streams)} active streams")
            
            if streams:
                for stream in streams:
                    print(f"   - {stream['deviceName']}: {stream['resolution']['width']}x{stream['resolution']['height']} @ {stream['fps']}fps")
        else:
            print(f"❌ Backend: {response.status_code}")
    except Exception as e:
        print(f"❌ Backend: {e}")
    
    # Check NDI Bridge
    try:
        response = requests.get('http://localhost:8000/streams', timeout=5)
        if response.status_code == 200:
            ndi_data = response.json()
            print(f"⚠️  NDI Bridge: {ndi_data['count']} streams (expected: 0)")
        else:
            print(f"❌ NDI Bridge: {response.status_code}")
    except Exception as e:
        print(f"❌ NDI Bridge: {e}")
    
    print("\n🎯 OBS Studio Testing Methods:")
    print("=" * 30)
    
    print("\n1. 📱 Mobile Camera Browser Test:")
    print("   - Open: https://192.168.100.19:3000")
    print("   - Tap 'Mobile Stream'")
    print("   - Allow camera permissions")
    print("   - Tap 'Connect' then 'Start Stream'")
    print("   - Verify camera feed appears in browser")
    
    print("\n2. 🖥️  OBS Studio Display Capture:")
    print("   - Open OBS Studio")
    print("   - Click '+' in Sources")
    print("   - Select 'Display Capture'")
    print("   - Choose your screen")
    print("   - Position to show mobile camera browser window")
    print("   - This captures the mobile camera feed")
    
    print("\n3. 🪟 OBS Studio Window Capture:")
    print("   - In OBS Studio, click '+' in Sources")
    print("   - Select 'Window Capture'")
    print("   - Choose the mobile camera browser window")
    print("   - This directly captures the browser window")
    
    print("\n4. 📹 OBS Studio Virtual Camera:")
    print("   - Set up Display Capture or Window Capture")
    print("   - Go to Tools → Start Virtual Camera")
    print("   - Use 'OBS Virtual Camera' as source in other apps")
    
    print("\n5. 🔌 NDI Plugin Test:")
    print("   - Install NDI Plugin: https://github.com/Palakis/obs-ndi")
    print("   - Restart OBS Studio")
    print("   - Add NDI Source")
    print("   - Look for any NDI sources (even from other apps)")
    
    print("\n6. 🌐 Direct RTP Test:")
    print("   - Get RTP transport info:")
    try:
        response = requests.get('https://192.168.100.19:3001/api/plain-transports', verify=False, timeout=5)
        if response.status_code == 200:
            transports = response.json().get('transports', [])
            if transports:
                transport = transports[0]
                print(f"   - RTP URL: rtp://{transport['ip']}:{transport['port']}")
                print("   - Use FFmpeg: ffmpeg -i rtp://192.168.100.19:10009 -f libndi_newtek 'MobileCam_Direct'")
            else:
                print("   - No RTP transports available")
        else:
            print(f"   - Failed to get transports: {response.status_code}")
    except Exception as e:
        print(f"   - Error: {e}")
    
    print("\n✅ Recommended Testing Order:")
    print("1. Test mobile camera in browser (verify it works)")
    print("2. Test OBS Studio Display Capture (capture browser window)")
    print("3. Test OBS Studio Window Capture (direct window capture)")
    print("4. Test NDI Plugin (if available)")
    print("5. Test Virtual Camera (for other apps)")
    
    print("\n🎬 Expected Results:")
    print("- Mobile camera should work in browser")
    print("- OBS Studio should be able to capture the browser window")
    print("- This proves the mobile camera system is working")
    print("- NDI sources are a bonus (if NDI Bridge works)")
    
    print("\n🔧 If NDI Sources Don't Appear:")
    print("- The NDI Bridge has connection issues")
    print("- Use Display Capture as workaround")
    print("- Mobile camera system is still functional")
    print("- Professional video production is still possible")

if __name__ == "__main__":
    test_obs_alternatives()
