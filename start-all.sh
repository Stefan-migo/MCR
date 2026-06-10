#!/bin/bash

# Start all services in background
echo "🚀 Starting all services..."

# Check if SSL certificates exist, generate if not
if [ ! -f "cert.pem" ] || [ ! -f "key.pem" ]; then
    echo "📋 SSL certificates not found. Generating..."
    ./generate-certs.sh 192.168.0.138
    echo ""
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
echo "🌐 Frontend: https://192.168.0.138:3000"
echo "🔧 Backend: https://192.168.0.138:3001"
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
