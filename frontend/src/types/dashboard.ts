export interface StreamInfo {
  id: string;
  producerId: string;
  clientId: string;
  deviceName: string;
  customName?: string;
  resolution: { width: number; height: number };
  bitrate: number;
  connectedAt: Date;
  stats?: StreamStats;
}

export interface StreamStats {
  bitrate: number;
  packetsLost: number;
  rtt: number;
  jitter: number;
  frameRate: number;
}

export interface DashboardViewMode {
  mode: 'grid' | 'list';
}

export interface StreamControls {
  onDisconnect: (streamId: string) => void;
  onRename: (streamId: string, name: string) => void;
  onSelect: (streamId: string) => void;
}

export interface StreamCardProps {
  stream: StreamInfo;
  isSelected?: boolean;
  onDisconnect: (streamId: string) => void;
  onRename: (streamId: string, name: string) => void;
  onSelect: (streamId: string) => void;
  className?: string;
}

export interface StreamGridProps {
  streams: StreamInfo[];
  selectedStream: string | null;
  onStreamSelect: (streamId: string) => void;
  onStreamDisconnect: (streamId: string) => void;
  onStreamRename: (streamId: string, name: string) => void;
  className?: string;
}

export interface StreamListProps {
  streams: StreamInfo[];
  selectedStream: string | null;
  onStreamSelect: (streamId: string) => void;
  onStreamDisconnect: (streamId: string) => void;
  onStreamRename: (streamId: string, name: string) => void;
  className?: string;
}

export interface StreamStatsProps {
  stats: StreamStats;
  className?: string;
}

export interface StreamControlsProps {
  stream: StreamInfo;
  onDisconnect: (streamId: string) => void;
  onRename: (streamId: string, name: string) => void;
  className?: string;
}

export interface ViewToggleProps {
  currentMode: 'grid' | 'list';
  onModeChange: (mode: 'grid' | 'list') => void;
  className?: string;
}

