'use client';

import { useState } from 'react';
import { StreamControlsProps, SpatialLayer } from '../../types/dashboard';
import { useDashboardStore } from '../../store/dashboard-store';

export default function StreamControls({ stream, onDisconnect, onRename, className = '' }: StreamControlsProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(stream.customName || stream.deviceName);

  const handleRename = () => {
    if (newName.trim() && newName !== stream.customName) {
      onRename(stream.id, newName.trim());
    }
    setIsRenaming(false);
  };

  const handleCancelRename = () => {
    setNewName(stream.customName || stream.deviceName);
    setIsRenaming(false);
  };

  const formatDuration = (connectedAt: Date | string) => {
    const now = new Date();
    const connectedDate = typeof connectedAt === 'string' ? new Date(connectedAt) : connectedAt;
    const diff = now.getTime() - connectedDate.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Stream Controls</h3>
        <div className="text-xs text-gray-400">
          Connected: {formatDuration(stream.connectedAt)}
        </div>
      </div>

      {/* Stream Name */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-1">Stream Name</label>
        {isRenaming ? (
          <div className="flex space-x-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-2 py-1 bg-gray-700 text-white text-sm rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') handleCancelRename();
              }}
            />
            <button
              onClick={handleRename}
              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
            >
              ✓
            </button>
            <button
              onClick={handleCancelRename}
              className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-white text-sm">{stream.customName || stream.deviceName}</span>
            <button
              onClick={() => setIsRenaming(true)}
              className="text-gray-400 hover:text-white text-xs"
            >
              ✏️
            </button>
          </div>
        )}
      </div>

      {/* Stream Info */}
      <div className="mb-4 text-xs text-gray-400">
        <div className="flex justify-between">
          <span>Resolution:</span>
          <span className="text-white">{stream.resolution.width}×{stream.resolution.height}</span>
        </div>
        <div className="flex justify-between">
          <span>Device:</span>
          <span className="text-white">{stream.deviceName}</span>
        </div>
        <div className="flex justify-between">
          <span>Client ID:</span>
          <span className="text-white font-mono">{stream.clientId.slice(-8)}</span>
        </div>
      </div>

      {/* Quality Selector */}
      <div className="mb-4">
        <label className="block text-xs text-gray-400 mb-2">Quality</label>
        <div className="flex space-x-1">
          {([0, 1, 2] as SpatialLayer[]).map((layer) => {
            const labels = ['Low', 'Medium', 'High'];
            const currentQuality = (stream as any).quality as { spatialLayer: number } | undefined;
            const isActive = currentQuality?.spatialLayer === layer;
            const isDefault = !currentQuality && layer === 2;
            return (
              <button
                key={layer}
                onClick={() => {
                  if (!isActive) {
                    useDashboardStore.getState().setStreamQuality(stream.producerId, layer);
                  }
                }}
                className={`flex-1 px-2 py-1.5 text-xs rounded font-medium transition-colors ${
                  isActive || isDefault
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {labels[layer]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex space-x-2">
        <button
          onClick={() => onDisconnect(stream.id)}
          className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
        >
          Disconnect
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/stream`)}
          className="px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors"
          title="Copy stream URL"
        >
          📋
        </button>
      </div>
    </div>
  );
}

