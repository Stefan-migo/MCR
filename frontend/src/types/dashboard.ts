import type { LensInfo, CameraInfo } from '../lib/camera-service';

export type SpatialLayer = 0 | 1 | 2;
export type QualityLabel = 'Low' | 'Medium' | 'High';

export interface StreamQuality {
  spatialLayer: SpatialLayer;
  label: QualityLabel;
}

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
  quality?: StreamQuality;
  cameraInfo?: CameraInfo;
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

export interface NdiDeviceState {
  deviceId: string;
  enabled: boolean;
  ndiSourceName: string | null;
  loading: boolean;
}

export interface ControlModalProps {
  stream: StreamInfo;
  isOpen: boolean;
  onClose: () => void;
  onDisconnect: (streamId: string) => void;
  onRename: (streamId: string, name: string) => void;
  onNdiToggle: (deviceId: string, enabled: boolean, ndiName?: string) => void;
  ndiState: NdiDeviceState | null;
  cameraState?: { lenses: LensInfo[]; activeLens: string | null; zoom: number | null };
  onCameraLensSelect?: (deviceId: string, lensDeviceId: string) => void;
  onCameraZoomChange?: (deviceId: string, zoom: number) => void;
  onForceVp8?: (deviceId: string) => void;
}

export interface ViewToggleProps {
  currentMode: 'grid' | 'list';
  onModeChange: (mode: 'grid' | 'list') => void;
  className?: string;
}

