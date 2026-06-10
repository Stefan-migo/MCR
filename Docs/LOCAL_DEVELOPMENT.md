# Local Development Setup

This guide shows how to run the Mobile Camera Receptor project locally without Docker for faster development.

## Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Python 3.8+** - [Download here](https://python.org/)
- **FFmpeg** (optional, for NDI fallback) - `sudo apt install ffmpeg` (Ubuntu) or `brew install ffmpeg` (macOS)
- **NDI SDK** (optional, for ndi-python) - [Download here](https://www.newtek.com/ndi/sdk/)

## Quick Start

1. **Run the setup script:**
   ```bash
   chmod +x setup-local-dev.sh
   ./setup-local-dev.sh
   ```

2. **Start all services:**
   ```bash
   ./start-all.sh
   ```

3. **Access the application:**
   - Frontend: https://192.168.100.19:3000
   - Backend: https://192.168.100.19:3001
   - NDI Bridge: http://localhost:8000

## Manual Setup

If you prefer to set up manually:

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy SSL certificates
cp ../key.pem ../cert.pem ./

# Create .env.local
cat > .env.local << EOF
NODE_ENV=development
PORT=3001
MEDIASOUP_ANNOUNCED_IP=192.168.100.19
CORS_ORIGIN=http://localhost:3000,https://localhost:3000,http://192.168.100.19:3000,https://192.168.100.19:3000
EOF

# Start backend
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy SSL certificates
cp ../key.pem ../cert.pem ./

# Create .env.local
cat > .env.local << EOF
NODE_ENV=development
NEXT_PUBLIC_API_URL=https://192.168.100.19:3001
NEXT_PUBLIC_WS_URL=wss://192.168.100.19:3001
EOF

# Start frontend
npm run dev
```

### 3. NDI Bridge Setup

```bash
cd ndi-bridge

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create .env.local
cat > .env.local << EOF
NDI_BRIDGE_HOST=0.0.0.0
NDI_BRIDGE_PORT=8000
BACKEND_URL=https://192.168.100.19:3001
BACKEND_WS_URL=wss://192.168.100.19:3001
LOG_LEVEL=DEBUG
NDI_SOURCE_PREFIX=MobileCamera
EOF

# Start NDI bridge
export PYTHONPATH=$PWD/src:$PYTHONPATH
python src/main.py
```

## Development Scripts

The setup creates several useful scripts:

- `./start-all.sh` - Start all services
- `./start-backend.sh` - Start only backend
- `./start-frontend.sh` - Start only frontend
- `./start-ndi-bridge.sh` - Start only NDI bridge

## SSL Certificates

The setup automatically generates self-signed SSL certificates for HTTPS support. You'll need to accept the security warning in your browser.

## Mobile Testing

1. Connect your mobile device to the same network
2. Visit: https://192.168.100.19:3000
3. Accept the security certificate warning
4. Test camera streaming

## Troubleshooting

### Backend Issues

```bash
# Check if backend is running
curl -k https://192.168.100.19:3001/api/streams

# Check backend logs
cd backend && npm run dev
```

### Frontend Issues

```bash
# Check if frontend is running
curl -k https://192.168.100.19:3000

# Check frontend logs
cd frontend && npm run dev
```

### NDI Bridge Issues

```bash
# Check if NDI bridge is running
curl http://localhost:8000/health

# Check NDI bridge logs
cd ndi-bridge
source venv/bin/activate
python src/main.py
```

### Port Conflicts

If you get port conflicts, you can change the ports in the respective `.env.local` files:

- Backend: Change `PORT=3001` to another port
- Frontend: Change the port in `package.json` scripts
- NDI Bridge: Change `NDI_BRIDGE_PORT=8000` to another port

## Development Workflow

1. **Make changes** to any service
2. **Restart the service** (Ctrl+C and run the start script again)
3. **Test changes** in the browser or mobile device
4. **Check logs** for any errors

## Performance Tips

- Use `npm run dev` for hot reloading
- Use `ts-node-dev` for backend TypeScript hot reloading
- Use `next dev` for frontend hot reloading
- Use `uvicorn` with `--reload` for Python hot reloading

## Production vs Development

- **Development**: Uses self-signed certificates, debug logging, hot reloading
- **Production**: Uses Docker, proper certificates, optimized builds, structured logging

## Next Steps

Once local development is working:

1. Test mobile camera streaming
2. Test NDI output in OBS Studio
3. Test multiple simultaneous streams
4. Deploy to production using Docker when ready
