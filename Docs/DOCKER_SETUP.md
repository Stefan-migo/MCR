# Docker Setup Guide

## Prerequisites

### Install Docker Desktop
- **Windows**: Download from https://www.docker.com/products/docker-desktop/
- **Linux**: Install Docker Engine and Docker Compose
- **macOS**: Download from https://www.docker.com/products/docker-desktop/

### Verify Installation
```bash
docker --version
docker-compose --version
```

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/Stefan-migo/MCR.git
cd MCR
```

### 2. Run with Docker Compose
```bash
# Start all services
docker-compose up

# Or run in background
docker-compose up -d
```

### 3. Access Services
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001
- **NDI Bridge**: http://localhost:8000

## Development Mode

### With Volume Mounting (Recommended)
```bash
# This mounts your local code into containers for development
docker-compose up --build
```

### Benefits:
- ✅ Code changes reflect immediately
- ✅ No need to rebuild containers
- ✅ Easy debugging

## Production Mode

### Build and Run
```bash
# Build all images
docker-compose build

# Run in production mode
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Common Issues:

#### 1. Port Conflicts
```bash
# Check what's using ports
netstat -tulpn | grep -E ":(3000|3001|8000)"

# Kill processes if needed
sudo kill -9 <PID>
```

#### 2. Permission Issues (Linux)
```bash
# Fix output directory permissions
sudo chown -R $USER:$USER ./output
```

#### 3. Docker Build Failures
```bash
# Clean build
docker-compose build --no-cache

# Remove old containers
docker-compose down
docker system prune -f
```

### View Logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs ndi-bridge
docker-compose logs backend
docker-compose logs frontend
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Cross-Platform Benefits

### ✅ **Consistent Environment**
- Same Python version (3.11)
- Same Node.js version (18)
- Same system dependencies

### ✅ **NDI Compatibility**
- FFmpeg with libopenh264
- No NDI-Python dependency issues
- Works on Windows, Linux, macOS

### ✅ **Easy Deployment**
- Single command to start everything
- No local environment setup needed
- Portable across different machines

## File Structure
```
MCR/
├── docker-compose.yml          # Main Docker configuration
├── backend/
│   └── Dockerfile              # Backend container
├── frontend/
│   └── Dockerfile              # Frontend container
├── ndi-bridge/
│   └── Dockerfile              # NDI Bridge container
└── output/                     # MPEG-TS files (mounted volume)
```

## Next Steps

1. **Test on Windows**: Run `docker-compose up` on Windows
2. **Test on Linux**: Run `docker-compose up` on Linux
3. **Verify Cross-Platform**: Ensure same behavior everywhere
4. **Fix RTP Reception**: Focus on real video data flow
