'use client';

import { useEffect, useState } from 'react';
import { useStreamStore } from '../../store/stream-store';
import { CameraService } from '../../lib/camera-service';
import CameraPreview from '../../components/CameraPreview';
import ConnectionStatus from '../../components/ConnectionStatus';
import StreamControls from '../../components/StreamControls';
import QualityIndicator from '../../components/QualityIndicator';

export default function StreamPage() {
  const {
    connectionState,
    isStreaming,
    currentStream,
    streamStats,
    selectedQualityPreset,
    showControls,
    isFullscreen,
    error,
    enableAudio,
    enableVideo,
    cameraService,
    initializeServices,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
    switchCamera,
    changeQuality,
    toggleAudio,
    toggleVideo,
    toggleControls,
    toggleFullscreen,
    setError
  } = useStreamStore();

  const [isInitialized, setIsInitialized] = useState(false);
  const [showQualityIndicator, setShowQualityIndicator] = useState(false);

  // Initialize services on component mount
  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeServices();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize services:', error);
      }
    };

    initialize();
  }, [initializeServices]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (isCurrentlyFullscreen !== isFullscreen) {
        toggleFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, toggleFullscreen]);

  // Auto-hide controls in fullscreen (only when streaming)
  useEffect(() => {
    if (isFullscreen && showControls && isStreaming) {
      const timer = setTimeout(() => {
        toggleControls();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isFullscreen, showControls, isStreaming, toggleControls]);

  // Handle touch/click to show controls in fullscreen
  const handleVideoClick = () => {
    if (isFullscreen) {
      toggleControls();
    } else {
      toggleFullscreen();
    }
  };

  // Error handling
  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000); // Auto-clear error after 5 seconds
  };

  // Wrapped action handlers with error handling
  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      handleError('Failed to connect to server');
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      handleError('Failed to disconnect');
    }
  };

  const handleStartStreaming = async () => {
    try {
      await startStreaming();
    } catch (error) {
      handleError('Failed to start streaming');
    }
  };

  const handleStopStreaming = async () => {
    try {
      await stopStreaming();
    } catch (error) {
      handleError('Failed to stop streaming');
    }
  };

  const handleSwitchCamera = async () => {
    try {
      await switchCamera();
    } catch (error) {
      handleError('Failed to switch camera');
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-lg">Initializing camera services...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gray-900 flex flex-col ${
      isFullscreen ? 'fixed inset-0 z-50' : ''
    }`}>
      {/* Header - Hidden in fullscreen */}
      {!isFullscreen && (
        <header className="bg-black bg-opacity-80 text-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">📱 Mobile Stream</h1>
              <p className="text-sm text-gray-400">Professional camera streaming</p>
            </div>
            
            <ConnectionStatus
              connectionState={connectionState}
              isStreaming={isStreaming}
            />
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative">
        {/* Camera Preview */}
        <CameraPreview
          stream={currentStream}
          isFullscreen={isFullscreen}
          onVideoClick={handleVideoClick}
          className="w-full h-full"
        />

        {/* Fullscreen Status Overlay */}
        {isFullscreen && (
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
            <ConnectionStatus
              connectionState={connectionState}
              isStreaming={isStreaming}
              className="bg-black bg-opacity-70 px-3 py-2 rounded-lg"
            />
            
            <div className="flex items-center space-x-2">
              {showQualityIndicator && streamStats && (
                <QualityIndicator
                  stats={streamStats}
                  className="max-w-xs"
                />
              )}
              
              {/* Persistent Exit Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="bg-black bg-opacity-70 text-white p-2 rounded-lg hover:bg-opacity-90 transition-all"
                title="Exit Fullscreen"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Quality Indicator Toggle (Fullscreen) */}
        {isFullscreen && isStreaming && (
          <button
            onClick={() => setShowQualityIndicator(!showQualityIndicator)}
            className="absolute top-4 right-4 bg-black bg-opacity-70 text-white p-2 rounded-lg"
          >
            📊
          </button>
        )}

        {/* Bottom-right Exit Fullscreen Button (Mobile-friendly) */}
        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute bottom-4 right-4 bg-black bg-opacity-70 text-white p-3 rounded-full shadow-lg hover:bg-opacity-90 transition-all touch-manipulation"
            title="Exit Fullscreen"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Error Display */}
        {error && (
          <div className="absolute top-1/2 left-4 right-4 transform -translate-y-1/2">
            <div className="bg-red-600 text-white p-4 rounded-lg shadow-lg">
              <div className="flex items-center space-x-2">
                <span className="text-xl">⚠️</span>
                <div>
                  <p className="font-semibold">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls - Show/Hide based on state */}
      {(!isFullscreen || showControls) && (
        <div className="relative">
          <StreamControls
            connectionState={connectionState}
            isStreaming={isStreaming}
            enableAudio={enableAudio}
            enableVideo={enableVideo}
            hasMultipleCameras={cameraService?.hasMultipleCameras || false}
            qualityPresets={CameraService.QUALITY_PRESETS}
            selectedQualityPreset={selectedQualityPreset}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onStartStreaming={handleStartStreaming}
            onStopStreaming={handleStopStreaming}
            onSwitchCamera={handleSwitchCamera}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onChangeQuality={changeQuality}
            onToggleFullscreen={toggleFullscreen}
            className={isFullscreen ? 'absolute bottom-0 left-0 right-0' : ''}
          />
        </div>
      )}

      {/* Quality Indicator (Non-fullscreen) */}
      {!isFullscreen && isStreaming && streamStats && (
        <div className="p-4">
          <QualityIndicator stats={streamStats} />
        </div>
      )}

      {/* Instructions */}
      {!isFullscreen && connectionState === 'disconnected' && (
        <div className="p-4 bg-gray-800 text-white">
          <h3 className="font-semibold mb-2">Getting Started</h3>
          <ol className="text-sm space-y-1 text-gray-300">
            <li>1. Tap "Connect" to connect to the streaming server</li>
            <li>2. Allow camera and microphone permissions when prompted</li>
            <li>3. Tap "Start Stream" to begin broadcasting</li>
            <li>4. Use controls to adjust quality and switch cameras</li>
            <li>5. Tap the video for fullscreen mode</li>
          </ol>
        </div>
      )}
    </div>
  );
}
