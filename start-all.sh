#!/bin/bash

echo "🚀 Starting all services..."

# ---------------------------------------------------------------
# Step 1: Detect LAN IP
# ---------------------------------------------------------------
echo "[INFO] Detecting LAN IP address..."

if command -v ip &> /dev/null && ip route get 1 &>/dev/null 2>&1; then
    DETECTED_IP=$(ip route get 1 | awk '{print $NF; exit}' 2>/dev/null)
elif command -v hostname &> /dev/null; then
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
else
    DETECTED_IP=""
fi

if [ -z "$DETECTED_IP" ]; then
    DETECTED_IP="127.0.0.1"
fi

echo "   Detected IP: $DETECTED_IP"

# ---------------------------------------------------------------
# Step 2: Check SSL certificates
# ---------------------------------------------------------------
echo ""
if [ ! -f "cert.pem" ] || [ ! -f "key.pem" ]; then
    echo "📋 SSL certificates not found. Generating..."
    ./generate-certs.sh "$DETECTED_IP"
    echo ""
elif command -v openssl &> /dev/null; then
    CERT_CN=$(openssl x509 -in cert.pem -noout -subject 2>/dev/null | grep -oP 'CN=\K[^, ]+')
    if [ "$CERT_CN" != "$DETECTED_IP" ] && [ "$CERT_CN" != "localhost" ]; then
        echo "📋 SSL certificate CN ($CERT_CN) does not match detected IP ($DETECTED_IP). Regenerating..."
        ./generate-certs.sh "$DETECTED_IP"
        echo ""
    else
        echo "✅ SSL certificates match current IP."
    fi
else
    echo "⚠️  openssl not found — cannot verify certificates."
fi

# Start backend
./start-backend.sh &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start frontend
./start-frontend.sh &
FRONTEND_PID=$!

echo "✅ All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "🌐 Frontend: https://${DETECTED_IP}:3000"
echo "🔧 Backend: https://${DETECTED_IP}:3001"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Stopping all services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for all processes
wait
