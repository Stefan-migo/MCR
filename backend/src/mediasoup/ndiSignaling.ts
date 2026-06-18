import { Server, Socket } from 'socket.io';
import { MediasoupRouter } from './router';
import { NdiBridgeConfig } from './config';
import { types as mediasoupTypes } from 'mediasoup';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface StreamCodec {
  mimeType: string;
  payloadType: number;
  clockRate: number;
  channels?: number;
  parameters?: any;
}

export interface BridgeSession {
  socketId: string;
  socket: Socket;
  transport: mediasoupTypes.WebRtcTransport | null;
  consumers: Map<string, mediasoupTypes.Consumer>;
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

  init(): void {
    const namespace = this.io.of('/ndi-bridge');

    namespace.use((_socket, next) => {
      next();
    });

    namespace.on('connection', (socket: Socket) => {
      return this.handleConnection(socket).catch((error) => {
        console.error('[NDI] Error in bridge connection handler:', error);
      });
    });

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

    // Create a WebRtcTransport for this bridge (consuming media like a browser)
    const transport = await this.router.createWebRtcTransport();
    const iceCandidates = transport.iceCandidates;
    const dtlsParameters = transport.dtlsParameters;

    const session: BridgeSession = {
      socketId: socket.id,
      socket,
      transport,
      consumers: new Map(),
      createdAt: new Date(),
    };
    this.bridgeSessions.set(socket.id, session);

    // Send transport params + active producers to the bridge
    const videoProducers = this.router.getVideoProducers();
    const streams = videoProducers.map((p) => ({
      producerId: p.id,
      codec: p.rtpParameters.codecs[0] ? {
        mimeType: p.rtpParameters.codecs[0].mimeType,
        payloadType: p.rtpParameters.codecs[0].payloadType,
        clockRate: p.rtpParameters.codecs[0].clockRate,
      } : null,
    }));

    socket.emit('transport-created', {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });

    socket.emit('active-streams', { streams });

    // Handle DTLS connect from bridge
    socket.on('connect-webrtc', async (data: { dtlsParameters: any }) => {
      try {
        await transport.connect({ dtlsParameters: data.dtlsParameters });
        console.log(`[NDI] WebRTC transport connected: ${socket.id}`);
        socket.emit('transport-connected', { success: true });
      } catch (error: any) {
        console.error(`[NDI] WebRTC connect error:`, error);
        socket.emit('transport-connected', { success: false, error: error.message });
      }
    });

    // Handle consume-stream — bridge requests a Consumer for a producer
    socket.on('consume-stream', async ({ producerId }: { producerId: string }) => {
      try {
        const producer = this.router.getProducer(producerId);
        if (!producer) {
          socket.emit('consumer-error', { producerId, error: 'producer not found' });
          return;
        }

        const rtpCapabilities = this.router.getRouterCapabilities();
        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: false,
        });

        await consumer.resume();

        // Configure spatial/temporal layers for simulcast/SVC consumers
        // Start at base layer (0) — not all devices produce 3 layers
        try {
          await consumer.setPreferredLayers({ spatialLayer: 0, temporalLayer: 0 });
          console.log(`[NDI] Consumer layers configured (spatial=0, temporal=0)`);
        } catch (e: any) {
          // Non-simulcast/non-SVC consumers (simple) will throw — this is expected
          console.log(`[NDI] setPreferredLayers skipped (expected for simple consumers):`, e.message);
        }

        session.consumers.set(consumer.id, consumer);

        socket.emit('consumer-ready', {
          producerId,
          consumerId: consumer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });

        consumer.on('producerclose', () => {
          session.consumers.delete(consumer.id);
          socket.emit('consumer-closed', { producerId });
        });

        consumer.on('transportclose', () => {
          session.consumers.delete(consumer.id);
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

    for (const [, consumer] of session.consumers) {
      try { consumer.close(); } catch (_) { /* ignore */ }
    }

    if (session.transport) {
      try { session.transport.close(); } catch (_) { /* ignore */ }
    }

    this.bridgeSessions.delete(socket.id);
  }

  // -----------------------------------------------------------------------
  // Private: New producer handler
  // -----------------------------------------------------------------------

  private async onNewProducer(producer: mediasoupTypes.Producer): Promise<void> {
    if (producer.kind !== 'video') return;

    for (const [, session] of this.bridgeSessions) {
      session.socket.emit('stream-started', {
        producerId: producer.id,
        codec: producer.rtpParameters.codecs[0] ? {
          mimeType: producer.rtpParameters.codecs[0].mimeType,
          payloadType: producer.rtpParameters.codecs[0].payloadType,
          clockRate: producer.rtpParameters.codecs[0].clockRate,
        } : null,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Private: Producer closed handler
  // -----------------------------------------------------------------------

  private async onProducerClosed(producerId: string): Promise<void> {
    for (const [, session] of this.bridgeSessions) {
      // Find and close any consumer for this producer
      for (const [consumerId, consumer] of session.consumers) {
        if (consumer.producerId === producerId) {
          try { consumer.close(); } catch (_) { /* ignore */ }
          session.consumers.delete(consumerId);
        }
      }

      session.socket.emit('stream-stopped', { producerId, reason: 'producer-closed' });
    }
  }
}
