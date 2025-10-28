'use client';

import { StreamStatsProps } from '../../types/dashboard';

export default function StreamStats({ stats, className = '' }: StreamStatsProps) {
  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(1)} Mbps`;
    }
    return `${(bitrate / 1000).toFixed(0)} Kbps`;
  };

  const formatLatency = (ms: number) => `${ms}ms`;

  const getQualityColor = (bitrate: number) => {
    if (bitrate >= 1500000) return 'text-green-400';
    if (bitrate >= 800000) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getLatencyColor = (rtt: number) => {
    if (rtt <= 50) return 'text-green-400';
    if (rtt <= 100) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-white mb-3">Stream Statistics</h3>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-400 mb-1">Bitrate</div>
          <div className={`font-mono ${getQualityColor(stats.bitrate)}`}>
            {formatBitrate(stats.bitrate)}
          </div>
        </div>
        
        <div>
          <div className="text-gray-400 mb-1">Frame Rate</div>
          <div className="text-white font-mono">
            {stats.frameRate} fps
          </div>
        </div>
        
        <div>
          <div className="text-gray-400 mb-1">Latency</div>
          <div className={`font-mono ${getLatencyColor(stats.rtt)}`}>
            {formatLatency(stats.rtt)}
          </div>
        </div>
        
        <div>
          <div className="text-gray-400 mb-1">Packet Loss</div>
          <div className={`font-mono ${stats.packetsLost === 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.packetsLost} pkts
          </div>
        </div>
        
        <div>
          <div className="text-gray-400 mb-1">Jitter</div>
          <div className="text-white font-mono">
            {formatLatency(stats.jitter)}
          </div>
        </div>
        
        <div>
          <div className="text-gray-400 mb-1">Quality</div>
          <div className={`font-semibold ${getQualityColor(stats.bitrate)}`}>
            {stats.bitrate >= 1500000 ? 'High' : stats.bitrate >= 800000 ? 'Medium' : 'Low'}
          </div>
        </div>
      </div>
    </div>
  );
}

