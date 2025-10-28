'use client';

import { CameraQualityPreset } from '../lib/camera-service';

interface StreamControlsProps {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  isStreaming: boolean;
  enableAudio: boolean;
  enableVideo: boolean;
  hasMultipleCameras: boolean;
  qualityPresets: CameraQualityPreset[];
  selectedQualityPreset: CameraQualityPreset;
  onConnect: () => void;
  onDisconnect: () => void;
  onStartStreaming: () => void;
  onStopStreaming: () => void;
  onSwitchCamera: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onChangeQuality: (preset: CameraQualityPreset) => void;
  onToggleFullscreen: () => void;
  className?: string;
}

export default function StreamControls({
  connectionState,
  isStreaming,
  enableAudio,
  enableVideo,
  hasMultipleCameras,
  qualityPresets,
  selectedQualityPreset,
  onConnect,
  onDisconnect,
  onStartStreaming,
  onStopStreaming,
  onSwitchCamera,
  onToggleAudio,
  onToggleVideo,
  onChangeQuality,
  onToggleFullscreen,
  className = ''
}: StreamControlsProps) {
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  return (
    <div className={`bg-black bg-opacity-80 backdrop-blur-sm p-4 ${className}`}>
      {/* Main Controls Row */}
      <div className="flex items-center justify-center space-x-4 mb-4">
        {/* Connection Button */}
        {!isConnected ? (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className={`px-6 py-3 rounded-full font-semibold text-white transition-all duration-200 ${
              isConnecting
                ? 'bg-blue-500 opacity-50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
            }`}
          >
            {isConnecting ? '⏳ Connecting...' : '🔗 Connect'}
          </button>
        ) : (
          <button
            onClick={onDisconnect}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold transition-all duration-200 active:scale-95"
          >
            🔌 Disconnect
          </button>
        )}

        {/* Streaming Button */}
        {isConnected && (
          <button
            onClick={isStreaming ? onStopStreaming : onStartStreaming}
            className={`px-6 py-3 rounded-full font-semibold text-white transition-all duration-200 active:scale-95 ${
              isStreaming
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isStreaming ? '⏹️ Stop Stream' : '▶️ Start Stream'}
          </button>
        )}
      </div>

      {/* Secondary Controls Row */}
      {isConnected && (
        <div className="flex items-center justify-center space-x-3 mb-4">
          {/* Audio Toggle */}
          <button
            onClick={onToggleAudio}
            className={`p-3 rounded-full transition-all duration-200 active:scale-95 ${
              enableAudio
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
            }`}
            title={enableAudio ? 'Mute Audio' : 'Unmute Audio'}
          >
            {enableAudio ? '🎤' : '🎤'}
          </button>

          {/* Video Toggle */}
          <button
            onClick={onToggleVideo}
            className={`p-3 rounded-full transition-all duration-200 active:scale-95 ${
              enableVideo
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
            }`}
            title={enableVideo ? 'Disable Video' : 'Enable Video'}
          >
            {enableVideo ? '📹' : '📹'}
          </button>

          {/* Camera Switch */}
          {hasMultipleCameras && (
            <button
              onClick={onSwitchCamera}
              className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all duration-200 active:scale-95"
              title="Switch Camera"
            >
              🔄
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={onToggleFullscreen}
            className="p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-all duration-200 active:scale-95"
            title="Toggle Fullscreen"
          >
            ⛶
          </button>
        </div>
      )}

      {/* Quality Settings */}
      {isConnected && (
        <div className="text-center">
          <label className="block text-white text-sm font-medium mb-2">
            Quality
          </label>
          <div className="flex justify-center space-x-2">
            {qualityPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => onChangeQuality(preset)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all duration-200 ${
                  selectedQualityPreset.name === preset.name
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {selectedQualityPreset.width}×{selectedQualityPreset.height} @ {selectedQualityPreset.frameRate}fps
          </div>
        </div>
      )}
    </div>
  );
}
