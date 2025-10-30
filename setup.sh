#!/bin/bash

# Mobile Camera Receptor - Dynamic Setup Script
# This script automatically detects your IP and starts the services

echo "🚀 Mobile Camera Receptor - Dynamic Setup"
echo "========================================"

# Detect IP address
if command -v ip &> /dev/null; then
    HOST_IP=$(ip route get 1.1.1.1 | awk '{print $7; exit}')
elif command -v hostname &> /dev/null; then
    HOST_IP=$(hostname -I | awk '{print $1}')
else
    HOST_IP="localhost"
fi

echo "📍 Detected IP: $HOST_IP"
echo ""

# Export the IP for docker-compose
export HOST_IP

# Start services
echo "🐳 Starting Docker services..."
docker-compose -f docker-complete.yml down
docker-compose -f docker-complete.yml up -d

echo ""
echo "✅ Services started!"
echo ""
echo "📱 Mobile Camera: https://$HOST_IP:3000/stream"
echo "🖥️  Dashboard:     https://$HOST_IP:3000/dashboard"
echo "🔧 API:           https://$HOST_IP:3001/api/rtp-capabilities"
echo ""
echo "📋 OBS Studio:"
echo "   - Look for NDI source: 'FEDORA (MobileCam_Device 1000)'"
echo "   - Or use local files in /tmp/ directory"
echo ""
echo "🛑 To stop: docker-compose -f docker-complete.yml down"
