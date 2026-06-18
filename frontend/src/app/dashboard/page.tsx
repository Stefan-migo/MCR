'use client';

import { useEffect, useState, useCallback } from 'react';
import { getBackendWsUrl } from '../../lib/url';
import { useDashboardStore } from '../../store/dashboard-store';
import ViewToggle from '../../components/dashboard/ViewToggle';
import StreamGrid from '../../components/dashboard/StreamGrid';
import StreamList from '../../components/dashboard/StreamList';
import StreamStats from '../../components/dashboard/StreamStats';
import StreamControls from '../../components/dashboard/StreamControls';
import QRCodeModal from '../../components/dashboard/QRCodeModal';
import StreamModal from '../../components/dashboard/StreamModal';

export default function DashboardPage() {
  const {
    streams,
    viewMode,
    selectedStream,
    isConnected,
    isLoading,
    error,
    ndiStates,
    cameraControlState,
    setViewMode,
    setSelectedStream,
    setError,
    initializeService,
    disconnectService,
    refreshStreams,
    updateStreamName,
    disconnectStream,
    setNdiControl,
    setCameraLens,
    forceVp8,
  } = useDashboardStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [modalStreamId, setModalStreamId] = useState<string | null>(null);

  // Initialize dashboard service on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Add a small delay to ensure backend is ready
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Compute secure backend WS URL with env override
        const serverUrl = process.env.NEXT_PUBLIC_WS_URL || getBackendWsUrl();
        
        console.log('🚀 Initializing dashboard service with URL:', serverUrl);
        await initializeService(serverUrl);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        setError('Failed to connect to server');
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      disconnectService();
    };
  }, [initializeService, disconnectService, setError]);

  // Auto-refresh streams every 5 seconds
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      refreshStreams();
    }, 5000);

    return () => clearInterval(interval);
  }, [isConnected, refreshStreams]);

  const handleStreamSelect = (streamId: string) => {
    // Primary action: open modal. Sidebar selection still works independently.
    setModalStreamId(streamId);
    setSelectedStream(streamId);
  };

  const handleStreamDisconnect = async (streamId: string) => {
    try {
      await disconnectStream(streamId);
      if (selectedStream === streamId) {
        setSelectedStream(null);
      }
    } catch (error) {
      console.error('Failed to disconnect stream:', error);
    }
  };

  const handleStreamRename = async (streamId: string, currentName: string) => {
    try {
      const newName = prompt(`Enter new name for "${currentName}":`, currentName);
      if (newName && newName.trim() && newName !== currentName) {
        await updateStreamName(streamId, newName.trim());
      }
    } catch (error) {
      console.error('Failed to rename stream:', error);
    }
  };

  const handleNdiToggle = useCallback(
    (deviceId: string, enabled: boolean, ndiName?: string) => {
      setNdiControl(deviceId, enabled, ndiName);
    },
    [setNdiControl]
  );

  const handleCameraLensSelect = useCallback(
    (deviceId: string, lensDeviceId: string) => {
      setCameraLens(deviceId, { lensDeviceId });
    },
    [setCameraLens]
  );

  const handleCameraZoomChange = useCallback(
    (deviceId: string, zoom: number) => {
      setCameraLens(deviceId, { zoom });
    },
    [setCameraLens]
  );

  const handleForceVp8 = useCallback(
    (deviceId: string) => {
      forceVp8(deviceId);
    },
    [forceVp8]
  );

  const modalStreamData = modalStreamId
    ? streams.find((s) => s.id === modalStreamId)
    : null;
  const modalDeviceId = (modalStreamData as any)?.deviceId as string | undefined;
  const modalNdiState = modalDeviceId ? ndiStates[modalDeviceId] || null : null;
  const modalCameraState = modalDeviceId ? cameraControlState[modalDeviceId] || null : null;

  const selectedStreamData = streams.find(s => s.id === selectedStream);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-lg">Initializing dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-black bg-opacity-80 text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">🎛️ VJ Dashboard</h1>
            <p className="text-sm text-gray-400">Monitor and control mobile camera streams</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {/* View Toggle */}
            <ViewToggle
              currentMode={viewMode}
              onModeChange={setViewMode}
            />
            
            {/* Refresh Button */}
            <button
              onClick={refreshStreams}
              disabled={isLoading}
              className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? '⏳' : '🔄'} Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Error Display */}
      {error && (
        <div className="bg-red-600 text-white p-4 mx-4 mt-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xl">⚠️</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-white hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Streams Display */}
          <div className="lg:col-span-3">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-white mb-2">
                Active Streams ({streams.length})
              </h2>
              <p className="text-sm text-gray-400">
                {streams.length === 0 
                  ? 'No streams connected. Use mobile devices to connect.' 
                  : `${streams.length} stream${streams.length === 1 ? '' : 's'} active`
                }
              </p>
            </div>

            {viewMode === 'grid' ? (
              <StreamGrid
                streams={streams}
                selectedStream={selectedStream}
                onStreamSelect={handleStreamSelect}
                onStreamDisconnect={handleStreamDisconnect}
                onStreamRename={handleStreamRename}
              />
            ) : (
              <StreamList
                streams={streams}
                selectedStream={selectedStream}
                onStreamSelect={handleStreamSelect}
                onStreamDisconnect={handleStreamDisconnect}
                onStreamRename={handleStreamRename}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Selected Stream Stats */}
            {selectedStreamData && selectedStreamData.stats && (
              <StreamStats stats={selectedStreamData.stats} />
            )}

            {/* Selected Stream Controls */}
            {selectedStreamData && (
              <StreamControls
                stream={selectedStreamData}
                onDisconnect={handleStreamDisconnect}
                onRename={handleStreamRename}
              />
            )}

            {/* Quick Actions */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/stream`)}
                  className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                >
                  📋 Copy Stream URL
                </button>
                <button
                  onClick={() => setShowQR(true)}
                  className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                >
                  📱 Show QR Code
                </button>
                <button
                  onClick={refreshStreams}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  🔄 Refresh Streams
                </button>
                {selectedStream && (
                  <button
                    onClick={() => setSelectedStream(null)}
                    className="w-full px-3 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600 transition-colors"
                  >
                    ✕ Clear Selection
                  </button>
                )}
              </div>
            </div>

            {/* System Info */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-white mb-3">System Info</h3>
              <div className="text-xs text-gray-400 space-y-1">
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={`flex items-center space-x-1 ${
                    isConnected ? 'text-green-400' : 'text-red-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      isConnected ? 'bg-green-400' : 'bg-red-400'
                    }`}></div>
                    <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Streams:</span>
                  <span className="text-white">{streams.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>View Mode:</span>
                  <span className="text-white capitalize">{viewMode}</span>
                </div>
                <div className="flex justify-between">
                  <span>Server:</span>
                  <span className="text-white">localhost:3001</span>
                </div>
                {error && (
                  <div className="flex justify-between">
                    <span>Error:</span>
                    <span className="text-red-400 truncate max-w-32" title={error}>
                      {error}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalStreamId && (
        <StreamModal
          stream={modalStreamData}
          isOpen={true}
          onClose={() => setModalStreamId(null)}
          onDisconnect={handleStreamDisconnect}
          onRename={handleStreamRename}
          onNdiToggle={handleNdiToggle}
          ndiState={modalNdiState}
          cameraState={modalCameraState}
          onCameraLensSelect={handleCameraLensSelect}
          onCameraZoomChange={handleCameraZoomChange}
          onForceVp8={handleForceVp8}
        />
      )}

      {showQR && (
        <QRCodeModal
          url={`${typeof window !== 'undefined' ? window.location.origin : ''}/stream`}
          onClose={() => setShowQR(false)}
        />
      )}
    </div>
  );
}

