'use client';

import { useEffect, useRef } from 'react';
import { LensInfo, getLensDisplayName, getFilteredLenses } from '../lib/camera-service';

interface CameraPreviewProps {
  stream: MediaStream | null;
  isFullscreen?: boolean;
  onVideoClick?: () => void;
  className?: string;
  // Camera overlay controls (bottom)
  lenses?: LensInfo[];
  selectedLensDeviceId?: string | null;
  onSelectLens?: (deviceId: string) => void;
  zoom?: number | null;
  zoomMin?: number | null;
  zoomMax?: number | null;
  zoomSupported?: boolean;
  onZoomChange?: (level: number) => void;
}

export default function CameraPreview({ 
  stream, 
  isFullscreen = false, 
  onVideoClick,
  className = '',
  lenses = [],
  selectedLensDeviceId = null,
  onSelectLens,
  zoom = null,
  zoomMin = null,
  zoomMax = null,
  zoomSupported = false,
  onZoomChange,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const filteredLenses = getFilteredLenses(lenses);
  const showLensPicker = filteredLenses.length > 1 && onSelectLens;
  const showZoom = zoomSupported && zoomMin !== null && zoomMax !== null && onZoomChange;
  const activeLens = lenses.find(l => l.deviceId === selectedLensDeviceId);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, activeLens?.deviceId]);

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
      />

      {/* Bottom overlay — camera controls inside the video frame */}
      {(showLensPicker || showZoom) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-3 px-3">
          {showLensPicker && (
            <div className="overflow-x-auto whitespace-nowrap scrollbar-hide -mx-1 px-1 mb-2">
              <div className="flex gap-2">
                {filteredLenses.map(lens => (
                  <button
                    key={lens.deviceId}
                    onClick={(e) => { e.stopPropagation(); onSelectLens!(lens.deviceId); }}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all touch-manipulation ${
                      selectedLensDeviceId === lens.deviceId
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-black/50 text-white/80 hover:bg-black/70'
                    }`}
                  >
                    {getLensDisplayName(lens)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showZoom && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-white text-xs w-8 text-right flex-shrink-0">{zoom?.toFixed(1)}x</span>
              <input
                type="range"
                min={zoomMin ?? 1}
                max={zoomMax ?? 10}
                step={(zoomMax! - zoomMin!) / 20 || 0.1}
                value={String(zoom ?? zoomMin ?? 1)}
                onChange={e => onZoomChange!(parseFloat(e.target.value))}
                onClick={e => e.stopPropagation()}
                className="flex-1 h-1.5 bg-white/30 rounded-full appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          )}
        </div>
      )}
      
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
