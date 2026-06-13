#!/bin/bash
cd backend

# Ensure certificates exist
if [ ! -f "cert.pem" ] || [ ! -f "key.pem" ]; then
    # Try to copy from root directory
    if [ -f "../cert.pem" ] && [ -f "../key.pem" ]; then
        cp ../cert.pem ../key.pem ./
        echo "✅ Copied SSL certificates to backend"
    else
        echo "⚠️  WARNING: SSL certificates not found!"
        echo "   Generate them with: ./generate-certs.sh <YOUR_LAN_IP>"
    fi
fi

export NODE_ENV=development
export HOST=0.0.0.0
export PORT=3001
export BACKEND_HOST=0.0.0.0
export BACKEND_PORT=3001

npm run dev
