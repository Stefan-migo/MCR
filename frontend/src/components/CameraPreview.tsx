'use client';

import { useEffect, useRef } from 'react';

interface CameraPreviewProps {
  stream: MediaStream | null;
  isFullscreen?: boolean;
  onVideoClick?: () => void;
  className?: string;
}

export default function CameraPreview({ 
  stream, 
  isFullscreen = false, 
  onVideoClick,
  className = ''
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleVideoClick = () => {
    onVideoClick?.();
  };

  if (!stream) {
    return (
      <div className={`bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center text-white">
          <div className="text-6xl mb-4">📹</div>
          <p className="text-lg">Camera not active</p>
          <p className="text-sm text-gray-400 mt-2">
            Tap the camera button to start
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black ${className}`} onClick={handleVideoClick}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${
          isFullscreen ? 'cursor-pointer' : ''
        }`}
        style={{
          transform: 'scaleX(-1)', // Mirror the video for selfie mode
        }}
      />
      
      {/* Overlay for fullscreen hint */}
      {!isFullscreen && (
        <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
          <div className="text-white text-center">
            <div className="text-2xl mb-2">⛶</div>
            <p className="text-sm">Tap for fullscreen</p>
          </div>
        </div>
      )}
      
      {/* Video info overlay */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
        {stream.getVideoTracks()[0]?.getSettings().width || 0} × {stream.getVideoTracks()[0]?.getSettings().height || 0}
      </div>
      
      {/* Recording indicator */}
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
        <span className="text-white text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
          LIVE
        </span>
      </div>
    </div>
  );
}
