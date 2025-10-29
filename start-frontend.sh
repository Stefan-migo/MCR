#!/bin/bash
cd frontend

# Ensure certificates exist
if [ ! -f "key.pem" ] || [ ! -f "cert.pem" ]; then
    # Try to copy from root directory
    if [ -f "../key.pem" ] && [ -f "../cert.pem" ]; then
        cp ../key.pem ../cert.pem ./
        echo "✅ Copied SSL certificates to frontend"
    else
        echo "⚠️  WARNING: SSL certificates not found!"
        echo "   Generate them with: openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=192.168.100.19' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.100.19'"
    fi
fi

export NODE_ENV=development
export NEXT_PUBLIC_API_URL=https://192.168.100.19:3001
export NEXT_PUBLIC_WS_URL=wss://192.168.100.19:3001

# Use HTTPS server if certificates exist, otherwise fallback to HTTP
if [ -f "key.pem" ] && [ -f "cert.pem" ]; then
    echo "🔒 Starting frontend with HTTPS..."
    npm run dev:https
else
    echo "⚠️  Starting frontend with HTTP (certificates not found)"
    npm run dev
fi
