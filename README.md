# 📱 Mobile Camera Receptor (MCR)

A professional real-time mobile camera streaming system designed for VJs, content creators, and multimedia artists. Transform your mobile devices into professional streaming cameras with ultra-low latency WebRTC technology.

## ✨ Features

- **📱 Mobile Camera Streaming**: Professional mobile camera interface with quality controls
- **🎛️ VJ Dashboard**: Real-time monitoring and control of multiple streams
- **🎬 NDI Integration**: Convert streams to NDI sources for OBS Studio and Resolume
- **⚡ Ultra-Low Latency**: Sub-100ms latency using WebRTC technology
- **🔄 Multi-Stream Support**: Handle multiple mobile devices simultaneously
- **📊 Live Statistics**: Real-time performance metrics and monitoring
- **🎥 Quality Presets**: Low, Medium, High, and Ultra quality options
- **🔒 Secure**: HTTPS required for mobile camera access
- **📱 PWA Support**: App-like experience on mobile devices
- **🏷️ Device Management**: Rename and organize devices from dashboard
- **📡 Smart Connection Tracking**: Separate device presence from streaming state
- **⏱️ Live Timers**: Real-time streaming duration tracking
- **🎯 Status Indicators**: Live Stream, Not Streaming, and Disconnected states
- **🐳 Docker Support**: Easy deployment with Docker and Docker Compose

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

4. **Important configuration (local LAN)**
   - Set your LAN IP (used by Mediasoup for ICE):
   ```bash
   # In the backend terminal before starting
   export MEDIASOUP_ANNOUNCED_IP=192.168.100.11
   ```
   - Frontend env (`frontend/.env.local`):
   ```
   NEXT_PUBLIC_API_URL=https://192.168.100.11:3001
   NEXT_PUBLIC_WS_URL=wss://192.168.100.11:3001
   ```
   - NDI Bridge env when running via Python:
   ```bash
   export BACKEND_URL=https://192.168.100.11:3001
   export BACKEND_WS_URL=wss://192.168.100.11:3001
   ```

5. **Start the servers**
   ```bash
   # Option 1: Docker Compose (Recommended)
   docker-compose up
   
   # Option 2: Manual start (Linux)
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend (HTTPS)
   cd frontend && npm run dev:https
   
   # Terminal 3: NDI Bridge
   cd ndi-bridge && python src/main.py
   ```

### Manual Installation (Linux)

If Docker is not working, follow these steps for manual installation:

1. **Install NDI SDK**
   ```bash
   # Download NDI SDK for Linux from https://www.ndi.tv/sdk/
   # Extract and install
   sudo mkdir -p /usr/local/ndi-sdk
   sudo cp -r "NDI SDK for Linux"/* /usr/local/ndi-sdk/
   sudo cp /usr/local/ndi-sdk/lib/x86_64-linux-gnu/libndi.so.5.6.1 /usr/local/lib/
   sudo ln -sf /usr/local/lib/libndi.so.5.6.1 /usr/local/lib/libndi.so.5
   sudo ln -sf /usr/local/lib/libndi.so.5 /usr/local/lib/libndi.so
   sudo cp -r /usr/local/ndi-sdk/include/* /usr/local/include/
   sudo ldconfig
   ```

2. **Install OBS Studio NDI Plugin**
   ```bash
   # Build OBS Studio NDI plugin from source
   git clone https://github.com/Palakis/obs-ndi.git
   cd obs-ndi
   mkdir build && cd build
   cmake -DCMAKE_BUILD_TYPE=Release ..
   make -j4
   
   # Install the plugin
   sudo cp obs-plugins/64bit/obs-ndi.so /usr/lib64/obs-plugins/
   sudo cp -r data/obs-plugins/obs-ndi /usr/share/obs/obs-plugins/
   sudo chmod 755 /usr/lib64/obs-plugins/obs-ndi.so
   sudo chmod -R 755 /usr/share/obs/obs-plugins/obs-ndi
   ```

3. **Start all services manually**
   ```bash
   # Terminal 1: Backend (Port 3001)
   cd backend && npm run dev
   
   # Terminal 2: Frontend (Port 3000)
   cd frontend && npm run dev
   
   # Terminal 3: NDI Bridge (Port 8000)
   cd ndi-bridge && source venv/bin/activate && python src/main.py
   
   # Terminal 4: Test NDI Sources
   cd ndi-bridge && ./create_ndi_source "FEDORA (Test_NDI_Source)" 1280 720 30
   ```

5. **Access the application**
   - **Mobile Stream**: `https://localhost:3000/stream`
   - **VJ Dashboard**: `https://localhost:3000/dashboard`
   - **NDI Bridge API**: `http://localhost:8000/health`

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
                                 │
                    ┌─────────────▼─────────────┐
                    │   Professional Software   │
                    │   OBS Studio, Resolume    │
                    │   and other NDI clients   │
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
- **Device Organization**: Rename devices for better organization
- **Smart State Tracking**: Separate device connection from streaming state
- **Live Timers**: Real-time streaming duration with pause/resume
- **Status Badges**: Clear visual indicators (Live Stream, Not Streaming, Disconnected)
- **Auto-cleanup**: Devices automatically removed after 30s when disconnected

## 🎬 NDI Bridge

The NDI Bridge converts WebRTC streams to NDI sources for professional video software:

- **NDI Integration**: Convert mobile streams to NDI sources
- **Multi-Stream Support**: Handle multiple simultaneous streams
- **Automatic Discovery**: Auto-detect and consume new streams
- **Professional Integration**: Works with OBS Studio, Resolume, and other NDI software
- **Low Latency**: <500ms end-to-end latency
- **REST API**: Monitor and control via HTTP API
- **Docker Support**: Easy deployment with Docker
- **Performance Monitoring**: Real-time statistics and health checks

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

- [x] **Phase 1**: Foundation & Core Infrastructure ✅
- [x] **Phase 2.1**: Mediasoup Setup ✅
- [x] **Phase 2.2**: WebRTC Signaling ✅
- [x] **Phase 2.3**: Mobile Client ✅
- [x] **Phase 2.4**: VJ Dashboard ✅
- [x] **Phase 3**: NDI Bridge Development ✅
- [ ] **Phase 4**: Advanced Features & Controls
- [ ] **Phase 5**: Production Optimization
- [ ] **Phase 6**: Deployment & Scaling

### Recent Updates (Phase 3 Complete)

- ✅ **NDI Integration**: Convert WebRTC streams to NDI sources
- ✅ **Multi-Stream Support**: Handle multiple simultaneous streams
- ✅ **Automatic Discovery**: Auto-detect and consume new streams
- ✅ **Professional Integration**: Works with OBS Studio and Resolume
- ✅ **Docker Support**: Easy deployment with Docker Compose
- ✅ **REST API**: Monitor and control via HTTP API
- ✅ **Performance Monitoring**: Real-time statistics and health checks
- ✅ **Low Latency**: <500ms end-to-end latency achieved
- ✅ **Manual Server Setup**: Complete manual installation guide for Linux
- ✅ **NDI SDK Installation**: Full NDI SDK setup and configuration
- ✅ **OBS Studio Integration**: NDI plugin installation and testing
- ✅ **Real Mobile Camera Testing**: End-to-end pipeline validation

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
