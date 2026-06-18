import { create } from 'zustand';
import { DashboardService, StreamInfo } from '../lib/dashboard-service';
import type { SpatialLayer, NdiDeviceState } from '../types/dashboard';
import type { LensInfo } from '../lib/camera-service';

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

  // NDI control
  ndiStates: Record<string, NdiDeviceState>;
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string | null) => void;
  setNdiState: (deviceId: string, state: Partial<NdiDeviceState>) => void;
  setNdiControl: (deviceId: string, enabled: boolean, ndiName?: string) => void;
  updateNdiControlState: (deviceId: string, state: { enabled: boolean; active: boolean; ndiName: string | null }) => void;

  // Camera lens control
  cameraControlState: Record<string, { lenses: LensInfo[]; activeLens: string | null; zoom: number | null }>;
  setCameraLens: (deviceId: string, params: { lensDeviceId?: string; zoom?: number }) => void;
  forceVp8: (deviceId: string) => void;
  updateCameraControlState: (deviceId: string, state: { activeLens: string; zoom: number; success: boolean }) => void;
  setStreamCameraInfo: (deviceId: string, cameraInfo: { lenses: LensInfo[]; activeLens: string | null; zoom: number | null }) => void;

  // Quality
  setStreamQuality: (producerId: string, spatialLayer: SpatialLayer) => void;

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
  ndiStates: {},
  cameraControlState: {},
  selectedDeviceId: null,

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
  removeDevice: (deviceId) => set((state) => {
    const { [deviceId]: _, ...rest } = state.cameraControlState;
    return {
      devices: state.devices.filter(d => d.deviceId !== deviceId),
      streams: state.streams.filter(s => (s as any).deviceId !== deviceId),
      cameraControlState: rest,
    };
  }),
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
          // Initialize camera control state from stream-started payload
          if ((stream as any).cameraInfo) {
            get().setStreamCameraInfo(deviceId, (stream as any).cameraInfo);
          }
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

      service.onStreamQualityChanged = (data) => {
        const stream = get().streams.find(s => s.producerId === data.producerId);
        if (stream) {
          const qualityLabels = ['Low', 'Medium', 'High'] as const;
          get().updateStream(stream.id, {
            ...stream,
            quality: { spatialLayer: data.spatialLayer as 0 | 1 | 2, label: qualityLabels[data.spatialLayer] }
          } as any);
        }
      };

      service.onStatsUpdate = (streams) => {
        streams.forEach(stream => {
          if (stream.stats) {
            get().updateStreamStats(stream.id, stream.stats);
          }
        });
      };

      service.onNdiControlUpdated = (data) => {
        get().updateNdiControlState(data.deviceId, {
          enabled: data.enabled,
          active: data.enabled,
          ndiName: data.ndiSourceName,
        });
      };

      service.onCameraLensChanged = (data) => {
        get().updateCameraControlState(data.deviceId, data);
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
        selectedStream: null,
        ndiStates: {},
        cameraControlState: {},
        selectedDeviceId: null,
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

  // NDI control
  selectDevice: (deviceId) => set({ selectedDeviceId: deviceId }),
  setNdiState: (deviceId, state) => set((prev) => ({
    ndiStates: {
      ...prev.ndiStates,
      [deviceId]: { deviceId, ...prev.ndiStates[deviceId], ...state } as NdiDeviceState,
    },
  })),
  setNdiControl: async (deviceId, enabled, ndiName) => {
    const { dashboardService } = get();
    if (!dashboardService) return;
    // Optimistic update
    get().setNdiState(deviceId, { enabled, loading: true });
    const result = await dashboardService.setNdiControl(deviceId, enabled, ndiName);
    if (!result.success) {
      // Revert optimistic update on backend validation failure
      get().setNdiState(deviceId, { enabled: !enabled, loading: false });
      set({ error: result.error || 'Failed to set NDI control' });
    }
  },
  updateNdiControlState: (deviceId, state) => set((prev) => ({
    ndiStates: {
      ...prev.ndiStates,
      [deviceId]: {
        deviceId,
        enabled: state.active,
        ndiSourceName: state.ndiName || prev.ndiStates[deviceId]?.ndiSourceName || null,
        loading: false,
      } as NdiDeviceState,
    },
  })),

  // Camera lens control
  setCameraLens: async (deviceId, params) => {
    const { dashboardService, cameraControlState } = get();
    if (!dashboardService) return;

    // Optimistic update
    const current = cameraControlState[deviceId];
    if (current) {
      const optimistic: Partial<{ activeLens: string | null; zoom: number | null }> = {};
      if (params.lensDeviceId) optimistic.activeLens = params.lensDeviceId;
      if (params.zoom !== undefined) optimistic.zoom = params.zoom;
      set((state) => ({
        cameraControlState: {
          ...state.cameraControlState,
          [deviceId]: { ...current, ...optimistic },
        },
      }));
    }

    const result = await dashboardService.setCameraLens(deviceId, params);
    if (!result.success && current) {
      // Revert optimistic update on backend failure
      set((state) => ({
        cameraControlState: {
          ...state.cameraControlState,
          [deviceId]: current,
        },
      }));
    }
  },
  forceVp8: (deviceId) => {
    const { dashboardService } = get();
    if (dashboardService) {
      dashboardService.forceVp8(deviceId);
    }
  },
  updateCameraControlState: (deviceId, state) => set((prev) => ({
    cameraControlState: {
      ...prev.cameraControlState,
      [deviceId]: {
        lenses: prev.cameraControlState[deviceId]?.lenses || [],
        activeLens: state.activeLens,
        zoom: state.zoom,
      },
    },
  })),
  setStreamCameraInfo: (deviceId, cameraInfo) => set((prev) => ({
    cameraControlState: {
      ...prev.cameraControlState,
      [deviceId]: {
        lenses: cameraInfo.lenses,
        activeLens: cameraInfo.activeLens,
        zoom: cameraInfo.zoom,
      },
    },
  })),

  // Quality
  setStreamQuality: (producerId, spatialLayer) => {
    const { dashboardService, streams } = get();
    if (!dashboardService) return;

    const qualityLabels = ['Low', 'Medium', 'High'] as const;
    const stream = streams.find(s => s.producerId === producerId);
    if (stream) {
      const existingQuality = (stream as any).quality as { spatialLayer: number } | undefined;
      if (existingQuality?.spatialLayer === spatialLayer) return;
      get().updateStream(stream.id, {
        ...stream,
        quality: { spatialLayer: spatialLayer as 0 | 1 | 2, label: qualityLabels[spatialLayer] }
      } as any);
    }

    dashboardService.setStreamQuality(producerId, spatialLayer);
  },
}));

export default useDashboardStore;

