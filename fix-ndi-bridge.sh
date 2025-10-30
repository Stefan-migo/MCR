#!/bin/bash

echo "🔧 Fixing NDI Bridge connection..."

# Stop existing NDI Bridge
pkill -f "python.*main.py" 2>/dev/null
sleep 2

# Set environment variables for NDI Bridge
export BACKEND_URL=https://192.168.100.19:3001
export BACKEND_WS_URL=wss://192.168.100.19:3001
export NDI_SOURCE_PREFIX=MobileCam
export AUTO_CONSUME=true
export LOG_LEVEL=DEBUG

echo "📋 Environment variables set:"
echo "   BACKEND_URL: $BACKEND_URL"
echo "   BACKEND_WS_URL: $BACKEND_WS_URL"
echo "   NDI_SOURCE_PREFIX: $NDI_SOURCE_PREFIX"
echo "   AUTO_CONSUME: $AUTO_CONSUME"

# Start NDI Bridge with debug logging
echo "🚀 Starting NDI Bridge with debug logging..."
cd ndi-bridge
python src/main.py &

# Wait for startup
sleep 5

# Check if it's running
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ NDI Bridge started successfully"
    echo "📊 Health status:"
    curl -s http://localhost:8000/health | jq .
    
    echo ""
    echo "🎯 Next steps:"
    echo "1. Check OBS Studio for NDI sources named 'MobileCam_*'"
    echo "2. If no sources appear, check the logs above for connection errors"
    echo "3. The NDI Bridge should automatically detect the 2 active streams"
    
else
    echo "❌ NDI Bridge failed to start"
    echo "   Check the logs above for errors"
fi
