#!/usr/bin/env python3
"""
Manual NDI source creation test
"""

import time
import numpy as np
import cv2

def create_manual_ndi_source():
    """Create a manual NDI source to test NDI functionality"""
    
    print("🎬 Creating manual NDI source...")
    
    try:
        # Try to import NDI
        try:
            from ndi import NDI
            print("✅ NDI Python module found")
        except ImportError:
            print("❌ NDI Python module not found")
            print("   This is expected - NDI SDK needs to be installed")
            print("   Let's try alternative approach...")
            return create_fallback_ndi_source()
        
        # Initialize NDI
        ndi = NDI()
        
        # Create NDI sender
        sender = ndi.send_create("MobileCam_ManualTest")
        
        if sender:
            print("✅ NDI sender created: MobileCam_ManualTest")
            print("   Check OBS Studio for this source!")
            
            # Create test pattern
            width, height = 1280, 720
            frame_count = 0
            
            print("📺 Broadcasting test pattern...")
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
                    text = f"Manual NDI Test - Frame {frame_count}"
                    cv2.putText(img, text, (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                    
                    # Timestamp
                    timestamp = time.strftime("%H:%M:%S")
                    cv2.putText(img, timestamp, (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                    
                    # Status
                    status = "NDI WORKING!"
                    cv2.putText(img, status, (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                    
                    # Send frame
                    ndi.send_video_async(sender, img)
                    
                    frame_count += 1
                    time.sleep(1/30)  # 30 FPS
                    
            except KeyboardInterrupt:
                print("\n🛑 Stopping manual NDI source...")
                
            finally:
                # Cleanup
                ndi.send_destroy(sender)
                print("✅ Manual NDI source stopped")
                
        else:
            print("❌ Failed to create NDI sender")
            
    except Exception as e:
        print(f"❌ Error creating manual NDI source: {e}")
        print("   This indicates NDI SDK installation issues")

def create_fallback_ndi_source():
    """Create a fallback test using FFmpeg"""
    
    print("🔄 Trying FFmpeg fallback approach...")
    
    try:
        import subprocess
        import os
        
        # Create a simple test pattern using FFmpeg
        print("📺 Creating test pattern with FFmpeg...")
        
        # FFmpeg command to create a test pattern and send to NDI
        cmd = [
            'ffmpeg',
            '-f', 'lavfi',
            '-i', 'testsrc2=size=1280x720:rate=30',
            '-f', 'lavfi',
            '-i', 'sine=frequency=1000:duration=0',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-f', 'libndi_newtek',
            '-pix_fmt', 'yuv420p',
            'MobileCam_FFmpegTest'
        ]
        
        print("Running FFmpeg command...")
        print(" ".join(cmd))
        
        # Run FFmpeg
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        print("✅ FFmpeg NDI source started: MobileCam_FFmpegTest")
        print("   Check OBS Studio for this source!")
        print("   Press Ctrl+C to stop")
        
        try:
            process.wait()
        except KeyboardInterrupt:
            print("\n🛑 Stopping FFmpeg NDI source...")
            process.terminate()
            process.wait()
            print("✅ FFmpeg NDI source stopped")
            
    except FileNotFoundError:
        print("❌ FFmpeg not found")
        print("   Install FFmpeg: sudo dnf install ffmpeg (Fedora) or sudo apt install ffmpeg (Ubuntu)")
    except Exception as e:
        print(f"❌ Error with FFmpeg fallback: {e}")

if __name__ == "__main__":
    create_manual_ndi_source()
