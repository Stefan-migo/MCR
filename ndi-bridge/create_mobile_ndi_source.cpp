#include <iostream>
#include <cstring>
#include <thread>
#include <chrono>
#include <cmath>
#include <vector>
#include <csignal>

// Include NDI SDK headers
#include "Processing.NDI.Lib.h"

class MobileNDISource {
private:
    NDIlib_send_instance_t pNDI_send;
    std::string bridge_url;
    bool running;
    
public:
    MobileNDISource(const std::string& url) : bridge_url(url), running(false) {
        pNDI_send = nullptr;
    }
    
    ~MobileNDISource() {
        stop();
    }
    
    bool initialize() {
        // Initialize NDI
        if (!NDIlib_initialize()) {
            std::cerr << "❌ Failed to initialize NDI library" << std::endl;
            return false;
        }
        
        // Create NDI sender
        pNDI_send = NDIlib_send_create();
        if (!pNDI_send) {
            std::cerr << "❌ Failed to create NDI sender" << std::endl;
            NDIlib_destroy();
            return false;
        }
        
        std::cout << "✅ NDI sender created: MobileCam_Device 1000" << std::endl;
        return true;
    }
    
    void start() {
        running = true;
        
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
        
        std::cout << "🎬 Starting mobile camera NDI source..." << std::endl;
        std::cout << "📺 Open OBS Studio and look for 'MobileCam_Device 1000'" << std::endl;
        std::cout << "Press Ctrl+C to stop" << std::endl;
        
        int frame_count = 0;
        
        try {
            while (running) {
                // Create a test pattern that simulates mobile camera
                for (int y = 0; y < height; y++) {
                    for (int x = 0; x < width; x++) {
                        int pixel_index = (y * width + x) * 4;
                        
                        // Create a mobile-like camera pattern
                        // Simulate a person in the center with a moving background
                        int center_x = width / 2;
                        int center_y = height / 2;
                        int dist_from_center = sqrt((x - center_x) * (x - center_x) + (y - center_y) * (y - center_y));
                        
                        uint8_t r, g, b;
                        
                        if (dist_from_center < 100) {
                            // Person area (skin tone)
                            r = 180 + 20 * sin((x + frame_count) * 0.02);
                            g = 140 + 20 * sin((y + frame_count) * 0.02);
                            b = 120 + 20 * sin((x + y + frame_count) * 0.01);
                        } else if (dist_from_center < 200) {
                            // Transition area
                            float factor = (dist_from_center - 100) / 100.0f;
                            r = (uint8_t)(180 * (1 - factor) + 50 * factor);
                            g = (uint8_t)(140 * (1 - factor) + 100 * factor);
                            b = (uint8_t)(120 * (1 - factor) + 200 * factor);
                        } else {
                            // Background area (simulate room/environment)
                            r = 50 + 30 * sin((x + frame_count) * 0.01);
                            g = 100 + 30 * sin((y + frame_count) * 0.01);
                            b = 200 + 30 * sin((x + y + frame_count) * 0.005);
                        }
                        
                        // Add some movement
                        r += 10 * sin(frame_count * 0.1);
                        g += 10 * cos(frame_count * 0.1);
                        b += 10 * sin(frame_count * 0.05);
                        
                        // Clamp values
                        r = std::min(255, std::max(0, (int)r));
                        g = std::min(255, std::max(0, (int)g));
                        b = std::min(255, std::max(0, (int)b));
                        
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
                    std::cout << "📱 Mobile camera frame " << frame_count << " sent to NDI" << std::endl;
                }
                
                frame_count++;
                
                // Wait for next frame (30fps)
                std::this_thread::sleep_for(std::chrono::milliseconds(1000 / frame_rate));
            }
        } catch (...) {
            std::cout << "🛑 Stopping mobile camera NDI source..." << std::endl;
        }
        
        // Cleanup
        delete[] frame_data;
    }
    
    void stop() {
        running = false;
        if (pNDI_send) {
            NDIlib_send_destroy(pNDI_send);
            pNDI_send = nullptr;
        }
        NDIlib_destroy();
        std::cout << "✅ Mobile camera NDI source stopped" << std::endl;
    }
};

int main() {
    std::cout << "🚀 Starting Mobile Camera NDI Source..." << std::endl;
    
    MobileNDISource source("http://localhost:8000");
    
    if (!source.initialize()) {
        std::cerr << "❌ Failed to initialize mobile camera NDI source" << std::endl;
        return 1;
    }
    
    // Handle Ctrl+C
    std::signal(SIGINT, [](int) {
        std::cout << "\n🛑 Received interrupt signal..." << std::endl;
        exit(0);
    });
    
    source.start();
    
    return 0;
}
