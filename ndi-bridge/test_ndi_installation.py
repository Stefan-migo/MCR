#!/usr/bin/env python3
"""
Test script to verify NDI SDK installation
"""

import sys
import os

def test_ndi_installation():
    """Test if NDI SDK is properly installed"""
    print("🔍 Testing NDI SDK Installation...")
    
    # Test 1: Check if NDI library files exist
    print("\n1. Checking NDI library files...")
    ndi_lib_paths = [
        "/usr/local/lib/libndi.so",
        "/usr/local/lib/libndi.so.5",
        "/usr/local/lib/libndi.so.5.6.1",
        "/usr/local/ndi-sdk/lib/x86_64-linux-gnu/libndi.so.5.6.1"
    ]
    
    found_libs = []
    for path in ndi_lib_paths:
        if os.path.exists(path):
            found_libs.append(path)
            print(f"   ✅ Found: {path}")
        else:
            print(f"   ❌ Missing: {path}")
    
    if not found_libs:
        print("   ❌ No NDI library files found!")
        return False
    
    # Test 2: Check environment variables
    print("\n2. Checking environment variables...")
    env_vars = ['NDI_SDK_PATH', 'NDI_LIBRARY_PATH', 'LD_LIBRARY_PATH']
    for var in env_vars:
        value = os.environ.get(var, 'Not set')
        print(f"   {var}: {value}")
    
    # Test 3: Try to import NDI Python module
    print("\n3. Testing Python NDI module import...")
    try:
        import NDIlib as ndi
        print("   ✅ NDIlib imported successfully!")
        
        # Test 4: Try to initialize NDI
        print("\n4. Testing NDI initialization...")
        if ndi.initialize():
            print("   ✅ NDI initialized successfully!")
            
            # Test 5: Try to find NDI sources
            print("\n5. Testing NDI source discovery...")
            find = ndi.find_create_v2()
            if find:
                sources = ndi.find_get_current_sources(find)
                print(f"   ✅ Found {len(sources)} NDI sources")
                for i, source in enumerate(sources):
                    print(f"      Source {i+1}: {source.ndi_name}")
                ndi.find_destroy(find)
            else:
                print("   ⚠️  NDI finder creation failed")
            
            # Cleanup
            ndi.destroy()
            print("   ✅ NDI destroyed successfully!")
            return True
        else:
            print("   ❌ NDI initialization failed!")
            return False
            
    except ImportError as e:
        print(f"   ❌ Failed to import NDIlib: {e}")
        return False
    except Exception as e:
        print(f"   ❌ NDI test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_ndi_installation()
    if success:
        print("\n🎉 NDI SDK installation is working correctly!")
        sys.exit(0)
    else:
        print("\n❌ NDI SDK installation has issues. Please check the installation steps.")
        sys.exit(1)
