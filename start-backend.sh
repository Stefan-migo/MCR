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
        echo "   Generate them with: openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=192.168.100.19' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.100.19'"
    fi
fi

export NODE_ENV=development
export HOST=0.0.0.0
export PORT=3001
export MEDIASOUP_ANNOUNCED_IP=192.168.100.19
export BACKEND_HOST=0.0.0.0
export BACKEND_PORT=3001

npm run dev
