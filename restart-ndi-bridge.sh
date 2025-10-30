#!/bin/bash

echo "🔄 Restarting NDI Bridge to fix stream consumption..."

# Stop all NDI Bridge processes
pkill -f "python.*main.py" 2>/dev/null
sleep 3

# Set environment variables
export BACKEND_URL=https://192.168.100.19:3001
export BACKEND_WS_URL=wss://192.168.100.19:3001
export NDI_SOURCE_PREFIX=MobileCam
export AUTO_CONSUME=true
export LOG_LEVEL=INFO

echo "🚀 Starting NDI Bridge..."

# Start NDI Bridge
cd ndi-bridge
python src/main.py &

# Wait for startup
sleep 8

# Check status
echo "📊 Checking NDI Bridge status..."
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ NDI Bridge is running"
    
    # Check streams
    echo "📋 Active streams:"
    curl -s http://localhost:8000/streams | jq .
    
    echo ""
    echo "🎯 NOW TEST OBS STUDIO:"
    echo "1. Open OBS Studio"
    echo "2. Add NDI Source"
    echo "3. Look for 'MobileCam_*' sources"
    echo "4. If sources appear, select one and add to scene"
    
else
    echo "❌ NDI Bridge failed to start"
fi
