'use client';

import { StreamListProps } from '../../types/dashboard';

export default function StreamList({ 
  streams, 
  selectedStream, 
  onStreamSelect, 
  onStreamDisconnect, 
  onStreamRename, 
  className = '' 
}: StreamListProps) {
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

  const getQualityColor = (bitrate: number) => {
    if (bitrate >= 1500000) return 'text-green-400';
    if (bitrate >= 800000) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (streams.length === 0) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">📹</div>
          <h3 className="text-xl font-semibold mb-2">No Active Streams</h3>
          <p className="text-sm">Connect mobile devices to see camera feeds here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Stream
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Resolution
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Bitrate
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Latency
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {streams.map((stream) => (
              <tr 
                key={stream.id}
                className={`hover:bg-gray-700 cursor-pointer transition-colors ${
                  selectedStream === stream.id ? 'bg-blue-900 bg-opacity-30' : ''
                }`}
                onClick={() => onStreamSelect(stream.id)}
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 bg-gray-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-lg">📹</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-white">
                        {stream.customName || stream.deviceName}
                      </div>
                      <div className="text-sm text-gray-400">
                        {stream.deviceName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm text-white">
                    {stream.resolution.width}×{stream.resolution.height}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className={`text-sm font-mono ${getQualityColor(stream.bitrate)}`}>
                    {formatBitrate(stream.bitrate)}
                  </div>
                  {stream.stats && (
                    <div className="text-xs text-gray-400">
                      {stream.stats.frameRate} fps
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  {stream.stats ? (
                    <div className="text-sm text-white">
                      <div className="font-mono">{stream.stats.rtt}ms</div>
                      <div className="text-xs text-gray-400">
                        Loss: {stream.stats.packetsLost}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">-</div>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm text-white font-mono">
                    {formatDuration(stream.connectedAt)}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStreamRename(stream.id, stream.customName || stream.deviceName);
                      }}
                      className="text-blue-400 hover:text-blue-300"
                      title="Rename stream"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStreamDisconnect(stream.id);
                      }}
                      className="text-red-400 hover:text-red-300"
                      title="Disconnect stream"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

