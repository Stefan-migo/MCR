# 📱 Mobile Camera Receptor (MCR)

A professional real-time mobile camera streaming system designed for VJs, content creators, and multimedia artists. Transform your mobile devices into professional streaming cameras with ultra-low latency WebRTC technology.

## ✨ Features

- **📱 Mobile Camera Streaming**: Professional mobile camera interface with quality controls
- **🎛️ VJ Dashboard**: Real-time monitoring and control of multiple streams
- **⚡ Ultra-Low Latency**: Sub-100ms latency using WebRTC technology
- **🔄 Multi-Stream Support**: Handle multiple mobile devices simultaneously
- **📊 Live Statistics**: Real-time performance metrics and monitoring
- **🎥 Quality Presets**: Low, Medium, High, and Ultra quality options
- **🔒 Secure**: HTTPS required for mobile camera access
- **📱 PWA Support**: App-like experience on mobile devices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Python 3.8+ (for NDI Bridge)
- Mobile device with camera
- Modern web browser

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Stefan-migo/MCR.git
   cd MCR
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install backend dependencies
   cd backend && npm install
   
   # Install frontend dependencies
   cd ../frontend && npm install
   
   # Install NDI Bridge dependencies
   cd ../ndi-bridge && pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Start the servers**
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```

5. **Access the application**
   - **Mobile Stream**: `https://localhost:3000/stream`
   - **VJ Dashboard**: `https://localhost:3000/dashboard`

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Mobile Client │    │   VJ Dashboard  │    │   NDI Bridge    │
│   (Next.js PWA) │    │   (Next.js)     │    │   (Python)      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │              WebRTC  │              NDI     │
          │              Signaling│              Output  │
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Backend Server        │
                    │   (Node.js + Mediasoup)   │
                    │   WebRTC SFU + Socket.io  │
                    └───────────────────────────┘
```

## 📱 Mobile Client

The mobile client provides a professional camera interface with:

- **Camera Controls**: Switch between front/back cameras
- **Quality Settings**: Adjust resolution and frame rate
- **Audio/Video Toggle**: Independent control of audio and video
- **Fullscreen Mode**: Immersive streaming experience
- **PWA Support**: Install as a native app

## 🎛️ VJ Dashboard

The VJ dashboard offers comprehensive stream management:

- **Real-time Monitoring**: Live stream statistics and status
- **Stream Management**: Rename, disconnect, and monitor streams
- **Grid/List Views**: Toggle between different display modes
- **Live Statistics**: Bitrate, latency, packet loss, frame rate
- **Connection Status**: Visual indicators for connection health

## 🔧 Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Mediasoup, Socket.io
- **Mobile**: PWA, WebRTC, Camera API
- **NDI Bridge**: Python, aiortc, OpenCV
- **Infrastructure**: Docker, Nginx

## 📊 Performance Targets

- **Latency**: < 100ms end-to-end
- **Resolution**: Up to 4K streaming
- **Frame Rate**: 15-60 FPS adaptive
- **Concurrent Streams**: 10+ simultaneous streams
- **Bitrate**: 200 Kbps - 2 Mbps adaptive

## 🛠️ Development

### Project Structure

```
MCR/
├── frontend/          # Next.js mobile client & dashboard
├── backend/           # Node.js + Mediasoup server
├── ndi-bridge/        # Python NDI output service
├── infra/             # Docker & deployment configs
├── shared/            # Shared types and utilities
└── scripts/           # Development and build scripts
```

### Available Scripts

```bash
# Development
npm run dev              # Start all services
npm run dev:frontend     # Start frontend only
npm run dev:backend      # Start backend only
npm run dev:ndi          # Start NDI bridge only

# Production
npm run build            # Build all services
npm run start            # Start production servers
```

## 🔒 Security

- HTTPS required for mobile camera access
- CORS configured for secure cross-origin requests
- Environment-based configuration
- Secure WebRTC connections

## 📈 Roadmap

- [x] **Phase 1**: Foundation & Core Infrastructure
- [x] **Phase 2**: WebRTC Streaming & Mobile Client
- [x] **Phase 2.4**: VJ Dashboard
- [ ] **Phase 3**: NDI Bridge Development
- [ ] **Phase 4**: Advanced Features & Controls
- [ ] **Phase 5**: Production Optimization
- [ ] **Phase 6**: Deployment & Scaling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Mediasoup](https://mediasoup.org/) for WebRTC SFU
- [Next.js](https://nextjs.org/) for the frontend framework
- [Socket.io](https://socket.io/) for real-time communication
- [aiortc](https://github.com/aiortc/aiortc) for Python WebRTC

## 📞 Support

For support, questions, or feature requests, please open an issue on GitHub.

---

**Built with ❤️ for the VJ and multimedia community**
