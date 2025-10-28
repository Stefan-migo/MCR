import { create } from 'zustand';
import { WebRTCClient, WebRTCClientConfig, StreamStats } from '../lib/webrtc-client';
import { CameraService, CameraConstraints, CameraQualityPreset } from '../lib/camera-service';

export interface StreamState {
  // Connection state
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  isStreaming: boolean;
  
  // Services
  webrtcClient: WebRTCClient | null;
  cameraService: CameraService | null;
  
  // Stream data
  currentStream: MediaStream | null;
  streamStats: StreamStats | null;
  
  // Camera settings
  cameraConstraints: CameraConstraints | null;
  selectedQualityPreset: CameraQualityPreset;
  
  // UI state
  showControls: boolean;
  isFullscreen: boolean;
  error: string | null;
  
  // Configuration
  serverUrl: string;
  enableAudio: boolean;
  enableVideo: boolean;
  
  // Actions
  initializeServices: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startStreaming: () => Promise<void>;
  stopStreaming: () => Promise<void>;
  switchCamera: () => Promise<void>;
  changeQuality: (preset: CameraQualityPreset) => Promise<void>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleControls: () => void;
  toggleFullscreen: () => void;
  setError: (error: string | null) => void;
  setServerUrl: (url: string) => void;
}

export const useStreamStore = create<StreamState>((set, get) => ({
  // Initial state
  connectionState: 'disconnected',
  isStreaming: false,
  webrtcClient: null,
  cameraService: null,
  currentStream: null,
  streamStats: null,
  cameraConstraints: null,
  selectedQualityPreset: CameraService.QUALITY_PRESETS[1], // Medium quality by default
  showControls: true,
  isFullscreen: false,
  error: null,
  serverUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'https://192.168.100.19:3001',
  enableAudio: true,
  enableVideo: true,

  // Actions
  initializeServices: async () => {
    try {
      const state = get();
      
      // Initialize camera service
      const cameraService = new CameraService();
      await cameraService.initialize();
      
      // Set up camera service callbacks
      cameraService.onStreamChange = (stream) => {
        set({ currentStream: stream });
      };
      
      cameraService.onError = (error) => {
        set({ error: error.message });
      };
      
      cameraService.onPermissionChange = (granted) => {
        if (!granted) {
          set({ error: 'Camera permission denied' });
        }
      };

      // Initialize WebRTC client
      const config: WebRTCClientConfig = {
        serverUrl: state.serverUrl,
        enableAudio: state.enableAudio,
        enableVideo: state.enableVideo
      };
      
      const webrtcClient = new WebRTCClient(config);
      
      // Set up WebRTC client callbacks
      webrtcClient.onConnectionStateChange = (connectionState) => {
        set({ connectionState });
        if (connectionState === 'error') {
          set({ error: 'Connection failed' });
        }
      };
      
      webrtcClient.onStreamingStateChange = (isStreaming) => {
        set({ isStreaming });
      };
      
      webrtcClient.onStatsUpdate = (streamStats) => {
        set({ streamStats });
      };
      
      webrtcClient.onError = (error) => {
        set({ error: error.message });
      };

      // Set up fullscreen change listener
      const handleFullscreenChange = () => {
        const isCurrentlyFullscreen = !!document.fullscreenElement;
        set({ isFullscreen: isCurrentlyFullscreen });
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Safari
      document.addEventListener('mozfullscreenchange', handleFullscreenChange); // Firefox
      document.addEventListener('MSFullscreenChange', handleFullscreenChange); // IE/Edge

      set({ 
        cameraService, 
        webrtcClient,
        error: null 
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  connect: async () => {
    try {
      const { webrtcClient } = get();
      if (!webrtcClient) {
        throw new Error('WebRTC client not initialized');
      }

      set({ error: null });
      await webrtcClient.connect();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  disconnect: async () => {
    try {
      const { webrtcClient, cameraService } = get();
      
      if (webrtcClient) {
        await webrtcClient.disconnect();
      }
      
      if (cameraService) {
        await cameraService.stopCamera();
      }
      
      set({ 
        connectionState: 'disconnected',
        isStreaming: false,
        currentStream: null,
        streamStats: null,
        error: null
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  startStreaming: async () => {
    try {
      const { webrtcClient, cameraService, selectedQualityPreset, enableAudio, enableVideo } = get();
      
      if (!webrtcClient || !cameraService) {
        throw new Error('Services not initialized');
      }

      if (!webrtcClient.connected) {
        throw new Error('Not connected to server');
      }

      set({ error: null });

      // For iOS Safari, request audio permission first if audio is enabled
      if (enableAudio && CameraService.isIOSDevice()) {
        try {
          const audioGranted = await cameraService.requestAudioPermission();
          if (!audioGranted) {
            console.warn('Audio permission denied, continuing with video only');
            set({ enableAudio: false });
          }
        } catch (audioError) {
          console.warn('Audio permission request failed:', audioError);
          set({ enableAudio: false });
        }
      }

      // Start camera with selected quality
      const constraints: Partial<CameraConstraints> = {
        width: selectedQualityPreset.width,
        height: selectedQualityPreset.height,
        frameRate: selectedQualityPreset.frameRate,
        ...CameraService.getOptimalConstraints()
      };

      const stream = await cameraService.startCamera(constraints);
      
      // Modify stream based on settings
      if (!enableVideo) {
        stream.getVideoTracks().forEach(track => track.enabled = false);
      }
      
      if (!enableAudio) {
        stream.getAudioTracks().forEach(track => track.enabled = false);
      }

      // Start WebRTC streaming
      await webrtcClient.startStream(stream);
      
      set({ 
        currentStream: stream,
        cameraConstraints: cameraService.getCurrentConstraints()
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  stopStreaming: async () => {
    try {
      const { webrtcClient, cameraService } = get();
      
      if (webrtcClient) {
        await webrtcClient.stopStream();
      }
      
      if (cameraService) {
        await cameraService.stopCamera();
      }
      
      set({ 
        isStreaming: false,
        currentStream: null,
        streamStats: null
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  switchCamera: async () => {
    try {
      const { cameraService, webrtcClient, currentStream } = get();
      
      if (!cameraService) {
        throw new Error('Camera service not initialized');
      }

      set({ error: null });

      const newStream = await cameraService.toggleCamera();
      
      // If streaming, update the WebRTC stream
      if (webrtcClient && webrtcClient.isStreaming && currentStream) {
        await webrtcClient.stopStream();
        await webrtcClient.startStream(newStream);
      }
      
      set({ 
        currentStream: newStream,
        cameraConstraints: cameraService.getCurrentConstraints()
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setQualityPreset: async (preset: CameraQualityPreset) => {
    try {
      const { cameraService, webrtcClient, currentStream } = get();
      
      if (!cameraService) {
        throw new Error('Camera service not initialized');
      }

      set({ error: null, selectedQualityPreset: preset });

      const newStream = await cameraService.changeQualityPreset(preset);
      
      // If streaming, update the WebRTC stream
      if (webrtcClient && webrtcClient.isStreaming && currentStream) {
        await webrtcClient.stopStream();
        await webrtcClient.startStream(newStream);
      }
      
      set({ 
        currentStream: newStream,
        cameraConstraints: cameraService.getCurrentConstraints()
      });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  toggleAudio: () => {
    const { enableAudio, currentStream } = get();
    const newEnableAudio = !enableAudio;
    
    if (currentStream) {
      currentStream.getAudioTracks().forEach(track => {
        track.enabled = newEnableAudio;
      });
    }
    
    set({ enableAudio: newEnableAudio });
  },

  toggleVideo: () => {
    const { enableVideo, currentStream } = get();
    const newEnableVideo = !enableVideo;
    
    if (currentStream) {
      currentStream.getVideoTracks().forEach(track => {
        track.enabled = newEnableVideo;
      });
    }
    
    set({ enableVideo: newEnableVideo });
  },

  toggleControls: () => {
    set((state) => ({ showControls: !state.showControls }));
  },

  toggleFullscreen: () => {
    const { isFullscreen } = get();
    
    if (!isFullscreen) {
      // Enter fullscreen
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Failed to enter fullscreen:', err);
        });
      }
    } else {
      // Exit fullscreen - check if we're actually in fullscreen first
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(err => {
            console.warn('Failed to exit fullscreen:', err);
            // Fallback: try to update state anyway
            set({ isFullscreen: false });
          });
        }
      } else {
        // Not in fullscreen, just update state
        set({ isFullscreen: false });
        return;
      }
    }
    
    set({ isFullscreen: !isFullscreen });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  setServerUrl: (serverUrl: string) => {
    set({ serverUrl });
  }
}));

export default useStreamStore;
