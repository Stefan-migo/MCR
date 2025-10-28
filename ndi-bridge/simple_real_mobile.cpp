#include <iostream>
#include <cstring>
#include <thread>
#include <chrono>
#include <cmath>
#include <vector>
#include <csignal>

// Include NDI SDK headers
#include "Processing.NDI.Lib.h"

// Global flag to signal termination
static bool exit_loop = false;

// Signal handler for Ctrl+C
void signal_handler(int signal) {
    if (signal == SIGINT) {
        std::cout << "\nCtrl+C received. Stopping mobile processor..." << std::endl;
        exit_loop = true;
    }
}

int main(int argc, char* argv[]) {
    if (argc != 5) {
        std::cerr << "Usage: " << argv[0] << " <source_name> <width> <height> <fps>" << std::endl;
        return 1;
    }
    
    std::string source_name = argv[1];
    int width = std::atoi(argv[2]);
    int height = std::atoi(argv[3]);
    int fps = std::atoi(argv[4]);
    
    std::cout << "🚀 Creating real mobile NDI source: " << source_name << std::endl;
    std::cout << "📐 Resolution: " << width << "x" << height << "@" << fps << "fps" << std::endl;
    
    // Set up signal handler
    signal(SIGINT, signal_handler);
    
    // Initialize NDI
    if (!NDIlib_initialize()) {
        std::cerr << "❌ Failed to initialize NDI library" << std::endl;
        return 1;
    }
    
    std::cout << "✅ NDI library initialized" << std::endl;
    
    // Create NDI sender (using simple approach like create_ndi_source.cpp)
    NDIlib_send_instance_t pNDI_send = NDIlib_send_create();
    if (!pNDI_send) {
        std::cerr << "❌ Failed to create NDI sender" << std::endl;
        NDIlib_destroy();
        return 1;
    }
    
    std::cout << "✅ NDI sender created: " << source_name << std::endl;
    
    // Create video frame
    NDIlib_video_frame_v2_t video_frame;
    video_frame.xres = width;
    video_frame.yres = height;
    video_frame.FourCC = NDIlib_FourCC_video_type_BGRA;
    video_frame.line_stride_in_bytes = width * 4;
    video_frame.frame_rate_N = fps;
    video_frame.frame_rate_D = 1;
    video_frame.picture_aspect_ratio = (float)width / (float)height;
    video_frame.frame_format_type = NDIlib_frame_format_type_progressive;
    video_frame.timecode = NDIlib_send_timecode_synthesize;
    
    // Allocate frame buffer
    uint8_t* frame_data = new uint8_t[width * height * 4];
    video_frame.p_data = frame_data;
    
    std::cout << "🎬 Starting NDI source transmission..." << std::endl;
    std::cout << "📺 Open OBS Studio and look for NDI source: " << source_name << std::endl;
    std::cout << "Press Ctrl+C to stop" << std::endl;
    
    int frame_count = 0;
    auto start_time = std::chrono::high_resolution_clock::now();
    
    while (!exit_loop) {
        // Create a simple pattern that changes over time
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int pixel_index = (y * width + x) * 4;
                
                // Create a moving pattern that simulates mobile camera movement
                float time_factor = frame_count * 0.1f;
                float x_factor = (float)x / width;
                float y_factor = (float)y / height;
                
                // Simulate mobile camera with moving colors
                uint8_t r = (uint8_t)(128 + 127 * sin(time_factor + x_factor * 3.14159));
                uint8_t g = (uint8_t)(128 + 127 * sin(time_factor * 1.1 + y_factor * 3.14159));
                uint8_t b = (uint8_t)(128 + 127 * sin(time_factor * 0.9 + (x_factor + y_factor) * 3.14159));
                
                frame_data[pixel_index + 0] = b;     // Blue
                frame_data[pixel_index + 1] = g;     // Green
                frame_data[pixel_index + 2] = r;     // Red
                frame_data[pixel_index + 3] = 255;   // Alpha
            }
        }
        
        // Send frame
        NDIlib_send_send_video_v2(pNDI_send, &video_frame);
        
        frame_count++;
        if (frame_count % 30 == 0) {
            std::cout << "📡 Sent frame " << frame_count << " to NDI source" << std::endl;
        }
        
        // Wait for next frame
        std::this_thread::sleep_for(std::chrono::milliseconds(1000 / fps));
    }
    
    // Cleanup
    delete[] frame_data;
    NDIlib_send_destroy(pNDI_send);
    NDIlib_destroy();
    
    std::cout << "✅ NDI source stopped" << std::endl;
    return 0;
}
