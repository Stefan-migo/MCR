import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { MediasoupRouter } from './mediasoup/router';
import { NdiSignaling } from './mediasoup/ndiSignaling';
import mediasoupConfig from './mediasoup/config';
import streamsRouter, { setMediasoupRouter } from './api/routes/streams';
import { getAnnouncedIp } from './utils/network';

// Load environment variables
dotenv.config();

const app = express();

// Create both HTTP and HTTPS servers
const httpServer: HttpServer = createServer(app);

// Try to create HTTPS server, fallback to HTTP if certificates don't exist
let httpsServer: HttpServer | HttpsServer;
let useHttps = false;

// Try multiple certificate paths (Docker: /app, Local: ./backend, Root: ./)
const certPaths = [
  '/app/cert.pem',  // Docker path
  path.join(__dirname, '../../cert.pem'),  // Root directory
  path.join(__dirname, '../cert.pem'),  // Backend directory
  './cert.pem'  // Current directory
];

const keyPaths = [
  '/app/key.pem',  // Docker path
  path.join(__dirname, '../../key.pem'),  // Root directory
  path.join(__dirname, '../key.pem'),  // Backend directory
  './key.pem'  // Current directory
];

let certPath: string | null = null;
let keyPath: string | null = null;

// Find existing certificates
for (const cp of certPaths) {
  if (fs.existsSync(cp)) {
    certPath = cp;
    break;
  }
}

for (const kp of keyPaths) {
  if (fs.existsSync(kp)) {
    keyPath = kp;
    break;
  }
}

console.log(`Checking certificates...`);
console.log(`Cert path: ${certPath || 'not found'}`);
console.log(`Key path: ${keyPath || 'not found'}`);

if (certPath && keyPath) {
  try {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    httpsServer = createHttpsServer(httpsOptions, app);
    useHttps = true;
    console.log(`🔒 HTTPS server created with certificates`);
    console.log(`   Cert: ${certPath}`);
    console.log(`   Key: ${keyPath}`);
  } catch (error) {
    console.log('⚠️ HTTPS server creation failed, using HTTP');
    if (error instanceof Error) {
      console.log(`HTTPS error: ${error.message}`);
    }
    httpsServer = httpServer;
    useHttps = false;
  }
} else {
  console.log('⚠️ HTTPS certificates not found, using HTTP');
  httpsServer = httpServer;
  useHttps = false;
}

const serverToUse: HttpServer | HttpsServer = useHttps ? httpsServer : httpServer;
const protocol = useHttps ? 'https' : 'http';

const detectedIp = getAnnouncedIp();

// Build CORS origins dynamically: detected IP + localhost + 127.0.0.1 + 0.0.0.0 + env var origins
const corsOrigins: string[] = [
  `${protocol}://localhost:3000`,
  `${protocol}://${detectedIp}:3000`,
  `${protocol}://127.0.0.1:3000`,
  `${protocol}://0.0.0.0:3000`,
  `https://localhost:3000`,
  `https://${detectedIp}:3000`,
  `https://127.0.0.1:3000`,
  `https://0.0.0.0:3000`,
  // Add any origins from the CORS_ORIGIN env var
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : []),
];

const io = new Server(serverToUse, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
});

// Initialize Mediasoup router
const mediasoupRouter = new MediasoupRouter();

// Middleware
const corsStaticOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : [];

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin || corsStaticOrigins.includes(origin)) {
    return callback(null, true);
  }
  if (origin.endsWith('.trycloudflare.com')) {
    return callback(null, true);
  }
  callback(null, true);
}

app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Mobile Camera Receptor Backend',
    mediasoup: mediasoupRouter ? 'initialized' : 'not initialized'
  });
});

// Network info endpoint: returns the detected LAN IP
app.get('/api/network-ip', (req, res) => {
  res.json({ ip: getAnnouncedIp() });
});

// API routes
app.use('/api/streams', streamsRouter);

// WebRTC signaling endpoints
app.get('/api/rtp-capabilities', (req, res) => {
  try {
    const rtpCapabilities = mediasoupRouter.getRouterCapabilities();
    res.json({ rtpCapabilities });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get RTP capabilities' });
  }
});

// PlainTransport monitoring endpoints
app.get('/api/plain-transports', (req, res) => {
  try {
    const transports = mediasoupRouter.getPlainTransports();
    res.json({
      count: transports.length,
      transports: transports.map(t => ({
        id: t.transport.id,
        streamId: t.streamId,
        producerId: t.producerId,
        ip: t.transport.tuple.localIp,
        port: t.transport.tuple.localPort,
        rtcpPort: t.transport.rtcpTuple?.localPort,
        createdAt: t.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get PlainTransports' });
  }
});

// In-memory device registry
type LensInfo = {
  deviceId: string;
  label: string;
  groupId: string;
  facingMode?: 'user' | 'environment';
  zoomMin: number | null;
  zoomMax: number | null;
  zoomStep: number | null;
  lensType: string;
};

type DeviceInfo = {
  deviceId: string;
  socketId: string;
  deviceName?: string;
  isConnected: boolean;
  isStreaming: boolean;
  streamId?: string | null;
  lastSeenAt: number;
  removalTimer?: NodeJS.Timeout;
  // Camera lens metadata (relayed from phone enumeration)
  cameraLenses?: LensInfo[];
  cameraActiveLens?: string | null;
  cameraZoom?: number | null;
};

const devices: Map<string, DeviceInfo> = new Map();

/** Look up a device's active socket ID by deviceId. Returns undefined if device is not connected. */
function findDeviceSocketId(deviceId: string): string | undefined {
  return devices.get(deviceId)?.socketId;
}

// Bridge socket tracking for NDI control routing
let bridgeSocketId: string | null = null;

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('📡 Client connected:', socket.id);

  // WebRTC signaling events
  socket.on('register-device', (data: { deviceId: string; deviceName?: string }, callback?: (resp: any) => void) => {
    try {
      console.log('📱 Register device request:', data);
      const { deviceId, deviceName } = data || ({} as any);
      if (!deviceId) {
        console.log('❌ Register device failed: deviceId required');
        callback?.({ error: 'deviceId is required' });
        return;
      }

      const existing = devices.get(deviceId);
      if (existing?.removalTimer) {
        clearTimeout(existing.removalTimer);
        existing.removalTimer = undefined;
      }

      const info: DeviceInfo = {
        deviceId,
        socketId: socket.id,
        deviceName: deviceName || existing?.deviceName,
        isConnected: true,
        isStreaming: existing?.isStreaming || false,
        streamId: existing?.streamId || null,
        lastSeenAt: Date.now()
      };

      devices.set(deviceId, info);
      io.emit('device-connected', { deviceId, deviceName: info.deviceName });
      console.log('✅ Device registered successfully:', deviceId);
      callback?.({ success: true });
    } catch (e) {
      callback?.({ error: 'failed to register device' });
    }
  });

  // Phone emits camera lens info after enumeration completes
  socket.on('register-camera-info', (data: { deviceId: string; lenses: LensInfo[]; activeLens?: string | null; zoom?: number | null }) => {
    const deviceEntry = devices.get(data.deviceId);
    if (deviceEntry) {
      deviceEntry.cameraLenses = data.lenses;
      deviceEntry.cameraActiveLens = data.activeLens ?? null;
      deviceEntry.cameraZoom = data.zoom ?? null;
      devices.set(data.deviceId, deviceEntry);
      console.log(`📷 Camera info registered for device ${data.deviceId}: ${data.lenses.length} lenses`);
    } else {
      console.warn(`⚠️ register-camera-info for unknown device: ${data.deviceId}`);
    }
  });

  socket.on('create-transport', async (data, callback) => {
    try {
      const transport = await mediasoupRouter.createWebRtcTransport();
      // Attach deviceId (if provided) to transport appData via server-side map from socket
      const deviceEntry = Array.from(devices.values()).find(d => d.socketId === socket.id);
      if (deviceEntry) {
        (transport as any).appData = { ...(transport as any).appData, clientId: deviceEntry.deviceId };
      }
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });
    } catch (error) {
      callback({ error: 'Failed to create transport' });
    }
  });

  socket.on('connect-transport', async (data, callback) => {
    try {
      const transport = mediasoupRouter.transports.get(data.transportId);
      if (transport && 'connect' in transport) {
        await transport.connect({ dtlsParameters: data.dtlsParameters });
        callback({ success: true });
      } else {
        callback({ error: 'Transport not found' });
      }
    } catch (error) {
      callback({ error: 'Failed to connect transport' });
    }
  });

  socket.on('produce', async (data, callback) => {
    try {
      const codecs = data.rtpParameters?.codecs || [];
      console.log('🎬 Produce event received:', { kind: data.kind, transportId: data.transportId, codecs: codecs.map((c: any) => ({ mimeType: c.mimeType, profile: c.parameters?.['profile-level-id'], pt: c.payloadType })) });
      const producer = await mediasoupRouter.createProducer(
        data.transportId,
        data.kind,
        data.rtpParameters
      );
      
      console.log('✅ Producer created:', { id: producer.id, kind: producer.kind });
      
      callback({
        id: producer.id,
        kind: producer.kind
      });

      // Broadcast stream events to all dashboard clients
      if (data.kind === 'video') {
        console.log('📹 Video producer detected, emitting stream-started event');
        const streams = mediasoupRouter.getActiveStreams();
        const stream = streams.find(s => s.producerId === producer.id);
        if (stream) {
          // mark device streaming
          const deviceId = (mediasoupRouter.transports.get(data.transportId)?.appData?.clientId as string) || stream.deviceId || stream.clientId;
          const dev = deviceId ? devices.get(deviceId) : undefined;
          if (dev) {
            dev.isStreaming = true;
            dev.streamId = stream.id;
            dev.lastSeenAt = Date.now();
            devices.set(deviceId, dev);
            // Emit device streaming state change
            io.emit('device-streaming-changed', { deviceId, isStreaming: true, streamId: stream.id });
          }
          // Attach camera info if the device has registered it
          const cameraInfo = dev?.cameraLenses ? {
            lenses: dev.cameraLenses,
            activeLens: dev.cameraActiveLens ?? null,
            zoom: dev.cameraZoom ?? null,
          } : undefined;

          // For now, always emit stream-started for new producers
          // The frontend will handle updating existing streams
          io.emit('stream-started', { stream: { ...stream, deviceId, ...(cameraInfo ? { cameraInfo } : {}) } });
          console.log(`📡 Stream started for client ${stream.clientId}`);
        }
      }

      // Listen for producer transport close events (when devices disconnect)
      producer.on('transportclose', () => {
        console.log(`🔌 Producer transport closed: ${producer.id}`);
        mediasoupRouter.handleProducerClosed(producer.id);
        
        // Find the stream and emit stream-ended event
        const streamsNow = mediasoupRouter.getActiveStreams();
        const endedStream = streamsNow.find(s => s.producerId === producer.id);
        // endedStream might be gone after handleProducerClosed; derive deviceId from devices map by socket
        const deviceEntry = Array.from(devices.values()).find(d => d.socketId === socket.id);
        if (deviceEntry) {
          deviceEntry.isStreaming = false;
          deviceEntry.streamId = null;
          devices.set(deviceEntry.deviceId, deviceEntry);
          // Emit device streaming state change
          io.emit('device-streaming-changed', { deviceId: deviceEntry.deviceId, isStreaming: false, streamId: null });
        }
        if (endedStream) {
          io.emit('stream-ended', { streamId: endedStream.id });
          console.log(`📡 Stream ended event sent for: ${endedStream.id}`);
        }
      });
    } catch (error) {
      callback({ error: 'Failed to create producer' });
    }
  });

  // Handle device stopping stream (but staying connected)
  socket.on('stop-stream', (data, callback) => {
    try {
      const deviceEntry = Array.from(devices.values()).find(d => d.socketId === socket.id);
      if (deviceEntry) {
        deviceEntry.isStreaming = false;
        deviceEntry.streamId = null;
        deviceEntry.lastSeenAt = Date.now();
        devices.set(deviceEntry.deviceId, deviceEntry);
        
        // Emit device streaming state change
        io.emit('device-streaming-changed', { deviceId: deviceEntry.deviceId, isStreaming: false, streamId: null });
        callback({ success: true });
      } else {
        callback({ error: 'Device not found' });
      }
    } catch (error) {
      callback({ error: 'Failed to stop stream' });
    }
  });

  // Dashboard-specific events
  socket.on('get-active-streams', (callback) => {
    try {
      const streams = mediasoupRouter.getActiveStreams();
      callback({ streams });
    } catch (error) {
      callback({ error: 'Failed to get active streams' });
    }
  });

  // Browser recv-only WebRTC (dashboard previews)
  // Keep track of per-socket transports/consumers for cleanup
  const socketRecvTransports: Set<string> = new Set();
  const socketConsumers: Set<string> = new Set();

  socket.on('get-rtp-capabilities', async (data, callback) => {
    try {
      const caps = mediasoupRouter.getRouterCapabilities();
      safeCallback(callback, { rtpCapabilities: caps }, 'rtp-caps');
    } catch (error) {
      safeCallback(callback, { error: 'Failed to get RTP capabilities' }, 'rtp-caps-err');
    }
  });

  const safeCallback = (cb: any, result: any, label?: string) => {
    const isFn = typeof cb === 'function';
    console.log(`[Bridge] safeCallback(${label || '?'}): cb is ${typeof cb}${isFn ? '' : ' — DROPPED!'}, result keys: ${Object.keys(result || {}).join(',')}`);
    if (isFn) cb(result);
  };

  socket.on('create-recv-transport', async (data, callback) => {
    console.log(`[Bridge] create-recv-transport called (socket ${socket.id})`);
    try {
      const transport = await mediasoupRouter.createWebRtcTransport();
      (transport as any).appData = { ...(transport as any).appData, clientId: socket.id, role: 'recv' };
      socketRecvTransports.add(transport.id);
      console.log(`[Bridge] WebRTC transport created: ${transport.id}`);
      safeCallback(callback, {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      }, 'create-recv');
    } catch (error) {
      console.error(`[Bridge] create-recv-transport ERROR:`, error);
      safeCallback(callback, { error: 'Failed to create recv transport' }, 'create-recv-err');
    }
  });

  socket.on('connect-recv-transport', async (data, callback) => {
    try {
      const { transportId, dtlsParameters } = data || {};
      console.log(`[Bridge] connect-recv-transport: ${transportId}`);
      const transport = mediasoupRouter.transports.get(transportId);
      if (!transport || !('connect' in transport)) {
        safeCallback(callback, { error: 'Transport not found' }, 'connect-err');
        return;
      }
      await transport.connect({ dtlsParameters });
      safeCallback(callback, { success: true }, 'connect-recv');
    } catch (error) {
      safeCallback(callback, { error: 'Failed to connect recv transport' }, 'connect-recv-err');
    }
  });

  socket.on('consume-stream', async (data, callback) => {
    try {
      const { transportId, producerId, rtpCapabilities } = data || {};
      console.log(`[Bridge] consume-stream: transport=${transportId}, producer=${producerId}`);
      if (!transportId || !producerId || !rtpCapabilities) {
        safeCallback(callback, { error: 'transportId, producerId and rtpCapabilities are required' }, 'consume-err');
        return;
      }

      const consumer = await mediasoupRouter.createConsumer(transportId, producerId, rtpCapabilities);
      socketConsumers.add(consumer.id);

      console.log(`[Bridge] Consumer created: id=${consumer.id}, kind=${consumer.kind}, `
        + `type=${(consumer as any).type}, paused=${consumer.paused}, `
        + `producerPaused=${consumer.producerPaused}`);

      safeCallback(callback, {
        id: consumer.id,
        kind: (consumer as any).kind,
        rtpParameters: consumer.rtpParameters,
        type: (consumer as any).type,
        producerId
      }, 'consume-stream');
    } catch (error: any) {
      safeCallback(callback, { error: error?.message || 'Failed to consume stream' }, 'consume-err');
    }
  });

  socket.on('resume-consumer', async (data, callback) => {
    try {
      const { consumerId } = data || {};
      const consumer = mediasoupRouter.consumers.get(consumerId);
      if (!consumer) {
        safeCallback(callback, { error: 'Consumer not found' }, 'resume-err');
        return;
      }
      await consumer.resume();

      // If simulcast, configure spatial/temporal layers so RTP flows.
      // Always start at base layer (0) — not all devices produce 3 layers.
      const ctype = (consumer as any).type;
      if (ctype === 'simulcast' || ctype === 'svc') {
        try {
          await consumer.setPreferredLayers({ spatialLayer: 0, temporalLayer: 0 });
          console.log(`[Bridge] Simulcast layers configured (spatial=0, temporal=0)`);
        } catch (e: any) {
          console.log(`[Bridge] setPreferredLayers error:`, e.message);
        }
      }

      safeCallback(callback, { success: true }, 'resume');

      // Check stats after 5s to verify RTP is flowing
      setTimeout(async () => {
        try {
          const stats = await consumer.getStats();
          console.log(`[Bridge] Consumer stats (${consumer.id}):`, JSON.stringify(stats));
        } catch (e: any) {
          console.log(`[Bridge] Consumer stats error:`, e.message);
        }
      }, 5000);
    } catch (error) {
      safeCallback(callback, { error: 'Failed to resume consumer' }, 'resume-err');
    }
  });

  socket.on('update-stream-name', async (data, callback) => {
    try {
      const { streamId, name } = data;
      const success = mediasoupRouter.updateStreamName(streamId, name);
      
      if (success) {
        const stream = mediasoupRouter.getStreamById(streamId);
        io.emit('stream-name-updated', { streamId, name, stream });
        callback({ success: true });
      } else {
        callback({ error: 'Stream not found' });
      }
    } catch (error) {
      callback({ error: 'Failed to update stream name' });
    }
  });

  socket.on('disconnect-stream', async (data, callback) => {
    try {
      const { streamId } = data;
      const success = await mediasoupRouter.disconnectStream(streamId);
      
      if (success) {
        io.emit('stream-ended', { streamId });
        callback({ success: true });
      } else {
        callback({ error: 'Stream not found' });
      }
    } catch (error) {
      callback({ error: 'Failed to disconnect stream' });
    }
  });

  socket.on('set-stream-quality', async (data, callback) => {
    try {
      const { producerId, spatialLayer } = data || {};

      if (!producerId || spatialLayer === undefined) {
        callback?.({ error: 'producerId and spatialLayer are required' });
        return;
      }

      const consumers = mediasoupRouter.getConsumersByProducerId(producerId);
      let updated = 0;

      for (const consumer of consumers) {
        try {
          const consumerType = (consumer as any).type;
          if (consumerType === 'simulcast' || consumerType === 'svc') {
            await consumer.setPreferredLayers({ spatialLayer });
            updated++;
          }
        } catch (consumerError) {
          console.error(`[Quality] Failed to update consumer ${consumer.id}:`, consumerError);
        }
      }

      console.log(`[Quality] Stream ${producerId}: spatial ${spatialLayer} applied to ${updated} consumers`);

      // Broadcast quality change to all dashboard clients
      if (updated > 0) {
        io.emit('stream-quality-changed', { producerId, spatialLayer });
      }

      callback?.({ success: true, consumersUpdated: updated });
    } catch (error) {
      console.error(`[Quality] Error in set-stream-quality:`, error);
      callback?.({ error: 'Failed to set stream quality' });
    }
  });

  // NDI bridge registration (bridge identifies itself)
  socket.on('register-bridge', () => {
    bridgeSocketId = socket.id;
    console.log('NDI bridge registered:', socket.id);
  });

  // NDI control — dashboard requests NDI sender create/destroy
  socket.on('set-ndi-control', (data: { deviceId: string; enabled: boolean; ndiName?: string }, callback) => {
    try {
      const { deviceId, enabled, ndiName } = data;
      if (!deviceId) {
        callback?.({ error: 'deviceId is required' });
        return;
      }

      // Find active stream by deviceId
      const streams = mediasoupRouter.getActiveStreams();
      const stream = streams.find((s: any) => s.deviceId === deviceId);
      if (!stream) {
        callback?.({ error: 'No active stream for device' });
        return;
      }

      if (!bridgeSocketId) {
        callback?.({ error: 'NDI bridge not connected' });
        return;
      }

      const sourceName = ndiName || `MCR-${deviceId.slice(0, 8)}`;

      io.to(bridgeSocketId).emit('ndi-control', {
        deviceId,
        producerId: stream.producerId,
        enabled,
        sourceName,
      });

      callback?.({ success: true });
    } catch (error) {
      callback?.({ error: 'Failed to process NDI control' });
    }
  });

  // NDI control result — bridge confirms NDI state change
  socket.on('ndi-control-result', (data: { deviceId: string; active: boolean; sourceName?: string }) => {
    io.emit('ndi-control-updated', {
      deviceId: data.deviceId,
      enabled: data.active,
      ndiSourceName: data.sourceName || null,
    });
  });

  // Camera lens control — dashboard requests lens switch or zoom change on a device
  socket.on('set-camera-lens', (data: { deviceId: string; lensDeviceId?: string; zoom?: number }, callback) => {
    try {
      const deviceInfo = devices.get(data.deviceId);
      if (!deviceInfo || !deviceInfo.isConnected) {
        callback?.({ error: 'Device not connected' });
        return;
      }
      // Relay to the device's socket (phone client)
      io.to(deviceInfo.socketId).emit('set-camera-lens', {
        lensDeviceId: data.lensDeviceId,
        zoom: data.zoom,
      });
      callback?.({ success: true });
    } catch (error) {
      callback?.({ error: 'Failed to relay camera lens command' });
    }
  });

  // Camera lens ack — phone responds with new lens/zoom state; broadcast to dashboards
  socket.on('camera-lens-changed', (data: { deviceId: string; activeLens: string; zoom: number; success: boolean }) => {
    // Update stored metadata
    const deviceEntry = devices.get(data.deviceId);
    if (deviceEntry) {
      deviceEntry.cameraActiveLens = data.activeLens ?? deviceEntry.cameraActiveLens;
      deviceEntry.cameraZoom = data.zoom ?? deviceEntry.cameraZoom;
      devices.set(data.deviceId, deviceEntry);
    }
    // Broadcast to all dashboard clients
    io.emit('camera-lens-changed', data);
  });

  // Force VP8 — dashboard operator requests device to switch from H.264 to VP8
  socket.on('force-vp8', (data: { deviceId: string }) => {
    const device = findDeviceSocketId(data.deviceId);
    if (!device) {
      console.log(`[VP8] Device ${data.deviceId} not connected`);
      return;
    }
    io.to(device).emit('force-vp8');
    console.log(`[VP8] Forcing VP8 on device ${data.deviceId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);

    // Clear bridge tracking if the bridge disconnects
    if (socket.id === bridgeSocketId) {
      bridgeSocketId = null;
      console.log('❌ NDI bridge disconnected');
    }

    // Cleanup recv transports/consumers
    try {
      for (const consumerId of socketConsumers) {
        const consumer = mediasoupRouter.consumers.get(consumerId);
        if (consumer) {
          try { consumer.close(); } catch {}
          mediasoupRouter.consumers.delete(consumerId);
        }
      }
      for (const transportId of socketRecvTransports) {
        const transport = mediasoupRouter.transports.get(transportId);
        if (transport) {
          try { (transport as any).close?.(); } catch {}
          mediasoupRouter.transports.delete(transportId);
        }
      }
    } catch {}

    // Mark device disconnected and schedule removal in 30s if not streaming
    const deviceEntry = Array.from(devices.values()).find(d => d.socketId === socket.id);
    if (deviceEntry) {
      deviceEntry.isConnected = false;
      deviceEntry.lastSeenAt = Date.now();
      devices.set(deviceEntry.deviceId, deviceEntry);
      io.emit('device-disconnected', { deviceId: deviceEntry.deviceId });

      if (deviceEntry.removalTimer) {
        clearTimeout(deviceEntry.removalTimer);
      }
      deviceEntry.removalTimer = setTimeout(() => {
        const current = devices.get(deviceEntry.deviceId);
        if (current && !current.isConnected && !current.isStreaming) {
          devices.delete(deviceEntry.deviceId);
          io.emit('device-removed', { deviceId: deviceEntry.deviceId });
        }
      }, 30000);
    }
  });
});

// Cleanup handler for closed producers
io.on('producer-close', async (producerId: string) => {
  // Find and close associated PlainTransport
  await mediasoupRouter.closePlainTransportForProducer(producerId);
});

// Start server
const PORT = parseInt(process.env.BACKEND_PORT || '3001');
const HOST = process.env.BACKEND_HOST || '0.0.0.0';

// Initialize Mediasoup and start server
async function startServer() {
  try {
    await mediasoupRouter.initialize();
    console.log('✅ Mediasoup router ready');
    
    // Inject mediasoup router into streams API
    setMediasoupRouter(mediasoupRouter);
    
    // Initialize NDI bridge signaling if enabled
    if (mediasoupConfig.ndiBridge.enabled) {
      const ndiSignaling = new NdiSignaling(io, mediasoupRouter, mediasoupConfig.ndiBridge);
      ndiSignaling.init();
      console.log('✅ NDI bridge signaling initialized');
    }

    // Start stats broadcasting
    startStatsBroadcasting();
    
    serverToUse.listen(PORT, HOST, () => {
      console.log(`🚀 Backend server running on ${protocol}://${HOST}:${PORT}`);
      console.log('📡 WebSocket server ready');
      console.log('🎬 WebRTC signaling ready');
      console.log('📊 Dashboard API ready');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Track packet count per producer for frameRate estimation
const prevPackets = new Map<string, { count: number; ts: number }>();

// Broadcast real mediasoup producer stats every 2 seconds
function startStatsBroadcasting() {
  setInterval(async () => {
    try {
      const streams = mediasoupRouter.getActiveStreams();
      if (streams.length === 0) return;

      const results = await Promise.allSettled(
        streams.map(async (stream) => {
          if (!stream.stats) return;
          const producer = mediasoupRouter.getProducer(stream.producerId);
          if (!producer) return;

          const stats = await producer.getStats();
          const rtpStats = stats[0];
          if (!rtpStats) return;

          stream.stats.bitrate = rtpStats.bitrate;
          stream.stats.packetsLost = rtpStats.packetsLost;
          stream.stats.jitter = rtpStats.jitter;
          stream.stats.rtt = rtpStats.roundTripTime ?? stream.stats.rtt;

          // Estimate frameRate from packet count delta
          const prev = prevPackets.get(stream.producerId);
          const now = Date.now();
          if (prev && prev.count < rtpStats.packetCount) {
            const elapsed = (now - prev.ts) / 1000;
            const delta = rtpStats.packetCount - prev.count;
            stream.stats.frameRate = elapsed > 0 ? Math.round(delta / elapsed) : stream.stats.frameRate;
          }
          prevPackets.set(stream.producerId, { count: rtpStats.packetCount, ts: now });
        })
      );

      // Log per-stream errors but don't fail the whole batch
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('Stats fetch error:', result.reason);
        }
      }

      io.emit('stream-stats-update', { streams });
    } catch (error) {
      console.error('Error broadcasting stats:', error);
    }
  }, 2000);
}

startServer();

export { app, httpServer, httpsServer, io };

