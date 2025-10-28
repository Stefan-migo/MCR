'use client';

interface ConnectionStatusProps {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  isStreaming: boolean;
  className?: string;
}

export default function ConnectionStatus({ 
  connectionState, 
  isStreaming, 
  className = '' 
}: ConnectionStatusProps) {
  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return isStreaming ? 'bg-green-500' : 'bg-yellow-500';
      case 'connecting':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      case 'disconnected':
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return isStreaming ? 'Streaming' : 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  };

  const getStatusIcon = () => {
    switch (connectionState) {
      case 'connected':
        return isStreaming ? '📡' : '🔗';
      case 'connecting':
        return '⏳';
      case 'error':
        return '❌';
      case 'disconnected':
      default:
        return '🔌';
    }
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${
        connectionState === 'connecting' ? 'animate-pulse' : ''
      }`}></div>
      
      <span className="text-sm font-medium text-white">
        {getStatusIcon()} {getStatusText()}
      </span>
      
      {connectionState === 'connected' && isStreaming && (
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-red-400 font-bold">REC</span>
        </div>
      )}
    </div>
  );
}
