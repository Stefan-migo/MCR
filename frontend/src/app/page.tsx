'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Home() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div className="max-w-4xl w-full text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-4 text-white">
          📱 Mobile Camera Receptor
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-12">
          Professional real-time mobile camera streaming for VJs and content creators
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {/* Stream Card */}
          <Link href="/stream">
            <div className="group border border-gray-600 rounded-xl p-8 bg-black bg-opacity-30 backdrop-blur-sm hover:bg-opacity-50 transition-all duration-300 cursor-pointer transform hover:scale-105">
              <div className="text-6xl mb-4 group-hover:animate-pulse">🎥</div>
              <h2 className="text-2xl font-semibold mb-4 text-white">Mobile Stream</h2>
              <p className="text-gray-300 mb-4">
                Turn your mobile device into a professional streaming camera
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 bg-green-600 text-white text-sm rounded-full">WebRTC</span>
                <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">Low Latency</span>
                <span className="px-3 py-1 bg-purple-600 text-white text-sm rounded-full">HD Quality</span>
              </div>
              {isMobile && (
                <div className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold">
                  📱 Optimized for Mobile
                </div>
              )}
            </div>
          </Link>

          {/* Dashboard Card */}
          <Link href="/dashboard">
            <div className="group border border-gray-600 rounded-xl p-8 bg-black bg-opacity-30 backdrop-blur-sm hover:bg-opacity-50 transition-all duration-300 cursor-pointer transform hover:scale-105">
              <div className="text-6xl mb-4 group-hover:animate-pulse">🎛️</div>
              <h2 className="text-2xl font-semibold mb-4 text-white">Dashboard</h2>
              <p className="text-gray-300 mb-4">
                Manage and monitor all incoming camera streams
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 bg-green-600 text-white text-sm rounded-full">Multi-Stream</span>
                <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">Real-time Stats</span>
                <span className="px-3 py-1 bg-purple-600 text-white text-sm rounded-full">Stream Control</span>
              </div>
              <div className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold">
                ✅ Dashboard Ready
              </div>
            </div>
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="text-center p-6 bg-black bg-opacity-20 rounded-lg">
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-semibold text-white mb-2">Ultra Low Latency</h3>
            <p className="text-gray-300 text-sm">Sub-100ms latency with WebRTC technology</p>
          </div>
          
          <div className="text-center p-6 bg-black bg-opacity-20 rounded-lg">
            <div className="text-3xl mb-2">🎬</div>
            <h3 className="font-semibold text-white mb-2">Professional Quality</h3>
            <p className="text-gray-300 text-sm">Up to 4K streaming with adaptive bitrate</p>
          </div>
          
          <div className="text-center p-6 bg-black bg-opacity-20 rounded-lg">
            <div className="text-3xl mb-2">🔗</div>
            <h3 className="font-semibold text-white mb-2">NDI Compatible</h3>
            <p className="text-gray-300 text-sm">Direct integration with OBS and Resolume</p>
          </div>
        </div>

        {/* Quick Start */}
        <div className="bg-black bg-opacity-40 rounded-xl p-8 mb-8">
          <h3 className="text-2xl font-bold text-white mb-4">Quick Start</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">1</div>
              <div>
                <p className="font-semibold text-white">Open on Mobile</p>
                <p className="text-gray-300 text-sm">Visit this page on your phone</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">2</div>
              <div>
                <p className="font-semibold text-white">Tap Stream</p>
                <p className="text-gray-300 text-sm">Click the Mobile Stream card</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">3</div>
              <div>
                <p className="font-semibold text-white">Connect & Stream</p>
                <p className="text-gray-300 text-sm">Allow permissions and start streaming</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">4</div>
              <div>
                <p className="font-semibold text-white">Use in OBS</p>
                <p className="text-gray-300 text-sm">Add NDI source to your software</p>
              </div>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-full">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="font-semibold">Phase 2.4: Admin Dashboard - Complete!</span>
          </div>
          <p className="text-gray-400 text-sm mt-2">
            Mobile streaming and VJ dashboard are now fully functional. Ready for Phase 3: NDI Bridge.
          </p>
        </div>
      </div>
    </main>
  );
}

