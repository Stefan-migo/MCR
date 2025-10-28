import { create } from 'zustand';
import { DashboardService, StreamInfo } from '../lib/dashboard-service';

interface DashboardStore {
  // State
  streams: StreamInfo[];
  devices: { deviceId: string; deviceName?: string; isConnected: boolean; isStreaming: boolean; streamId?: string | null; lastSeenAt: number }[];
  viewMode: 'grid' | 'list';
  selectedStream: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  dashboardService: DashboardService | null;

  // Actions
  setViewMode: (mode: 'grid' | 'list') => void;
  setSelectedStream: (streamId: string | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;

  // Stream management
  addStream: (stream: StreamInfo) => void;
  removeStream: (streamId: string) => void;
  updateStream: (streamId: string, updates: Partial<StreamInfo>) => void;
  updateStreamStats: (streamId: string, stats: StreamInfo['stats']) => void;
  setStreams: (streams: StreamInfo[]) => void;

  // Device management
  upsertDevice: (device: { deviceId: string; deviceName?: string }) => void;
  markDeviceDisconnected: (deviceId: string) => void;
  removeDevice: (deviceId: string) => void;
  updateDeviceStreaming: (deviceId: string, isStreaming: boolean, streamId?: string | null) => void;

  // Service management
  initializeService: (serverUrl: string) => Promise<void>;
  disconnectService: () => Promise<void>;

  // API calls
  refreshStreams: () => Promise<void>;
  updateStreamName: (streamId: string, name: string) => Promise<void>;
  disconnectStream: (streamId: string) => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  // Initial state
  streams: [],
  devices: [],
  viewMode: 'grid',
  selectedStream: null,
  isConnected: false,
  isLoading: false,
  error: null,
  dashboardService: null,

  // Basic actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedStream: (streamId) => set({ selectedStream: streamId }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ isLoading: loading }),

  // Stream management
  addStream: (stream) => set((state) => {
    // Check if we already have a stream from the same device
    // For now, we'll limit to 3 streams max to prevent too many cards
    const existingStreams = state.streams.filter(s => s.id !== stream.id);
    
    if (existingStreams.length >= 3) {
      // Remove the oldest stream if we have too many
      const sortedStreams = existingStreams.sort((a, b) => 
        new Date(a.connectedAt).getTime() - new Date(b.connectedAt).getTime()
      );
      sortedStreams.shift(); // Remove the oldest
      return { streams: [...sortedStreams, stream] };
    }
    
    return { streams: [...existingStreams, stream] };
  }),

  removeStream: (streamId) => set((state) => ({
    streams: state.streams.filter(s => s.id !== streamId),
    selectedStream: state.selectedStream === streamId ? null : state.selectedStream
  })),

  updateStream: (streamId, updates) => set((state) => ({
    streams: state.streams.map(s => 
      s.id === streamId ? { ...s, ...updates } : s
    )
  })),

  updateStreamStats: (streamId, stats) => set((state) => ({
    streams: state.streams.map(s => 
      s.id === streamId ? { ...s, stats } : s
    )
  })),

  setStreams: (streams) => set({ streams }),

  // Device management
  upsertDevice: (device) => set((state) => {
    const now = Date.now();
    const existing = state.devices.find(d => d.deviceId === device.deviceId);
    if (existing) {
      return {
        devices: state.devices.map(d => d.deviceId === device.deviceId ? { ...d, deviceName: device.deviceName || d.deviceName, isConnected: true, lastSeenAt: now } : d)
      };
    }
    return {
      devices: [...state.devices, { deviceId: device.deviceId, deviceName: device.deviceName, isConnected: true, isStreaming: false, streamId: null, lastSeenAt: now }]
    };
  }),
  markDeviceDisconnected: (deviceId) => set((state) => ({
    devices: state.devices.map(d => d.deviceId === deviceId ? { ...d, isConnected: false } : d)
  })),
  removeDevice: (deviceId) => set((state) => ({
    devices: state.devices.filter(d => d.deviceId !== deviceId),
    streams: state.streams.filter(s => (s as any).deviceId !== deviceId)
  })),
  updateDeviceStreaming: (deviceId, isStreaming, streamId) => set((state) => ({
    devices: state.devices.map(d => 
      d.deviceId === deviceId 
        ? { ...d, isStreaming, streamId, lastSeenAt: Date.now() }
        : d
    )
  })),

  // Service management
  initializeService: async (serverUrl) => {
    try {
      set({ isLoading: true, error: null });
      
      const service = new DashboardService(serverUrl);
      
      // Set up event handlers
      service.onConnectionStateChange = (connected) => {
        set({ isConnected: connected });
      };

      service.onStreamStarted = (stream) => {
        const deviceId = (stream as any).deviceId as string | undefined;
        if (deviceId) {
          set((state) => ({
            devices: state.devices.map(d => d.deviceId === deviceId ? { ...d, isStreaming: true, streamId: stream.id, lastSeenAt: Date.now(), isConnected: true } : d)
          }));
        }
        get().addStream(stream);
      };

      service.onStreamUpdated = (stream) => {
        get().updateStream(stream.id, stream);
      };

      service.onStreamEnded = (streamId) => {
        const s = get().streams.find(x => x.id === streamId) as any;
        const deviceId = s?.deviceId as string | undefined;
        if (deviceId) {
          set((state) => ({
            devices: state.devices.map(d => d.deviceId === deviceId ? { ...d, isStreaming: false, streamId: null } : d)
          }));
        }
        get().removeStream(streamId);
      };

      // Device presence
      service.onDeviceConnected = (device) => {
        get().upsertDevice(device);
      };
      service.onDeviceDisconnected = (deviceId) => {
        get().markDeviceDisconnected(deviceId);
      };
      service.onDeviceRemoved = (deviceId) => {
        get().removeDevice(deviceId);
      };
      service.onDeviceStreamingChanged = (data) => {
        get().updateDeviceStreaming(data.deviceId, data.isStreaming, data.streamId);
      };

      service.onStreamNameUpdated = (streamId, name) => {
        get().updateStream(streamId, { customName: name });
      };

      service.onStatsUpdate = (streams) => {
        streams.forEach(stream => {
          if (stream.stats) {
            get().updateStreamStats(stream.id, stream.stats);
          }
        });
      };

      service.onError = (error) => {
        set({ error: error.message });
      };

      await service.connect();
      
      set({ dashboardService: service, isLoading: false });
      
      // Load initial streams
      await get().refreshStreams();
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to initialize dashboard service',
        isLoading: false 
      });
    }
  },

  disconnectService: async () => {
    const { dashboardService } = get();
    if (dashboardService) {
      await dashboardService.disconnect();
      set({ 
        dashboardService: null, 
        isConnected: false,
        streams: [],
        selectedStream: null
      });
    }
  },

  // API calls
  refreshStreams: async () => {
    const { dashboardService } = get();
    if (!dashboardService) return;

    try {
      set({ isLoading: true });
      const streams = await dashboardService.getActiveStreams();
      set({ streams, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to refresh streams',
        isLoading: false 
      });
    }
  },

  updateStreamName: async (streamId, name) => {
    const { dashboardService } = get();
    if (!dashboardService) return;

    try {
      await dashboardService.updateStreamName(streamId, name);
      get().updateStream(streamId, { customName: name });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update stream name'
      });
    }
  },

  disconnectStream: async (streamId) => {
    const { dashboardService } = get();
    if (!dashboardService) return;

    try {
      await dashboardService.disconnectStream(streamId);
      get().removeStream(streamId);
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to disconnect stream'
      });
    }
  },
}));

export default useDashboardStore;

