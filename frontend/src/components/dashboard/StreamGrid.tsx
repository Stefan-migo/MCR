'use client';

import { StreamGridProps } from '../../types/dashboard';
import StreamCard from './StreamCard';

export default function StreamGrid({ 
  streams, 
  selectedStream, 
  onStreamSelect, 
  onStreamDisconnect, 
  onStreamRename, 
  className = '' 
}: StreamGridProps) {
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
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 ${className}`}>
      {streams.map((stream) => (
        <StreamCard
          key={stream.id}
          stream={stream}
          isSelected={selectedStream === stream.id}
          onDisconnect={onStreamDisconnect}
          onRename={onStreamRename}
          onSelect={onStreamSelect}
        />
      ))}
    </div>
  );
}

