#!/usr/bin/env python3
"""
Create a test NDI source using the NDI SDK directly

This script creates a simple NDI source that OBS Studio should be able to see.
"""

import sys
import os
import time
import logging
import numpy as np
from typing import Optional

# Add the project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def create_test_ndi_source():
    """
    Create a test NDI source using the NDI SDK
    """
    try:
        # Try to import NDI library
        try:
            import NDIlib as ndi
            logger.info("✅ NDI library imported successfully")
        except ImportError:
            logger.error("❌ NDI library not available. Please install ndi-python")
            return False
        
        # Initialize NDI
        if not ndi.initialize():
            logger.error("❌ Failed to initialize NDI library")
            return False
        
        logger.info("✅ NDI library initialized")
        
        # Create NDI sender
        sender_name = "MobileCam_TestSource"
        ndi_send = ndi.send_create()
        if not ndi_send:
            logger.error("❌ Failed to create NDI sender")
            ndi.destroy()
            return False
        
        logger.info(f"✅ NDI sender created: {sender_name}")
        
        # Create video frame
        width, height = 1280, 720
        video_frame = ndi.VideoFrameV2()
        video_frame.xres = width
        video_frame.yres = height
        video_frame.FourCC = ndi.FOURCC_VIDEO_TYPE_BGRA
        video_frame.line_stride_in_bytes = width * 4
        
        # Create a simple test pattern
        test_pattern = np.zeros((height, width, 4), dtype=np.uint8)
        
        # Create a moving color pattern
        frame_count = 0
        logger.info("🎬 Starting NDI source transmission...")
        logger.info("📺 Open OBS Studio and look for NDI sources named 'MobileCam_TestSource'")
        
        try:
            while True:
                # Update test pattern
                frame_count += 1
                
                # Create a moving color pattern
                for y in range(height):
                    for x in range(width):
                        # Create a moving rainbow pattern
                        r = int(128 + 127 * np.sin((x + frame_count) * 0.01))
                        g = int(128 + 127 * np.sin((y + frame_count) * 0.01))
                        b = int(128 + 127 * np.sin((x + y + frame_count) * 0.005))
                        
                        test_pattern[y, x] = [b, g, r, 255]  # BGRA format
                
                # Set video frame data
                video_frame.p_data = test_pattern.ctypes.data_as(ctypes.POINTER(ctypes.c_uint8))
                
                # Send frame
                ndi.send_send_video_v2(ndi_send, video_frame)
                
                # Log every 30 frames (1 second at 30fps)
                if frame_count % 30 == 0:
                    logger.info(f"📡 Sent frame {frame_count} to NDI source '{sender_name}'")
                
                # Wait for next frame (30fps)
                time.sleep(1.0 / 30.0)
                
        except KeyboardInterrupt:
            logger.info("🛑 Stopping NDI source...")
        
        # Cleanup
        ndi.send_destroy(ndi_send)
        ndi.destroy()
        
        logger.info("✅ NDI source stopped and cleaned up")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to create NDI source: {e}")
        return False

def main():
    """
    Main function
    """
    logger.info("🚀 Creating test NDI source...")
    
    # Check if NDI SDK is available
    ndi_lib_path = "/usr/local/lib/libndi.so"
    if not os.path.exists(ndi_lib_path):
        logger.error(f"❌ NDI library not found at {ndi_lib_path}")
        logger.error("Please install NDI SDK first")
        return False
    
    logger.info("✅ NDI SDK found")
    
    # Create test NDI source
    success = create_test_ndi_source()
    
    if success:
        logger.info("🎉 Test NDI source created successfully!")
        logger.info("📋 Next steps:")
        logger.info("1. Open OBS Studio")
        logger.info("2. Add Source → NDI Source")
        logger.info("3. Look for 'MobileCam_TestSource' in the list")
        logger.info("4. Add it to your scene")
    else:
        logger.error("❌ Failed to create test NDI source")
    
    return success

if __name__ == "__main__":
    import ctypes
    success = main()
    sys.exit(0 if success else 1)
