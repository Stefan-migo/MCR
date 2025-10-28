# NDI Bridge

The NDI Bridge is a Python service that converts WebRTC streams from the Mobile Camera Receptor backend into NDI (Network Device Interface) sources for professional video software like OBS Studio and Resolume.

## Features

- **WebRTC to NDI Conversion**: Converts mobile camera streams to NDI sources
- **Multi-Stream Support**: Handles multiple simultaneous streams
- **Automatic Stream Discovery**: Automatically detects and consumes new streams
- **Low Latency**: Optimized for real-time performance (<500ms latency)
- **Professional Integration**: Works with OBS Studio, Resolume, and other NDI-compatible software
- **Docker Support**: Easy deployment with Docker and Docker Compose
- **REST API**: Monitor and control streams via HTTP API

## Prerequisites

### NDI SDK Installation

The NDI Bridge requires the NDI SDK to be installed on your system.

#### Linux (Development)

1. Download NDI SDK from [https://ndi.video/for-developers/ndi-sdk/](https://ndi.video/for-developers/ndi-sdk/)
2. Extract and install manually:
   ```bash
   # Extract the SDK
   tar -xzf Install_NDI_SDK_v5_Linux.tar.gz
   cd "NDI SDK for Linux"
   
   # Manual installation (if installer fails)
   sudo mkdir -p /usr/local/ndi-sdk
   sudo cp -r * /usr/local/ndi-sdk/
   sudo cp /usr/local/ndi-sdk/lib/x86_64-linux-gnu/libndi.so.5.6.1 /usr/local/lib/
   sudo ln -sf /usr/local/lib/libndi.so.5.6.1 /usr/local/lib/libndi.so.5
   sudo ln -sf /usr/local/lib/libndi.so.5 /usr/local/lib/libndi.so
   sudo cp -r /usr/local/ndi-sdk/include/* /usr/local/include/
   sudo ldconfig
   ```
3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   # Note: ndi-python may fail to build, use C++ executables instead
   ```

#### Windows

1. Download and install NDI SDK from the official website
2. Install Python NDI wrapper:
   ```bash
   pip install ndi-python
   ```

#### Docker

The Docker image automatically downloads and installs the NDI SDK during build.

### OBS Studio NDI Plugin

Install the NDI plugin for OBS Studio to receive NDI sources:

- **Linux**: Build from source (recommended):
  ```bash
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
- **Windows**: Download from [OBS NDI Plugin](https://github.com/obs-ndi/obs-ndi/releases)

## Installation

### Option 1: Docker (Recommended)

1. Clone the repository and navigate to the project root
2. Start the NDI Bridge with Docker Compose:
   ```bash
   docker-compose up ndi-bridge
   ```

### Option 2: Local Installation

1. Install Python dependencies:
   ```bash
   cd ndi-bridge
   pip install -r requirements.txt
   ```

2. Create environment file:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Run the service:
   ```bash
   # Using the run script (recommended)
   python run_ndi_bridge.py
   
   # Or directly
   python src/main.py
   ```

### Option 3: Manual Testing (Current Working Setup)

For testing and development, you can run individual NDI sources manually:

1. **Test NDI Source (Rainbow Pattern)**:
   ```bash
   cd ndi-bridge
   ./create_ndi_source "FEDORA (Test_NDI_Source)" 1280 720 30
   ```

2. **Mobile-like NDI Source (Simulation)**:
   ```bash
   cd ndi-bridge
   ./simple_real_mobile "FEDORA (Real_Mobile_Camera)" 1280 720 30
   ```

3. **Real Mobile Camera NDI Source**:
   ```bash
   cd ndi-bridge
   source venv/bin/activate
   python create_real_mobile_ndi.py
   ```

**Note**: The main NDI bridge service may have issues with the C++ executable approach. Use the manual testing approach for reliable NDI source creation.

## Configuration

The NDI Bridge can be configured using environment variables or a `.env` file:

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:3001` | Backend HTTP URL |
| `BACKEND_WS_URL` | `ws://localhost:3001` | Backend WebSocket URL |
| `NDI_SOURCE_PREFIX` | `MobileCam` | Prefix for NDI source names |
| `NDI_BRIDGE_PORT` | `8000` | NDI Bridge API port |
| `NDI_BRIDGE_HOST` | `0.0.0.0` | NDI Bridge API host |
| `MAX_STREAMS` | `10` | Maximum simultaneous streams |
| `FRAME_BUFFER_SIZE` | `10` | Frame buffer size per stream |
| `AUTO_CONSUME` | `true` | Automatically consume new streams |
| `DEFAULT_WIDTH` | `1280` | Default video width |
| `DEFAULT_HEIGHT` | `720` | Default video height |
| `DEFAULT_FPS` | `30` | Default video FPS |
| `PROCESSING_QUALITY` | `high` | Processing quality (low/medium/high) |
| `LOG_LEVEL` | `INFO` | Logging level |

### Example Configuration

```bash
# Backend Configuration
BACKEND_URL=http://192.168.100.19:3001
BACKEND_WS_URL=ws://192.168.100.19:3001

# NDI Configuration
NDI_SOURCE_PREFIX=MobileCam
NDI_BRIDGE_PORT=8000

# Stream Configuration
MAX_STREAMS=10
AUTO_CONSUME=true

# Video Configuration
DEFAULT_WIDTH=1280
DEFAULT_HEIGHT=720
DEFAULT_FPS=30

# Performance
PROCESSING_QUALITY=high
LOG_LEVEL=INFO
```

## Usage

### Starting the Service

1. Ensure the Mobile Camera Receptor backend is running
2. Start the NDI Bridge:
   ```bash
   # Docker
   docker-compose up ndi-bridge
   
   # Local
   python src/main.py
   ```

3. The service will automatically connect to the backend and start consuming streams

### Using NDI Sources

1. Open OBS Studio or your preferred NDI-compatible software
2. Add an NDI Source
3. Look for sources with names like:
   - `MobileCam_DeviceName`
   - `MobileCam_iPhone_12`
   - `MobileCam_Android_Device`

### API Endpoints

The NDI Bridge provides a REST API for monitoring and control:

- `GET /health` - Health check
- `GET /streams` - List active streams
- `GET /streams/{stream_id}` - Get stream details
- `POST /streams/{stream_id}/stop` - Stop a stream
- `GET /stats` - Get detailed statistics
- `GET /config` - Get current configuration

### Example API Usage

```bash
# Check health
curl http://localhost:8000/health

# List streams
curl http://localhost:8000/streams

# Get stream details
curl http://localhost:8000/streams/stream-123

# Stop a stream
curl -X POST http://localhost:8000/streams/stream-123/stop
```

## Architecture

The NDI Bridge consists of several key components:

### Components

- **NDI Sender**: Handles sending video frames to NDI network
- **WebRTC Consumer**: Consumes WebRTC streams from backend
- **Stream Pipeline**: Processes frames from WebRTC to NDI
- **Stream Manager**: Manages multiple streams and their lifecycle
- **WebSocket Signaling**: Communicates with backend via WebSocket

### Data Flow

```
Mobile Device → Backend → NDI Bridge → NDI Network → OBS Studio
     ↓              ↓           ↓           ↓
  WebRTC        Mediasoup    Processing   NDI Sources
```

## Performance

### Targets

- **Latency**: <500ms end-to-end
- **CPU Usage**: <10% per stream
- **Memory**: Efficient memory management
- **Concurrent Streams**: 5+ simultaneous streams

### Optimization

- Frame buffering (20-50ms)
- Hardware acceleration when available
- Zero-copy operations where possible
- Efficient color space conversion

## Troubleshooting

### Common Issues

#### NDI Sources Not Appearing

1. Check NDI SDK installation:
   ```bash
   python -c "import NDIlib; print('NDI SDK available')"
   ```

2. Verify OBS Studio NDI plugin is installed
3. Check network connectivity between NDI Bridge and OBS Studio

#### Connection Issues

1. Verify backend is running and accessible
2. Check WebSocket URL configuration
3. Review logs for connection errors

#### Performance Issues

1. Reduce `PROCESSING_QUALITY` to "medium" or "low"
2. Decrease `FRAME_BUFFER_SIZE`
3. Check system resources (CPU, memory)

### Logs

The service provides detailed logging. Check logs for:

- Connection status
- Stream lifecycle events
- Performance metrics
- Error messages

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=DEBUG python src/main.py
```

## Development

### Running Tests

```bash
cd ndi-bridge
python -m pytest tests/ -v
```

### Code Structure

```
ndi-bridge/
├── src/
│   ├── config/          # Configuration management
│   ├── ndi/            # NDI sender and converter
│   ├── webrtc/         # WebRTC consumer and signaling
│   ├── processing/     # Stream pipeline
│   ├── services/       # Stream manager
│   └── main.py         # Main entry point
├── tests/              # Integration tests
├── requirements.txt    # Python dependencies
├── .env.example       # Environment configuration
└── README.md          # This file
```

### Adding New Features

1. Create feature branch
2. Implement changes
3. Add tests
4. Update documentation
5. Submit pull request

## License

This project is part of the Mobile Camera Receptor system. See the main project for license information.

## Support

For issues and questions:

1. Check this documentation
2. Review logs for error messages
3. Check the main project issues
4. Create a new issue with detailed information

## Changelog

### Version 1.0.0

- Initial release
- WebRTC to NDI conversion
- Multi-stream support
- Docker integration
- REST API
- Automatic stream discovery
