'use client';

import { useState } from 'react';
import { StreamCardProps } from '../../types/dashboard';
import { useDashboardStore } from '../../store/dashboard-store';
import StreamPreview from './StreamPreview';

export default function StreamCard({ 
  stream, 
  isSelected = false, 
  onDisconnect, 
  onRename, 
  onSelect, 
  className = '' 
}: StreamCardProps) {
  const [showStats, setShowStats] = useState(false);
  const { devices } = useDashboardStore();
  
  // Find device state for this stream
  const deviceId = (stream as any).deviceId;
  const device = deviceId ? devices.find(d => d.deviceId === deviceId) : null;
  const isStreaming = device?.isStreaming ?? true; // Default to true for backward compatibility
  const isConnected = device?.isConnected ?? true;
  
  // If device is not found in devices array, it means it was removed
  if (deviceId && !device) {
    return null; // Don't render the card if device was removed
  }

  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    }
    return `${(bitrate / 1000).toFixed(0)} Kbps`;
  };

  const formatDuration = (connectedAt: Date | string) => {
    const now = new Date();
    const connectedDate = typeof connectedAt === 'string' ? new Date(connectedAt) : connectedAt;
    const diff = now.getTime() - connectedDate.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate streaming duration (only when actively streaming)
  const getStreamingDuration = () => {
    if (!isStreaming || !device) return '0:00';
    
    const now = new Date();
    const lastSeenAt = new Date(device.lastSeenAt);
    const diff = now.getTime() - lastSeenAt.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getQualityColor = (bitrate: number) => {
    if (bitrate >= 1500000) return 'bg-green-500';
    if (bitrate >= 800000) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleCardClick = () => {
    // ponytail: card click opens modal, popup moves inside the modal
    onSelect(stream.id);
  };

  return (
    <div 
      className={`bg-gray-800 rounded-lg overflow-hidden cursor-pointer transition-all hover:bg-gray-700 ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      } ${!isConnected ? 'opacity-50' : ''} ${className}`}
      onClick={handleCardClick}
    >
      {/* Video Preview */}
      <div className="relative aspect-video bg-gray-900">
        {stream.producerId ? (
          <StreamPreview producerId={stream.producerId} mirrored={true} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">📹</div>
              <div className="text-sm">
                {!isConnected ? 'Device Disconnected' : 
                 !isStreaming ? 'Not Streaming' : 'Video Preview'}
              </div>
              <div className="text-xs text-gray-600">
                {stream.resolution.width}×{stream.resolution.height}
              </div>
            </div>
          </div>
        )}
        
        {/* Status Badge */}
        <div className="absolute top-2 left-2">
          {isStreaming ? (
            <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
              Live Stream
            </div>
          ) : isConnected ? (
            <div className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full font-medium">
              Not Streaming
            </div>
          ) : (
            <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium">
              Disconnected
            </div>
          )}
        </div>
        
        {/* Quality Badge */}
        <div className="absolute top-2 right-2 flex space-x-1">
          {(stream as any).quality ? (
            <div className="bg-blue-600 bg-opacity-80 text-white text-xs px-2 py-1 rounded font-medium">
              {((stream as any).quality as { label: string }).label}
            </div>
          ) : (
            <div className="bg-gray-700 bg-opacity-80 text-gray-300 text-xs px-2 py-1 rounded font-medium">
              High
            </div>
          )}
          <div className="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
            {isStreaming ? getStreamingDuration() : formatDuration(stream.connectedAt)}
          </div>
        </div>
        
        {/* Stats Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowStats(!showStats);
          }}
          className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded hover:bg-opacity-90"
        >
          📊
        </button>
      </div>

      {/* Stream Info */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-semibold truncate">
            {stream.customName || stream.deviceName}
          </h3>
          <div className="flex space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRename(stream.id, stream.customName || stream.deviceName);
              }}
              className="text-blue-400 hover:text-blue-300 text-sm"
              title="Rename device"
            >
              ✏️
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDisconnect(stream.id);
              }}
              className="text-red-400 hover:text-red-300 text-sm"
              title="Disconnect stream"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex justify-between">
            <span>Bitrate:</span>
            <span className="text-white">{formatBitrate(stream.bitrate)}</span>
          </div>
          <div className="flex justify-between">
            <span>Device:</span>
            <span className="text-white">{stream.deviceName}</span>
          </div>
        </div>

        {/* Quick Stats */}
        {showStats && stream.stats && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">RTT:</span>
                <span className="text-white ml-1">{stream.stats.rtt}ms</span>
              </div>
              <div>
                <span className="text-gray-400">FPS:</span>
                <span className="text-white ml-1">{stream.stats.frameRate}</span>
              </div>
              <div>
                <span className="text-gray-400">Loss:</span>
                <span className="text-white ml-1">{stream.stats.packetsLost}</span>
              </div>
              <div>
                <span className="text-gray-400">Jitter:</span>
                <span className="text-white ml-1">{stream.stats.jitter}ms</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

