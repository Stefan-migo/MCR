import { io, Socket } from 'socket.io-client';

export interface StreamInfo {
  id: string;
  producerId: string;
  clientId: string;
  deviceName: string;
  customName?: string;
  resolution: { width: number; height: number };
  bitrate: number;
  connectedAt: Date;
  stats?: {
    bitrate: number;
    packetsLost: number;
    rtt: number;
    jitter: number;
    frameRate: number;
  };
}

export interface StreamStats {
  bitrate: number;
  packetsLost: number;
  rtt: number;
  jitter: number;
  frameRate: number;
}

export class DashboardService {
  private socket: Socket | null = null;
  private serverUrl: string;
  private isConnected = false;

  // Event callbacks
  public onConnectionStateChange?: (connected: boolean) => void;
  public onStreamsUpdate?: (streams: StreamInfo[]) => void;
  public onStreamStarted?: (stream: StreamInfo) => void;
  public onStreamUpdated?: (stream: StreamInfo) => void;
  public onStreamEnded?: (streamId: string) => void;
  public onDeviceConnected?: (device: { deviceId: string; deviceName?: string }) => void;
  public onDeviceDisconnected?: (deviceId: string) => void;
  public onDeviceRemoved?: (deviceId: string) => void;
  public onDeviceStreamingChanged?: (data: { deviceId: string; isStreaming: boolean; streamId?: string | null }) => void;
  public onStreamNameUpdated?: (streamId: string, name: string) => void;
  public onStatsUpdate?: (streams: StreamInfo[]) => void;
  public onError?: (error: Error) => void;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  async connect(): Promise<void> {
    try {
      this.socket = io(this.serverUrl, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 30000,
        forceNew: true
      });

      this.setupSocketHandlers();
      
      // Don't set connected to true here - wait for the 'connect' event
    } catch (error) {
      console.error('Dashboard service connection error:', error);
      this.onError?.(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.onConnectionStateChange?.(false);
  }

  // REST API methods
  async getActiveStreams(): Promise<StreamInfo[]> {
    try {
      // Convert WebSocket URL to HTTP URL for REST API calls
      const httpUrl = this.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${httpUrl}/api/streams`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.streams || [];
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  async getStreamById(streamId: string): Promise<StreamInfo> {
    try {
      const httpUrl = this.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${httpUrl}/api/streams/${streamId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.stream;
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  async updateStreamName(streamId: string, name: string): Promise<boolean> {
    try {
      const httpUrl = this.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${httpUrl}/api/streams/${streamId}/name`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return true;
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  async disconnectStream(streamId: string): Promise<boolean> {
    try {
      const httpUrl = this.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${httpUrl}/api/streams/${streamId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return true;
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  async getStreamStats(streamId: string): Promise<StreamStats> {
    try {
      const httpUrl = this.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(`${httpUrl}/api/streams/${streamId}/stats`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.stats;
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  // Socket.io methods
  requestActiveStreams(): void {
    if (this.socket) {
      this.socket.emit('get-active-streams');
    }
  }

  updateStreamNameViaSocket(streamId: string, name: string): void {
    if (this.socket) {
      this.socket.emit('update-stream-name', { streamId, name });
    }
  }

  disconnectStreamViaSocket(streamId: string): void {
    if (this.socket) {
      this.socket.emit('disconnect-stream', { streamId });
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Dashboard socket connected to:', this.serverUrl);
      this.isConnected = true;
      this.onConnectionStateChange?.(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Dashboard socket disconnected:', reason);
      this.isConnected = false;
      this.onConnectionStateChange?.(false);
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('🚫 Dashboard socket connection error:', error.message);
      console.error('🔗 Attempting to connect to:', this.serverUrl);
      this.isConnected = false;
      this.onConnectionStateChange?.(false);
      this.onError?.(error);
    });

    this.socket.on('reconnect', (attemptNumber: number) => {
      console.log(`🔄 Dashboard socket reconnected after ${attemptNumber} attempts`);
      this.isConnected = true;
      this.onConnectionStateChange?.(true);
    });

    this.socket.on('reconnect_error', (error: Error) => {
      console.error('🔄 Dashboard socket reconnection error:', error.message);
      this.onError?.(error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('💥 Dashboard socket reconnection failed');
      this.isConnected = false;
      this.onConnectionStateChange?.(false);
    });

    this.socket.on('stream-started', (data: { stream: StreamInfo }) => {
      console.log('New stream started:', data.stream);
      this.onStreamStarted?.(data.stream);
    });

    this.socket.on('stream-updated', (data: { stream: StreamInfo }) => {
      console.log('Stream updated:', data.stream);
      this.onStreamUpdated?.(data.stream);
    });

    this.socket.on('stream-ended', (data: { streamId: string }) => {
      console.log('Stream ended:', data.streamId);
      this.onStreamEnded?.(data.streamId);
    });

    // Device presence events
    this.socket.on('device-connected', (data: { deviceId: string; deviceName?: string }) => {
      console.log('Device connected:', data.deviceId);
      this.onDeviceConnected?.(data);
    });
    this.socket.on('device-disconnected', (data: { deviceId: string }) => {
      console.log('Device disconnected:', data.deviceId);
      this.onDeviceDisconnected?.(data.deviceId);
    });
    this.socket.on('device-removed', (data: { deviceId: string }) => {
      console.log('Device removed:', data.deviceId);
      this.onDeviceRemoved?.(data.deviceId);
    });
    this.socket.on('device-streaming-changed', (data: { deviceId: string; isStreaming: boolean; streamId?: string | null }) => {
      console.log('Device streaming changed:', data);
      this.onDeviceStreamingChanged?.(data);
    });

    this.socket.on('stream-name-updated', (data: { streamId: string; name: string }) => {
      console.log('Stream name updated:', data.streamId, data.name);
      this.onStreamNameUpdated?.(data.streamId, data.name);
    });

    this.socket.on('stream-stats-update', (data: { streams: StreamInfo[] }) => {
      this.onStatsUpdate?.(data.streams);
    });

    this.socket.on('get-active-streams', (data: { streams: StreamInfo[] }) => {
      this.onStreamsUpdate?.(data.streams);
    });
  }

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }
}

export default DashboardService;


