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
type DeviceInfo = {
  deviceId: string;
  socketId: string;
  deviceName?: string;
  isConnected: boolean;
  isStreaming: boolean;
  streamId?: string | null;
  lastSeenAt: number;
  removalTimer?: NodeJS.Timeout;
};

const devices: Map<string, DeviceInfo> = new Map();

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
      console.log('🎬 Produce event received:', { kind: data.kind, transportId: data.transportId });
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
          // For now, always emit stream-started for new producers
          // The frontend will handle updating existing streams
          io.emit('stream-started', { stream: { ...stream, deviceId } });
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

  socket.on('get-rtp-capabilities', (callback) => {
    try {
      const caps = mediasoupRouter.getRouterCapabilities();
      safeCallback(callback, { rtpCapabilities: caps });
    } catch (error) {
      safeCallback(callback, { error: 'Failed to get RTP capabilities' });
    }
  });

  const safeCallback = (cb: any, result: any) => {
    if (typeof cb === 'function') cb(result);
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
      });
    } catch (error) {
      console.error(`[Bridge] create-recv-transport ERROR:`, error);
      safeCallback(callback, { error: 'Failed to create recv transport' });
    }
  });

  socket.on('connect-recv-transport', async (data, callback) => {
    try {
      const { transportId, dtlsParameters } = data || {};
      console.log(`[Bridge] connect-recv-transport: ${transportId}`);
      const transport = mediasoupRouter.transports.get(transportId);
      if (!transport || !('connect' in transport)) {
        safeCallback(callback, { error: 'Transport not found' });
        return;
      }
      await transport.connect({ dtlsParameters });
      safeCallback(callback, { success: true });
    } catch (error) {
      safeCallback(callback, { error: 'Failed to connect recv transport' });
    }
  });

  socket.on('consume-stream', async (data, callback) => {
    try {
      const { transportId, producerId, rtpCapabilities } = data || {};
      console.log(`[Bridge] consume-stream: transport=${transportId}, producer=${producerId}`);
      if (!transportId || !producerId || !rtpCapabilities) {
        safeCallback(callback, { error: 'transportId, producerId and rtpCapabilities are required' });
        return;
      }

      const consumer = await mediasoupRouter.createConsumer(transportId, producerId, rtpCapabilities);
      socketConsumers.add(consumer.id);

      safeCallback(callback, {
        id: consumer.id,
        kind: (consumer as any).kind,
        rtpParameters: consumer.rtpParameters,
        type: (consumer as any).type,
        producerId
      });
    } catch (error: any) {
      safeCallback(callback, { error: error?.message || 'Failed to consume stream' });
    }
  });

  socket.on('resume-consumer', async (data, callback) => {
    try {
      const { consumerId } = data || {};
      const consumer = mediasoupRouter.consumers.get(consumerId);
      if (!consumer) {
        safeCallback(callback, { error: 'Consumer not found' });
        return;
      }
      await consumer.resume();
      safeCallback(callback, { success: true });
    } catch (error) {
      safeCallback(callback, { error: 'Failed to resume consumer' });
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

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);

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

// Broadcast stream stats every 2 seconds
function startStatsBroadcasting() {
  setInterval(() => {
    try {
      const streams = mediasoupRouter.getActiveStreams();
      if (streams.length > 0) {
        // Update mock stats for now (will be replaced with real producer stats)
        streams.forEach(stream => {
          if (stream.stats) {
            stream.stats.bitrate = Math.floor(Math.random() * 2000000) + 500000; // 0.5-2.5 Mbps
            stream.stats.packetsLost = Math.floor(Math.random() * 5); // 0-5 packets
            stream.stats.rtt = Math.floor(Math.random() * 100) + 20; // 20-120ms
            stream.stats.jitter = Math.floor(Math.random() * 50) + 5; // 5-55ms
            stream.stats.frameRate = Math.floor(Math.random() * 10) + 25; // 25-35 fps
          }
        });
        
        io.emit('stream-stats-update', { streams });
      }
    } catch (error) {
      console.error('Error broadcasting stats:', error);
    }
  }, 2000);
}

startServer();

export { app, httpServer, httpsServer, io };

