import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';
import { mediasoupConfig } from './config';

export interface StreamInfo {
  id: string;
  producerId: string;
  clientId: string;
  deviceName: string;
  resolution: { width: number; height: number };
  bitrate: number;
  connectedAt: Date;
  customName?: string;
  stats?: {
    bitrate: number;
    packetsLost: number;
    rtt: number;
    jitter: number;
    frameRate: number;
  };
}

export class MediasoupRouter {
  private worker: mediasoupTypes.Worker | null = null;
  private router: mediasoupTypes.Router | null = null;
  public transports: Map<string, mediasoupTypes.WebRtcTransport | mediasoupTypes.PlainTransport> = new Map();
  private producers: Map<string, mediasoupTypes.Producer> = new Map();
  private consumers: Map<string, mediasoupTypes.Consumer> = new Map();
  private streamMetadata: Map<string, StreamInfo> = new Map();

  async initialize(): Promise<void> {
    try {
      this.worker = await mediasoup.createWorker({
        ...mediasoupConfig.worker,
        appData: { roomId: 'main-room' }
      });

      this.router = await this.worker.createRouter({
        mediaCodecs: mediasoupConfig.router.mediaCodecs
      });

      console.log('✅ Mediasoup router initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Mediasoup router:', error);
      throw error;
    }
  }

  async createWebRtcTransport(): Promise<mediasoupTypes.WebRtcTransport> {
    if (!this.router) {
      throw new Error('Router not initialized');
    }

    const transport = await this.router.createWebRtcTransport({
      ...mediasoupConfig.webRtcTransport,
      appData: { clientId: `client-${Date.now()}` }
    });

    this.transports.set(transport.id, transport);
    return transport;
  }

  async createPlainTransport(): Promise<mediasoupTypes.PlainTransport> {
    if (!this.router) {
      throw new Error('Router not initialized');
    }

    const transport = await this.router.createPlainTransport({
      ...mediasoupConfig.plainTransport,
      appData: { clientId: `ndi-bridge-${Date.now()}` }
    });

    this.transports.set(transport.id, transport);
    return transport;
  }

  async createProducer(transportId: string, kind: 'audio' | 'video', rtpParameters: any): Promise<mediasoupTypes.Producer> {
    if (!this.router) {
      throw new Error('Router not initialized');
    }

    const transport = this.transports.get(transportId);
    if (!transport || !('produce' in transport)) {
      throw new Error('Transport not found or not a WebRTC transport');
    }

    // Use transport ID as stable client identifier
    const clientId = transport.id;
    
    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { clientId: clientId }
    });

    this.producers.set(producer.id, producer);

    // Create stream metadata for video producers
    if (kind === 'video') {
      // Check if we already have a stream for this client
      let existingStream = Array.from(this.streamMetadata.values()).find(s => s.clientId === clientId);
      
      if (existingStream) {
        // Update existing stream with new producer
        existingStream.producerId = producer.id;
        existingStream.connectedAt = new Date(); // Update connection time
        
        // Extract resolution from RTP parameters if available
        if (rtpParameters.encodings && rtpParameters.encodings[0]) {
          const encoding = rtpParameters.encodings[0];
          if (encoding.scaleResolutionDownBy) {
            existingStream.resolution.width = Math.floor(1280 / encoding.scaleResolutionDownBy);
            existingStream.resolution.height = Math.floor(720 / encoding.scaleResolutionDownBy);
          }
          if (encoding.maxBitrate) {
            existingStream.bitrate = encoding.maxBitrate;
          }
        }
        
        // Update stats
        if (existingStream.stats) {
          existingStream.stats.bitrate = 0;
          existingStream.stats.packetsLost = 0;
          existingStream.stats.rtt = 0;
          existingStream.stats.jitter = 0;
          existingStream.stats.frameRate = 30;
        }
        
        console.log(`🔄 Updated existing stream for client ${clientId}`);
      } else {
        // Create new stream for new client
        const streamId = `stream-${clientId}-${Date.now()}`;
        const streamInfo: StreamInfo = {
          id: streamId,
          producerId: producer.id,
          clientId: clientId,
          deviceName: `Device ${clientId.slice(-4)}`,
          resolution: { width: 1280, height: 720 }, // Default, will be updated from RTP parameters
          bitrate: 1000000, // Default 1Mbps
          connectedAt: new Date(),
          stats: {
            bitrate: 0,
            packetsLost: 0,
            rtt: 0,
            jitter: 0,
            frameRate: 30
          }
        };

        // Extract resolution from RTP parameters if available
        if (rtpParameters.encodings && rtpParameters.encodings[0]) {
          const encoding = rtpParameters.encodings[0];
          if (encoding.scaleResolutionDownBy) {
            streamInfo.resolution.width = Math.floor(1280 / encoding.scaleResolutionDownBy);
            streamInfo.resolution.height = Math.floor(720 / encoding.scaleResolutionDownBy);
          }
          if (encoding.maxBitrate) {
            streamInfo.bitrate = encoding.maxBitrate;
          }
        }

        this.streamMetadata.set(streamId, streamInfo);
        console.log(`🆕 Created new stream for client ${clientId}`);
      }
    }

    return producer;
  }

  async createConsumer(transportId: string, producerId: string, rtpCapabilities: any): Promise<mediasoupTypes.Consumer> {
    if (!this.router) {
      throw new Error('Router not initialized');
    }

    const transport = this.transports.get(transportId);
    if (!transport || !('consume' in transport)) {
      throw new Error('Transport not found or not a WebRTC transport');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
      appData: { clientId: transport.appData.clientId }
    });

    this.consumers.set(consumer.id, consumer);
    return consumer;
  }

  getRouterCapabilities() {
    if (!this.router) {
      throw new Error('Router not initialized');
    }
    return this.router.rtpCapabilities;
  }

  getProducer(producerId: string): mediasoupTypes.Producer | undefined {
    return this.producers.get(producerId);
  }

  getConsumer(consumerId: string): mediasoupTypes.Consumer | undefined {
    return this.consumers.get(consumerId);
  }

  // Stream management methods
  getActiveStreams(): StreamInfo[] {
    return Array.from(this.streamMetadata.values());
  }

  getStreamById(streamId: string): StreamInfo | undefined {
    return this.streamMetadata.get(streamId);
  }

  getStreamByClientId(clientId: string): StreamInfo | undefined {
    return Array.from(this.streamMetadata.values()).find(s => s.clientId === clientId);
  }

  updateStreamName(streamId: string, name: string): boolean {
    const stream = this.streamMetadata.get(streamId);
    if (stream) {
      stream.customName = name;
      return true;
    }
    return false;
  }

  async disconnectStream(streamId: string): Promise<boolean> {
    const stream = this.streamMetadata.get(streamId);
    if (!stream) {
      return false;
    }

    try {
      // Close the producer
      const producer = this.producers.get(stream.producerId);
      if (producer) {
        producer.close();
        this.producers.delete(stream.producerId);
      }

      // Find and close the transport
      const transport = Array.from(this.transports.values()).find(
        t => (t.appData?.clientId as string) === stream.clientId
      );
      if (transport) {
        transport.close();
        this.transports.delete(transport.id);
      }

      // Remove stream metadata
      this.streamMetadata.delete(streamId);
      return true;
    } catch (error) {
      console.error('Error disconnecting stream:', error);
      return false;
    }
  }

  // Method to handle producer close events (when devices disconnect)
  handleProducerClosed(producerId: string): void {
    const stream = Array.from(this.streamMetadata.values()).find(s => s.producerId === producerId);
    if (stream) {
      console.log(`🔌 Stream disconnected: ${stream.id} (client: ${stream.clientId})`);
      this.streamMetadata.delete(stream.id);
      
      // Also clean up the producer
      this.producers.delete(producerId);
      
      // Find and clean up the transport
      const transport = Array.from(this.transports.values()).find(
        t => (t.appData?.clientId as string) === stream.clientId
      );
      if (transport) {
        this.transports.delete(transport.id);
      }
    }
  }

  updateStreamStats(streamId: string, stats: Partial<StreamInfo['stats']>): boolean {
    const stream = this.streamMetadata.get(streamId);
    if (stream && stream.stats) {
      Object.assign(stream.stats, stats);
      return true;
    }
    return false;
  }

  async close(): Promise<void> {
    if (this.worker) {
      this.worker.close();
      this.worker = null;
    }
    this.router = null;
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
    this.streamMetadata.clear();
  }
}

export default MediasoupRouter;

