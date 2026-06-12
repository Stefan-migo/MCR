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
        echo "   Run from project root: ./generate-certs.sh <YOUR_LAN_IP>"
    fi
fi

export NODE_ENV=development

# Use HTTPS server if certificates exist, otherwise fallback to HTTP
if [ -f "key.pem" ] && [ -f "cert.pem" ]; then
    echo "🔒 Starting frontend with HTTPS..."
    npm run dev:https
else
    echo "⚠️  Starting frontend with HTTP (certificates not found)"
    npm run dev
fi
