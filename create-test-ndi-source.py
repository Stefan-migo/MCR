#!/usr/bin/env python3
"""
Create a test NDI source to verify NDI functionality
"""

import time
import numpy as np
import cv2
from ndi import NDI

def create_test_ndi_source():
    """Create a test NDI source with a moving pattern"""
    
    print("🎬 Creating test NDI source...")
    
    try:
        # Initialize NDI
        ndi = NDI()
        
        # Create NDI sender
        sender = ndi.send_create("MobileCam_TestPattern")
        
        if sender:
            print("✅ NDI sender created: MobileCam_TestPattern")
            
            # Create test pattern
            width, height = 1280, 720
            frame_count = 0
            
            print("📺 Broadcasting test pattern...")
            print("   Check OBS Studio for 'MobileCam_TestPattern' source")
            print("   Press Ctrl+C to stop")
            
            try:
                while True:
                    # Create test pattern frame
                    img = np.zeros((height, width, 3), dtype=np.uint8)
                    
                    # Moving circle
                    center_x = width // 2
                    center_y = height // 2
                    circle_x = int(center_x + 200 * np.sin(frame_count * 0.1))
                    circle_y = int(center_y + 100 * np.cos(frame_count * 0.1))
                    cv2.circle(img, (circle_x, circle_y), 50, (0, 255, 0), -1)
                    
                    # Text
                    text = f"Test Pattern - Frame {frame_count}"
                    cv2.putText(img, text, (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                    
                    # Timestamp
                    timestamp = time.strftime("%H:%M:%S")
                    cv2.putText(img, timestamp, (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                    
                    # Send frame
                    ndi.send_video_async(sender, img)
                    
                    frame_count += 1
                    time.sleep(1/30)  # 30 FPS
                    
            except KeyboardInterrupt:
                print("\n🛑 Stopping test pattern...")
                
            finally:
                # Cleanup
                ndi.send_destroy(sender)
                print("✅ Test NDI source stopped")
                
        else:
            print("❌ Failed to create NDI sender")
            
    except Exception as e:
        print(f"❌ Error creating NDI source: {e}")
        print("   Make sure NDI SDK is properly installed")

if __name__ == "__main__":
    create_test_ndi_source()
