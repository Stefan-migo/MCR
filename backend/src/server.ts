import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { MediasoupRouter } from './mediasoup/router';
import streamsRouter, { setMediasoupRouter } from './api/routes/streams';

// Load environment variables
dotenv.config();

const app = express();

// Create both HTTP and HTTPS servers
const httpServer: HttpServer = createServer(app);

// Try to create HTTPS server, fallback to HTTP if certificates don't exist
let httpsServer: HttpServer | HttpsServer;
let useHttps = false;

try {
  const httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, '../../frontend/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../../frontend/cert.pem')),
  };
  httpsServer = createHttpsServer(httpsOptions, app);
  useHttps = true;
  console.log('🔒 HTTPS server created');
} catch (error) {
  console.log('⚠️ HTTPS certificates not found, using HTTP');
  httpsServer = httpServer;
  useHttps = false;
}

const serverToUse: HttpServer | HttpsServer = useHttps ? httpsServer : httpServer;
const protocol = useHttps ? 'https' : 'http';

const io = new Server(serverToUse, {
  cors: {
    origin: [
      `${protocol}://localhost:3000`,
      `${protocol}://192.168.100.19:3000`,
      `${protocol}://127.0.0.1:3000`,
      `${protocol}://0.0.0.0:3000`
    ],
    methods: ['GET', 'POST'],
  },
});

// Initialize Mediasoup router
const mediasoupRouter = new MediasoupRouter();

// Middleware
app.use(cors({
  origin: [
    `${protocol}://localhost:3000`,
    `${protocol}://192.168.100.19:3000`,
    `${protocol}://127.0.0.1:3000`,
    `${protocol}://0.0.0.0:3000`
  ],
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
      const { deviceId, deviceName } = data || ({} as any);
      if (!deviceId) {
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
      const producer = await mediasoupRouter.createProducer(
        data.transportId,
        data.kind,
        data.rtpParameters
      );
      
      callback({
        id: producer.id,
        kind: producer.kind
      });

      // Broadcast stream events to all dashboard clients
      if (data.kind === 'video') {
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

  // NDI Bridge events
  socket.on('ndi-bridge-connect', (data, callback) => {
    try {
      console.log('🎬 NDI Bridge connected:', socket.id);
      callback({ success: true, message: 'NDI Bridge connected successfully' });
    } catch (error) {
      callback({ error: 'Failed to connect NDI Bridge' });
    }
  });

  socket.on('ndi-bridge-request-streams', (data, callback) => {
    try {
      const streams = mediasoupRouter.getActiveStreams();
      const streamList = streams.map(stream => ({
        id: stream.id,
        producer_id: stream.producerId,
        device_name: stream.deviceName || stream.clientId,
        resolution: stream.resolution || { width: 1280, height: 720 },
        fps: stream.fps || 30,
        kind: stream.kind,
        created_at: stream.createdAt
      }));
      
      callback({ 
        success: true, 
        streams: streamList,
        count: streamList.length 
      });
    } catch (error) {
      callback({ error: 'Failed to get active streams' });
    }
  });

  socket.on('ndi-bridge-consume-stream', async (data, callback) => {
    try {
      const { stream_id, producer_id, rtp_capabilities } = data;
      
      // Get the producer
      const producer = mediasoupRouter.getProducer(producer_id);
      if (!producer) {
        callback({ error: 'Producer not found' });
        return;
      }
      
      // Create PlainTransport for NDI bridge
      const plainTransport = await mediasoupRouter.createPlainTransport({
        listenIp: { ip: '0.0.0.0', announcedIp: '192.168.100.19' },
        rtcpMux: false,
        comedia: true
      });
      
      // Create consumer on the plain transport
      const consumer = await mediasoupRouter.createConsumer(
        plainTransport.id,
        producer_id,
        rtp_capabilities
      );
      
      callback({
        success: true,
        consumer_id: consumer.id,
        transport: {
          ip: '192.168.100.19',
          port: plainTransport.tuple.localPort,
          rtcpPort: plainTransport.rtcpTuple?.localPort
        },
        rtp_parameters: consumer.rtpParameters
      });
      
      console.log(`🎬 NDI Bridge consuming stream: ${stream_id} -> ${producer_id} via PlainTransport ${plainTransport.id}`);
    } catch (error) {
      console.error('Failed to create consumer for NDI Bridge:', error);
      callback({ error: 'Failed to create consumer' });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);

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

