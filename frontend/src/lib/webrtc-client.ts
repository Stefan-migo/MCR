import { Device, types } from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';

type Transport = types.Transport;
type Producer = types.Producer;

export interface WebRTCClientConfig {
  serverUrl: string;
  enableAudio: boolean;
  enableVideo: boolean;
}

export interface StreamStats {
  bitrate: number;
  packetsLost: number;
  rtt: number;
  jitter: number;
}

export class WebRTCClient {
  private device: Device | null = null;
  private socket: Socket | null = null;
  private sendTransport: Transport | null = null;
  private videoProducer: Producer | null = null;
  private audioProducer: Producer | null = null;
  private config: WebRTCClientConfig;
  private isConnected = false;
  private isStreaming = false;

  // Event callbacks
  public onConnectionStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  public onStreamingStateChange?: (streaming: boolean) => void;
  public onStatsUpdate?: (stats: StreamStats) => void;
  public onError?: (error: Error) => void;
  public onSetCameraLens?: (data: { lensDeviceId?: string; zoom?: number }) => void;

  constructor(config: WebRTCClientConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      
      this.onConnectionStateChange?.('connecting');

      // Initialize mediasoup device
      this.device = new Device();

      // Connect to signaling server
      this.socket = io(this.config.serverUrl, {
        transports: ['websocket']
      });

      // Set up socket event handlers
      this.setupSocketHandlers();

      // Register device with persistent deviceId
      const deviceId = (typeof window !== 'undefined') ? (localStorage.getItem('mcr_device_id') || `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`) : `dev-${Date.now()}`;
      if (typeof window !== 'undefined' && !localStorage.getItem('mcr_device_id')) {
        localStorage.setItem('mcr_device_id', deviceId);
      }
      // Add timeout to prevent hanging
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Device registration timeout'));
        }, 10000);
        
        this.socket!.emit('register-device', { deviceId }, () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Get router RTP capabilities
      const httpUrl = this.config.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      (window as any).debugLogger?.addLog('info', '🌐 Fetching RTP capabilities', httpUrl);
      const response = await fetch(`${httpUrl}/api/rtp-capabilities`);
      const { rtpCapabilities } = await response.json();
      (window as any).debugLogger?.addLog('success', '✅ RTP capabilities received');

      // Filter codecs for devices with buggy H.264 encoders (e.g., MediaTek Helio G90T)
      // These devices create H.264 producers but send 0 RTP bytes — black video.
      // VP8 works universally and avoids this issue.
      const ua = navigator.userAgent.toLowerCase();
      const hasBuggyH264 = /helio g90|mt6[89]\d\d|redmi|xiaomi.*mediatek/i.test(ua)
        || (typeof localStorage !== 'undefined' && localStorage.getItem('mcr_force_vp8') === 'true');
      if (hasBuggyH264 && rtpCapabilities?.codecs) {
        const before = rtpCapabilities.codecs.length;
        rtpCapabilities.codecs = rtpCapabilities.codecs.filter(
          (c: any) => !c.mimeType?.toLowerCase().includes('h264')
        );
        console.log(`[WebRTC] Filtered H.264 (buggy encoder), codecs: ${before} → ${rtpCapabilities.codecs.length}`);
      }

      // Load device with router capabilities
      (window as any).debugLogger?.addLog('info', '📱 Loading mediasoup device...');
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });

      // Create send transport
      (window as any).debugLogger?.addLog('info', '🚀 Creating send transport...');
      await this.createSendTransport();

      this.isConnected = true;
      (window as any).debugLogger?.addLog('success', '✅ WebRTC Client connected successfully');
      this.onConnectionStateChange?.('connected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      (window as any).debugLogger?.addLog('error', '❌ WebRTC Client connection failed', errorMessage);
      this.onConnectionStateChange?.('error');
      this.onError?.(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.stopStream();

      if (this.sendTransport) {
        this.sendTransport.close();
        this.sendTransport = null;
      }

      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }

      this.device = null;
      this.isConnected = false;
      this.onConnectionStateChange?.('disconnected');
    } catch (error) {
      this.onError?.(error as Error);
    }
  }

  async startStream(stream: MediaStream): Promise<void> {
    if (!this.device || !this.sendTransport || this.isStreaming) {
      throw new Error('Client not ready or already streaming');
    }

    try {
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      // Create video producer
      // Use 3-layer simulcast on supported browsers (Chrome, Firefox, Edge)
      // for adaptive quality selection on the dashboard. iOS Safari does NOT
      // support simulcast — multiple encodings result in only layer 0 being
      // produced. Detect iOS UA and fall back to a single high-bitrate encoding
      // with maintain-resolution degradation preference.
      const isIosSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
        /Safari/i.test(navigator.userAgent) &&
        !/Chrome|CriOS|FxiOS|OPiOS|mercury/i.test(navigator.userAgent);

      if (videoTrack && this.config.enableVideo) {
        this.videoProducer = await this.sendTransport.produce({
          track: videoTrack,
          encodings: isIosSafari
            ? [
                {
                  maxBitrate: 10000000,
                  scaleResolutionDownBy: 1,
                  degradationPreference: 'maintain-resolution'
                }
              ]
            : [
                { scaleResolutionDownBy: 4, maxBitrate: 200000, degradationPreference: 'maintain-resolution' },
                { scaleResolutionDownBy: 2, maxBitrate: 500000, degradationPreference: 'maintain-resolution' },
                { scaleResolutionDownBy: 1, maxBitrate: 4000000, degradationPreference: 'maintain-resolution' },
              ],
          codecOptions: {}
        });

        this.videoProducer.on('transportclose', () => {
          this.videoProducer = null;
        });
      }

      // Create audio producer
      if (audioTrack && this.config.enableAudio) {
        this.audioProducer = await this.sendTransport.produce({
          track: audioTrack,
          codecOptions: {
            opusStereo: true,
            opusDtx: true,
            opusFec: true,
            opusNack: true
          }
        });

        this.audioProducer.on('transportclose', () => {
          this.audioProducer = null;
        });
      }

      this.isStreaming = true;
      this.onStreamingStateChange?.(true);

      // Start stats monitoring
      this.startStatsMonitoring();
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  async stopStream(): Promise<void> {
    try {
      if (this.videoProducer) {
        this.videoProducer.close();
        this.videoProducer = null;
      }

      if (this.audioProducer) {
        this.audioProducer.close();
        this.audioProducer = null;
      }

      // Notify server that device stopped streaming
      if (this.socket) {
        this.socket.emit('stop-stream', {}, (response: any) => {
          if (response?.error) {
            console.error('Failed to notify server of stream stop:', response.error);
          }
        });
      }

      this.isStreaming = false;
      this.onStreamingStateChange?.(false);
    } catch (error) {
      this.onError?.(error as Error);
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      (window as any).debugLogger?.addLog('success', '✅ Socket connected to server');
    });

    this.socket.on('disconnect', () => {
      (window as any).debugLogger?.addLog('warn', '⚠️ Socket disconnected from server');
      this.onConnectionStateChange?.('disconnected');
    });

    this.socket.on('error', (error: Error) => {
      (window as any).debugLogger?.addLog('error', '❌ Socket error', error.message);
      this.onError?.(error);
    });

    this.socket.on('set-camera-lens', (data: { lensDeviceId?: string; zoom?: number }) => {
      console.log('📷 Remote camera lens command received:', data);
      this.onSetCameraLens?.(data);
    });

    // Remote force-VP8 — dashboard operator forces VP8 for buggy H.264 devices
    this.socket.on('force-vp8', () => {
      console.log('[WebRTC] Dashboard forced VP8 — reloading with VP8-only');
      try { localStorage.setItem('mcr_force_vp8', 'true'); } catch {}
      window.location.reload();
    });
  }

  private async createSendTransport(): Promise<void> {
    if (!this.socket || !this.device) {
      throw new Error('Socket or device not initialized');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit('create-transport', { direction: 'send' }, async (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        try {
          this.sendTransport = this.device!.createSendTransport({
            id: response.id,
            iceParameters: response.iceParameters,
            iceCandidates: response.iceCandidates,
            dtlsParameters: response.dtlsParameters
          });

          this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            try {
              this.socket!.emit('connect-transport', {
                transportId: this.sendTransport!.id,
                dtlsParameters
              }, (response: any) => {
                if (response.error) {
                  errback(new Error(response.error));
                } else {
                  callback();
                }
              });
            } catch (error) {
              errback(error as Error);
            }
          });

          this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
            try {
              this.socket!.emit('produce', {
                transportId: this.sendTransport!.id,
                kind,
                rtpParameters
              }, (response: any) => {
                if (response.error) {
                  errback(new Error(response.error));
                } else {
                  callback({ id: response.id });
                }
              });
            } catch (error) {
              errback(error as Error);
            }
          });

          this.sendTransport.on('connectionstatechange', (state) => {
            console.log('Transport connection state:', state);
            if (state === 'failed' || state === 'closed') {
              this.onConnectionStateChange?.('error');
            }
          });

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private startStatsMonitoring(): void {
    if (!this.videoProducer && !this.audioProducer) return;

    const updateStats = async () => {
      try {
        const stats: StreamStats = {
          bitrate: 0,
          packetsLost: 0,
          rtt: 0,
          jitter: 0
        };

        if (this.videoProducer) {
          const videoStats = await this.videoProducer.getStats();
          videoStats.forEach((stat) => {
            if (stat.type === 'outbound-rtp') {
              stats.bitrate += stat.bytesSent * 8 / 1000; // Convert to kbps
              stats.packetsLost += stat.packetsLost || 0;
            }
          });
        }

        if (this.audioProducer) {
          const audioStats = await this.audioProducer.getStats();
          audioStats.forEach((stat) => {
            if (stat.type === 'outbound-rtp') {
              stats.bitrate += stat.bytesSent * 8 / 1000; // Convert to kbps
            }
          });
        }

        this.onStatsUpdate?.(stats);
      } catch (error) {
        console.error('Error getting stats:', error);
      }
    };

    // Update stats every 2 seconds
    const statsInterval = setInterval(() => {
      if (this.isStreaming) {
        updateStats();
      } else {
        clearInterval(statsInterval);
      }
    }, 2000);
  }

  /** Emit camera-lens-changed event to the backend (response to remote lens command). */
  emitCameraLensChanged(data: { deviceId: string; activeLens: string; zoom: number; success: boolean }): void {
    if (this.socket) {
      this.socket.emit('camera-lens-changed', data);
    }
  }

  /** Replace the video track on the active producer — seamless switch without stream restart. */
  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.videoProducer) throw new Error('No active video producer');
    await this.videoProducer.replaceTrack({ track });
  }

  // Getters
  get connected(): boolean {
    return this.isConnected;
  }

  get streaming(): boolean {
    return this.isStreaming;
  }

  get deviceLoaded(): boolean {
    return this.device?.loaded || false;
  }
}

export default WebRTCClient;
