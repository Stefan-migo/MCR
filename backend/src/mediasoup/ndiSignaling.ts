import { Server, Socket } from 'socket.io';
import { MediasoupRouter } from './router';
import { NdiBridgeConfig } from './config';
import { types as mediasoupTypes } from 'mediasoup';
import * as dgram from 'dgram';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface RtpStreamInfo {
  producerId: string;
  codec: {
    mimeType: string;
    payloadType: number;
    clockRate: number;
    channels?: number;
    parameters?: any;
  };
  rtpEndpoint: {
    ip: string;
    port: number;
  };
}

export interface BridgeSession {
  socketId: string;
  socket: Socket;
  plainTransports: Map<string, {
    transport: mediasoupTypes.PlainTransport;
    producerId: string;
    rtpPort: number;
    codec: {
      mimeType: string;
      clockRate: number;
      payloadType: number;
      channels?: number;
      parameters?: any;
    };
  }>;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// NdiSignaling class
// ---------------------------------------------------------------------------

export class NdiSignaling {
  private io: Server;
  private router: MediasoupRouter;
  private config: NdiBridgeConfig;
  private bridgeSessions: Map<string, BridgeSession>;

  constructor(io: Server, router: MediasoupRouter, config: NdiBridgeConfig) {
    this.io = io;
    this.router = router;
    this.config = config;
    this.bridgeSessions = new Map();
  }

  // -----------------------------------------------------------------------
  // Public: Init — register namespace + subscribe to router events
  // -----------------------------------------------------------------------

  init(): void {
    const namespace = this.io.of('/ndi-bridge');

    // Auth middleware placeholder (accept all for now)
    namespace.use((_socket, next) => {
      next();
    });

    namespace.on('connection', (socket: Socket) => {
      return this.handleConnection(socket).catch((error) => {
        console.error('[NDI] Error in bridge connection handler:', error);
      });
    });

    // Subscribe to router producer lifecycle events
    this.router.on('new-producer', (producer: mediasoupTypes.Producer) => {
      return this.onNewProducer(producer).catch((error) => {
        console.error('[NDI] Error handling new producer:', error);
      });
    });

    this.router.on('producer-closed', (producerId: string) => {
      return this.onProducerClosed(producerId).catch((error) => {
        console.error('[NDI] Error handling producer closed:', error);
      });
    });
  }

  // -----------------------------------------------------------------------
  // Public: Session accessors
  // -----------------------------------------------------------------------

  getBridgeSession(socketId: string): BridgeSession | undefined {
    return this.bridgeSessions.get(socketId);
  }

  removeBridgeSession(socketId: string): void {
    this.bridgeSessions.delete(socketId);
  }

  // -----------------------------------------------------------------------
  // Private: Connection handler
  // -----------------------------------------------------------------------

  private async handleConnection(socket: Socket): Promise<void> {
    console.log(`[NDI] Bridge connected: ${socket.id}`);

    const session: BridgeSession = {
      socketId: socket.id,
      socket,
      plainTransports: new Map(),
      createdAt: new Date(),
    };
    this.bridgeSessions.set(socket.id, session);

    // Discover existing video producers and create PlainTransports
    const videoProducers = this.router.getVideoProducers();
    const streams: RtpStreamInfo[] = [];

    for (const producer of videoProducers) {
      try {
        const result = await this.createBridgePlainTransport(producer);
        session.plainTransports.set(producer.id, {
          transport: result.transport,
          producerId: producer.id,
          rtpPort: result.rtpPort,
          codec: result.codec,
        });
        streams.push({
          producerId: producer.id,
          codec: result.codec,
          rtpEndpoint: { ip: result.ip, port: result.rtpPort },
        });
      } catch (error: any) {
        console.error(`[NDI] Failed to create PlainTransport for producer ${producer.id}:`, error);
        socket.emit('error', {
          code: 'PORT_EXHAUSTION',
          message: error.message || 'Failed to create transport',
        });
      }
    }

    socket.emit('active-streams', { streams });

    // Handle consume-stream (bridge requests a Consumer)
    socket.on('consume-stream', async ({ producerId, rtpPort, rtpIp }: { producerId: string, rtpPort?: number, rtpIp?: string }) => {
      try {
        const entry = session.plainTransports.get(producerId);
        if (!entry) {
          socket.emit('consumer-error', { producerId, error: 'transport not found' });
          return;
        }

        const producer = this.router.getProducer(producerId);
        if (!producer) {
          socket.emit('consumer-error', { producerId, error: 'producer not found' });
          return;
        }

        // Connect the PlainTransport to the bridge's RTP endpoint.
        // With rtcpMux enabled, a single port handles both RTP and RTCP.
        const bridgeIp = rtpIp || '127.0.0.1';
        const remotePort = rtpPort ?? entry.rtpPort;
        console.log(`[NDI] Connecting PlainTransport to ${bridgeIp}:${remotePort}`);
        await entry.transport.connect({
          ip: bridgeIp,
          port: remotePort,
        });

        // Build RTP capabilities with H.264 only (no RTX, no VP8/VP9).
        const routerCaps = this.router.getRouterCapabilities();
        const bridgeCaps = {
          codecs: (routerCaps.codecs || []).filter(
            (c: any) => c.mimeType === 'video/H264'
          ),
          headerExtensions: (routerCaps.headerExtensions || []).filter(
            (h: any) => h.kind === 'video'
          ),
        };

        const consumer = await entry.transport.consume({
          producerId,
          rtpCapabilities: bridgeCaps,
          paused: false,
        });

        await consumer.resume();

        socket.emit('consumer-ready', { producerId });

        consumer.on('producerclose', () => {
          socket.emit('consumer-closed', { producerId });
        });

        consumer.on('transportclose', () => {
          socket.emit('consumer-closed', { producerId });
        });
      } catch (error: any) {
        console.error(`[NDI] Error creating consumer for ${producerId}:`, error);
        socket.emit('consumer-error', { producerId, error: error.message || 'consume failed' });
      }
    });

    // Handle bridge disconnect
    socket.on('disconnect', () => {
      this.handleBridgeDisconnect(socket);
    });
  }

  // -----------------------------------------------------------------------
  // Private: Disconnect handler
  // -----------------------------------------------------------------------

  private handleBridgeDisconnect(socket: Socket): void {
    console.log(`[NDI] Bridge disconnected: ${socket.id}`);

    const session = this.bridgeSessions.get(socket.id);
    if (!session) return;

    // Close all PlainTransports for this session
    for (const [, entry] of session.plainTransports) {
      try {
        entry.transport.close();
      } catch (error) {
        console.error(`[NDI] Error closing transport for producer ${entry.producerId}:`, error);
      }
    }

    this.bridgeSessions.delete(socket.id);
  }

  // -----------------------------------------------------------------------
  // Private: New producer handler
  // -----------------------------------------------------------------------

  private async onNewProducer(producer: mediasoupTypes.Producer): Promise<void> {
    // Only handle video producers — skip audio-only
    if (producer.kind !== 'video') return;

    for (const [, session] of this.bridgeSessions) {
      try {
        const result = await this.createBridgePlainTransport(producer);
        session.plainTransports.set(producer.id, {
          transport: result.transport,
          producerId: producer.id,
          rtpPort: result.rtpPort,
          codec: result.codec,
        });

        session.socket.emit('stream-started', {
          producerId: producer.id,
          codec: result.codec,
          rtpEndpoint: { ip: result.ip, port: result.rtpPort },
        });
      } catch (error: any) {
        console.error(`[NDI] Failed to create PlainTransport for producer ${producer.id}:`, error);
        session.socket.emit('error', {
          code: 'PORT_EXHAUSTION',
          message: error.message || 'Failed to create transport',
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: Producer closed handler
  // -----------------------------------------------------------------------

  private async onProducerClosed(producerId: string): Promise<void> {
    for (const [, session] of this.bridgeSessions) {
      const entry = session.plainTransports.get(producerId);
      if (!entry) continue;

      try {
        entry.transport.close();
      } catch (error) {
        console.error(`[NDI] Error closing transport for producer ${producerId}:`, error);
      }

      session.plainTransports.delete(producerId);
      session.socket.emit('stream-stopped', { producerId, reason: 'producer-closed' });
    }
  }

  // -----------------------------------------------------------------------
  // Private: PlainTransport creation helper
  // -----------------------------------------------------------------------

  private async createBridgePlainTransport(
    producer: mediasoupTypes.Producer,
  ): Promise<{
    transport: mediasoupTypes.PlainTransport;
    ip: string;
    rtpPort: number;
    codec: { mimeType: string; clockRate: number; payloadType: number; channels?: number; parameters?: any };
  }> {
    const transport = await this.router.createPlainTransport({
      listenIp: { ip: this.config.plainTransport.listenIp },
      rtcpMux: true,
      comedia: false,
    });

    const firstCodec = producer.rtpParameters.codecs[0];
    const codec = {
      mimeType: firstCodec.mimeType,
      clockRate: firstCodec.clockRate,
      payloadType: firstCodec.payloadType,
      channels: (firstCodec as any).channels,
      parameters: firstCodec.parameters,
    };

    return {
      transport,
      ip: transport.tuple.localIp,
      rtpPort: transport.tuple.localPort,
      codec,
    };
  }
}
