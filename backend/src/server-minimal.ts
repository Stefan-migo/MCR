import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'https://192.168.100.16:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Mobile Camera Receptor Backend',
    mediasoup: 'not initialized yet'
  });
});

// WebRTC signaling endpoints
app.get('/api/rtp-capabilities', (req, res) => {
  res.json({ 
    rtpCapabilities: {
      codecs: [],
      headerExtensions: []
    }
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('📡 Client connected:', socket.id);

  socket.on('create-transport', async (data, callback) => {
    console.log('🚀 Create transport requested');
    callback({ error: 'Mediasoup not initialized yet' });
  });

  socket.on('connect-transport', async (data, callback) => {
    console.log('🔗 Connect transport requested');
    callback({ error: 'Mediasoup not initialized yet' });
  });

  socket.on('produce', async (data, callback) => {
    console.log('📹 Produce requested');
    callback({ error: 'Mediasoup not initialized yet' });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Start server
const PORT = parseInt(process.env.BACKEND_PORT || '3001');
const HOST = process.env.BACKEND_HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Backend server running on http://${HOST}:${PORT}`);
  console.log('📡 WebSocket server ready');
  console.log('🎬 WebRTC signaling ready (basic mode)');
});

export { app, httpServer, io };
