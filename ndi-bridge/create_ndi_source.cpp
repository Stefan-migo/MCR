#include <iostream>
#include <cstring>
#include <thread>
#include <chrono>
#include <cmath>

// Include NDI SDK headers
#include "Processing.NDI.Lib.h"

int main() {
    std::cout << "🚀 Creating test NDI source..." << std::endl;
    
    // Initialize NDI
    if (!NDIlib_initialize()) {
        std::cerr << "❌ Failed to initialize NDI library" << std::endl;
        return 1;
    }
    
    std::cout << "✅ NDI library initialized" << std::endl;
    
    // Create NDI sender
    NDIlib_send_instance_t pNDI_send = NDIlib_send_create();
    if (!pNDI_send) {
        std::cerr << "❌ Failed to create NDI sender" << std::endl;
        NDIlib_destroy();
        return 1;
    }
    
    std::cout << "✅ NDI sender created: MobileCam_TestSource" << std::endl;
    
    // Video frame parameters
    const int width = 1280;
    const int height = 720;
    const int frame_rate = 30;
    
    // Create video frame
    NDIlib_video_frame_v2_t video_frame;
    video_frame.xres = width;
    video_frame.yres = height;
    video_frame.FourCC = NDIlib_FourCC_video_type_BGRA;
    video_frame.line_stride_in_bytes = width * 4;
    
    // Allocate frame buffer
    uint8_t* frame_data = new uint8_t[width * height * 4];
    video_frame.p_data = frame_data;
    
    std::cout << "🎬 Starting NDI source transmission..." << std::endl;
    std::cout << "📺 Open OBS Studio and look for NDI sources named 'MobileCam_TestSource'" << std::endl;
    std::cout << "Press Ctrl+C to stop" << std::endl;
    
    int frame_count = 0;
    
    try {
        while (true) {
            // Create a moving test pattern
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int pixel_index = (y * width + x) * 4;
                    
                    // Create a moving rainbow pattern
                    uint8_t r = (uint8_t)(128 + 127 * sin((x + frame_count) * 0.01));
                    uint8_t g = (uint8_t)(128 + 127 * sin((y + frame_count) * 0.01));
                    uint8_t b = (uint8_t)(128 + 127 * sin((x + y + frame_count) * 0.005));
                    
                    // BGRA format
                    frame_data[pixel_index + 0] = b;     // Blue
                    frame_data[pixel_index + 1] = g;     // Green
                    frame_data[pixel_index + 2] = r;     // Red
                    frame_data[pixel_index + 3] = 255;   // Alpha
                }
            }
            
            // Send frame
            NDIlib_send_send_video_v2(pNDI_send, &video_frame);
            
            // Log every 30 frames (1 second at 30fps)
            if (frame_count % 30 == 0) {
                std::cout << "📡 Sent frame " << frame_count << " to NDI source" << std::endl;
            }
            
            frame_count++;
            
            // Wait for next frame (30fps)
            std::this_thread::sleep_for(std::chrono::milliseconds(1000 / frame_rate));
        }
    } catch (...) {
        std::cout << "🛑 Stopping NDI source..." << std::endl;
    }
    
    // Cleanup
    delete[] frame_data;
    NDIlib_send_destroy(pNDI_send);
    NDIlib_destroy();
    
    std::cout << "✅ NDI source stopped and cleaned up" << std::endl;
    return 0;
}
