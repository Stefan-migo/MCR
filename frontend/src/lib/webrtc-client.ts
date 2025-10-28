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

      // Get router RTP capabilities
      const response = await fetch(`${this.config.serverUrl}/api/rtp-capabilities`);
      const { rtpCapabilities } = await response.json();

      // Load device with router capabilities
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });

      // Create send transport
      await this.createSendTransport();

      this.isConnected = true;
      this.onConnectionStateChange?.('connected');
    } catch (error) {
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
      if (videoTrack && this.config.enableVideo) {
        this.videoProducer = await this.sendTransport.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 1000000, scaleResolutionDownBy: 1 },
            { maxBitrate: 500000, scaleResolutionDownBy: 2 },
            { maxBitrate: 200000, scaleResolutionDownBy: 4 }
          ],
          codecOptions: {
            videoGoogleStartBitrate: 1000
          }
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

      this.isStreaming = false;
      this.onStreamingStateChange?.(false);
    } catch (error) {
      this.onError?.(error as Error);
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.onConnectionStateChange?.('disconnected');
    });

    this.socket.on('error', (error: Error) => {
      console.error('Socket error:', error);
      this.onError?.(error);
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
