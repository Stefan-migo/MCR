#!/usr/bin/env python3
"""
Test NDI installation on Windows
This script tests if NDI-Python works correctly
"""

import sys
import os

def test_ndi_import():
    """Test basic NDI import"""
    try:
        import ndi
        print("✅ NDI import successful")
        return True
    except ImportError as e:
        print(f"❌ NDI import failed: {e}")
        return False

def test_ndi_initialize():
    """Test NDI initialization"""
    try:
        import ndi
        result = ndi.initialize()
        if result:
            print("✅ NDI initialization successful")
            return True
        else:
            print("❌ NDI initialization failed")
            return False
    except Exception as e:
        print(f"❌ NDI initialization error: {e}")
        return False

def test_ndi_sender():
    """Test creating NDI sender"""
    try:
        import ndi
        import numpy as np
        
        # Initialize NDI
        if not ndi.initialize():
            print("❌ NDI not initialized")
            return False
        
        # Create test frame
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        
        # Try to create sender
        sender = ndi.send_send_video_v2("Test_Sender", frame)
        if sender:
            print("✅ NDI sender creation successful")
            ndi.send_send_video_v2(sender, frame)  # Send test frame
            print("✅ NDI frame sending successful")
            return True
        else:
            print("❌ NDI sender creation failed")
            return False
            
    except Exception as e:
        print(f"❌ NDI sender test error: {e}")
        return False

def main():
    """Run all NDI tests"""
    print("🧪 Testing NDI Installation on Windows")
    print("=" * 50)
    
    # Test 1: Import
    print("\n1. Testing NDI import...")
    import_success = test_ndi_import()
    
    if not import_success:
        print("\n❌ NDI import failed. Please check NDI SDK installation.")
        return False
    
    # Test 2: Initialize
    print("\n2. Testing NDI initialization...")
    init_success = test_ndi_initialize()
    
    if not init_success:
        print("\n❌ NDI initialization failed. Please check NDI SDK path.")
        return False
    
    # Test 3: Sender
    print("\n3. Testing NDI sender creation...")
    sender_success = test_ndi_sender()
    
    if not sender_success:
        print("\n❌ NDI sender test failed. This is the 'capsule object' error.")
        return False
    
    print("\n" + "=" * 50)
    print("🎉 All NDI tests passed! NDI-Python is working correctly.")
    print("✅ You can proceed with native NDI implementation.")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)