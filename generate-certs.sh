#!/bin/bash

# Generate SSL certificates for HTTPS development
# This script creates self-signed certificates for local network access

IP_ADDRESS="${1:-192.168.100.19}"

echo "🔒 Generating SSL certificates for HTTPS..."
echo "   IP Address: $IP_ADDRESS"
echo ""

# Check if openssl is installed
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: openssl is not installed"
    echo "   Install it with: sudo dnf install openssl (Fedora) or sudo apt-get install openssl (Ubuntu)"
    exit 1
fi

# Generate certificate in root directory
if [ ! -f "cert.pem" ] || [ ! -f "key.pem" ]; then
    echo "📝 Generating new SSL certificates..."
    openssl req -x509 -newkey rsa:4096 \
        -keyout key.pem \
        -out cert.pem \
        -days 365 \
        -nodes \
        -subj "/C=US/ST=State/L=City/O=MobileCameraReceptor/CN=$IP_ADDRESS" \
        -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:$IP_ADDRESS,IP:0.0.0.0"
    
    if [ $? -eq 0 ]; then
        echo "✅ SSL certificates generated successfully!"
        echo ""
        echo "📋 Certificate details:"
        openssl x509 -in cert.pem -noout -subject -dates
    else
        echo "❌ Error generating SSL certificates"
        exit 1
    fi
else
    echo "✅ SSL certificates already exist"
    echo ""
    echo "📋 Certificate details:"
    openssl x509 -in cert.pem -noout -subject -dates
fi

# Copy certificates to backend and frontend directories
echo ""
echo "📂 Copying certificates to backend and frontend..."

if [ -f "cert.pem" ] && [ -f "key.pem" ]; then
    # Copy to backend
    if [ -d "backend" ]; then
        cp cert.pem key.pem backend/ 2>/dev/null && echo "   ✅ Backend" || echo "   ⚠️  Backend directory not found"
    fi
    
    # Copy to frontend
    if [ -d "frontend" ]; then
        cp cert.pem key.pem frontend/ 2>/dev/null && echo "   ✅ Frontend" || echo "   ⚠️  Frontend directory not found"
    fi
    
    echo ""
    echo "🎉 SSL certificates ready for HTTPS!"
    echo ""
    echo "⚠️  IMPORTANT: These are self-signed certificates for development."
    echo "   Your browser will show a security warning - this is normal."
    echo "   Click 'Advanced' → 'Proceed to site' to continue."
else
    echo "❌ Certificate files not found after generation"
    exit 1
fi

