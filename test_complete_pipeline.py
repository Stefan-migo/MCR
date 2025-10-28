#!/usr/bin/env python3
"""
Test Complete Pipeline: Mobile Camera → Backend → NDI Bridge → OBS Studio
"""

import requests
import time
import json
import sys

def test_backend():
    """Test if backend is running and accessible"""
    try:
        response = requests.get("https://192.168.100.19:3001/api/streams", verify=False)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend is running - Active streams: {len(data.get('streams', []))}")
            return True
        else:
            print(f"❌ Backend returned status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend connection failed: {e}")
        return False

def test_ndi_bridge():
    """Test if NDI bridge is running"""
    try:
        response = requests.get("http://192.168.100.19:8000/health", verify=False)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ NDI Bridge is running - Status: {data.get('status', 'unknown')}")
            return True
        else:
            print(f"❌ NDI Bridge returned status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ NDI Bridge connection failed: {e}")
        return False

def test_frontend():
    """Test if frontend is running"""
    try:
        response = requests.get("http://192.168.100.19:3000", verify=False)
        if response.status_code == 200:
            print("✅ Frontend is running")
            return True
        else:
            print(f"❌ Frontend returned status code: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Frontend connection failed: {e}")
        return False

def main():
    print("🚀 Testing Complete Pipeline...")
    print("=" * 50)
    
    # Test all components
    backend_ok = test_backend()
    ndi_bridge_ok = test_ndi_bridge()
    frontend_ok = test_frontend()
    
    print("=" * 50)
    
    if backend_ok and ndi_bridge_ok and frontend_ok:
        print("🎉 All components are running!")
        print("\n📋 Next Steps:")
        print("1. Open your mobile device and go to: http://192.168.100.19:3000")
        print("2. Start streaming from your mobile camera")
        print("3. Open OBS Studio and add NDI Source")
        print("4. Look for sources named 'FEDORA (create_real_mobile_ndi)' or similar")
        print("5. Add the source to your scene")
        return True
    else:
        print("❌ Some components are not running properly")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
