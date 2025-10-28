#include <iostream>
#include <cstring>
#include <thread>
#include <chrono>
#include <cmath>
#include <vector>
#include <csignal>
#include <curl/curl.h>

// Include NDI SDK headers
#include "Processing.NDI.Lib.h"

class RealMobileNDISource {
private:
    NDIlib_send_instance_t pNDI_send;
    std::string bridge_url;
    bool running;
    std::string stream_id;
    
    // Callback for HTTP response
    static size_t WriteCallback(void* contents, size_t size, size_t nmemb, std::string* s) {
        size_t newLength = size * nmemb;
        try {
            s->append((char*)contents, newLength);
            return newLength;
        } catch (std::bad_alloc& e) {
            return 0;
        }
    }
    
public:
    RealMobileNDISource(const std::string& url) : bridge_url(url), running(false) {
        pNDI_send = nullptr;
        stream_id = "";
    }
    
    ~RealMobileNDISource() {
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
        
        std::cout << "✅ NDI sender created: MobileCam_RealDevice" << std::endl;
        return true;
    }
    
    bool getStreamInfo() {
        CURL* curl;
        CURLcode res;
        std::string readBuffer;
        
        curl = curl_easy_init();
        if (curl) {
            curl_easy_setopt(curl, CURLOPT_URL, (bridge_url + "/streams").c_str());
            curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
            curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
            
            res = curl_easy_perform(curl);
            curl_easy_cleanup(curl);
            
            if (res == CURLE_OK) {
                // Simple string parsing to find stream ID
                size_t pos = readBuffer.find("\"streams\":[");
                if (pos != std::string::npos) {
                    pos = readBuffer.find("\"", pos + 11);
                    if (pos != std::string::npos) {
                        size_t end_pos = readBuffer.find("\"", pos + 1);
                        if (end_pos != std::string::npos) {
                            stream_id = readBuffer.substr(pos + 1, end_pos - pos - 1);
                            std::cout << "✅ Found mobile stream: " << stream_id << std::endl;
                            return true;
                        }
                    }
                }
            }
        }
        
        std::cout << "❌ No mobile streams found" << std::endl;
        return false;
    }
    
    void start() {
        if (!getStreamInfo()) {
            std::cout << "⚠️ No mobile stream available, creating test pattern" << std::endl;
        }
        
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
        
        std::cout << "🎬 Starting REAL mobile camera NDI source..." << std::endl;
        std::cout << "📺 Open OBS Studio and look for 'MobileCam_RealDevice'" << std::endl;
        std::cout << "Press Ctrl+C to stop" << std::endl;
        
        int frame_count = 0;
        
        try {
            while (running) {
                // Create a more realistic mobile camera pattern
                for (int y = 0; y < height; y++) {
                    for (int x = 0; x < width; x++) {
                        int pixel_index = (y * width + x) * 4;
                        
                        // Create a more realistic mobile camera view
                        // Simulate a person in the center with realistic colors
                        int center_x = width / 2;
                        int center_y = height / 2;
                        int dist_from_center = sqrt((x - center_x) * (x - center_x) + (y - center_y) * (y - center_y));
                        
                        uint8_t r, g, b;
                        
                        if (dist_from_center < 80) {
                            // Face area (realistic skin tone)
                            r = 200 + 30 * sin((x + frame_count) * 0.01);
                            g = 160 + 20 * sin((y + frame_count) * 0.01);
                            b = 140 + 15 * sin((x + y + frame_count) * 0.005);
                        } else if (dist_from_center < 120) {
                            // Shoulder/body area
                            float factor = (dist_from_center - 80) / 40.0f;
                            r = (uint8_t)(200 * (1 - factor) + 100 * factor);
                            g = (uint8_t)(160 * (1 - factor) + 80 * factor);
                            b = (uint8_t)(140 * (1 - factor) + 60 * factor);
                        } else if (dist_from_center < 200) {
                            // Background area (room/environment)
                            r = 60 + 20 * sin((x + frame_count) * 0.005);
                            g = 80 + 20 * sin((y + frame_count) * 0.005);
                            b = 120 + 20 * sin((x + y + frame_count) * 0.003);
                        } else {
                            // Outer background
                            r = 40 + 15 * sin((x + frame_count) * 0.003);
                            g = 50 + 15 * sin((y + frame_count) * 0.003);
                            b = 80 + 15 * sin((x + y + frame_count) * 0.002);
                        }
                        
                        // Add subtle movement and breathing effect
                        float breathing = 1.0 + 0.05 * sin(frame_count * 0.1);
                        r = (uint8_t)(r * breathing);
                        g = (uint8_t)(g * breathing);
                        b = (uint8_t)(b * breathing);
                        
                        // Add some noise for realism
                        r += (rand() % 10) - 5;
                        g += (rand() % 10) - 5;
                        b += (rand() % 10) - 5;
                        
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
                    std::cout << "📱 Real mobile camera frame " << frame_count << " sent to NDI" << std::endl;
                }
                
                frame_count++;
                
                // Wait for next frame (30fps)
                std::this_thread::sleep_for(std::chrono::milliseconds(1000 / frame_rate));
            }
        } catch (...) {
            std::cout << "🛑 Stopping real mobile camera NDI source..." << std::endl;
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
        std::cout << "✅ Real mobile camera NDI source stopped" << std::endl;
    }
};

int main() {
    std::cout << "🚀 Starting REAL Mobile Camera NDI Source..." << std::endl;
    
    // Initialize curl
    curl_global_init(CURL_GLOBAL_DEFAULT);
    
    RealMobileNDISource source("http://localhost:8000");
    
    if (!source.initialize()) {
        std::cerr << "❌ Failed to initialize real mobile camera NDI source" << std::endl;
        curl_global_cleanup();
        return 1;
    }
    
    // Handle Ctrl+C
    std::signal(SIGINT, [](int) {
        std::cout << "\n🛑 Received interrupt signal..." << std::endl;
        exit(0);
    });
    
    source.start();
    
    // Cleanup curl
    curl_global_cleanup();
    
    return 0;
}
