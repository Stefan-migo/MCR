'use client';

import { StreamStats } from '../lib/webrtc-client';

interface QualityIndicatorProps {
  stats: StreamStats | null;
  className?: string;
}

export default function QualityIndicator({ stats, className = '' }: QualityIndicatorProps) {
  if (!stats) {
    return null;
  }

  const getQualityLevel = (bitrate: number): { level: string; color: string } => {
    if (bitrate > 800) {
      return { level: 'Excellent', color: 'text-green-400' };
    } else if (bitrate > 500) {
      return { level: 'Good', color: 'text-yellow-400' };
    } else if (bitrate > 200) {
      return { level: 'Fair', color: 'text-orange-400' };
    } else {
      return { level: 'Poor', color: 'text-red-400' };
    }
  };

  const quality = getQualityLevel(stats.bitrate);

  const formatBitrate = (bitrate: number): string => {
    if (bitrate > 1000) {
      return `${(bitrate / 1000).toFixed(1)} Mbps`;
    }
    return `${bitrate.toFixed(0)} kbps`;
  };

  const getSignalStrengthBars = (bitrate: number): number => {
    if (bitrate > 800) return 4;
    if (bitrate > 500) return 3;
    if (bitrate > 200) return 2;
    return 1;
  };

  const signalBars = getSignalStrengthBars(stats.bitrate);

  return (
    <div className={`bg-black bg-opacity-70 text-white p-3 rounded-lg ${className}`}>
      {/* Quality Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Stream Quality</span>
          <span className={`text-sm font-bold ${quality.color}`}>
            {quality.level}
          </span>
        </div>
        
        {/* Signal Strength Bars */}
        <div className="flex items-center space-x-1">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className={`w-1 rounded-full transition-all duration-300 ${
                bar <= signalBars
                  ? bar <= 2
                    ? 'bg-red-400 h-2'
                    : bar === 3
                    ? 'bg-yellow-400 h-3'
                    : 'bg-green-400 h-4'
                  : 'bg-gray-600 h-2'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">Bitrate:</span>
            <span className="font-mono">{formatBitrate(stats.bitrate)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Packets Lost:</span>
            <span className={`font-mono ${
              stats.packetsLost > 10 ? 'text-red-400' : 
              stats.packetsLost > 5 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {stats.packetsLost}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-400">RTT:</span>
            <span className={`font-mono ${
              stats.rtt > 200 ? 'text-red-400' : 
              stats.rtt > 100 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {stats.rtt}ms
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-400">Jitter:</span>
            <span className={`font-mono ${
              stats.jitter > 50 ? 'text-red-400' : 
              stats.jitter > 25 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {stats.jitter}ms
            </span>
          </div>
        </div>
      </div>

      {/* Quality Recommendations */}
      {quality.level === 'Poor' && (
        <div className="mt-2 p-2 bg-red-900 bg-opacity-50 rounded text-xs">
          <div className="flex items-center space-x-1">
            <span>⚠️</span>
            <span>Poor connection. Try reducing quality or check network.</span>
          </div>
        </div>
      )}

      {stats.packetsLost > 20 && (
        <div className="mt-2 p-2 bg-yellow-900 bg-opacity-50 rounded text-xs">
          <div className="flex items-center space-x-1">
            <span>📶</span>
            <span>High packet loss detected. Check network stability.</span>
          </div>
        </div>
      )}
    </div>
  );
}
