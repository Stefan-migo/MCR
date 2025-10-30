#!/bin/bash

# Local Development Setup Script
# This script sets up the project to run locally without Docker

set -e

echo "🚀 Setting up local development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    print_success "Node.js $(node --version) found"
}

# Check if Python is installed
check_python() {
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed. Please install Python 3.8+ first."
        exit 1
    fi
    
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
    print_success "Python $PYTHON_VERSION found"
}

# Check if FFmpeg is installed
check_ffmpeg() {
    if ! command -v ffmpeg &> /dev/null; then
        print_warning "FFmpeg is not installed. NDI bridge will use ndi-python only."
        print_warning "To install FFmpeg: sudo apt install ffmpeg (Ubuntu/Debian) or brew install ffmpeg (macOS)"
    else
        print_success "FFmpeg $(ffmpeg -version | head -n1 | cut -d' ' -f3) found"
    fi
}

# Generate SSL certificates for local development
generate_certificates() {
    print_status "Generating SSL certificates for local development..."
    
    if [ ! -f "key.pem" ] || [ ! -f "cert.pem" ]; then
        openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
            -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:192.168.100.19"
        print_success "SSL certificates generated"
    else
        print_success "SSL certificates already exist"
    fi
}

# Setup backend
setup_backend() {
    print_status "Setting up backend..."
    
    cd backend
    
    # Install dependencies
    if [ ! -d "node_modules" ]; then
        print_status "Installing backend dependencies..."
        npm install
    else
        print_success "Backend dependencies already installed"
    fi
    
    # Copy SSL certificates
    cp ../key.pem ../cert.pem ./
    
    # Create .env file for local development
    cat > .env.local << EOF
NODE_ENV=development
PORT=3001
MEDIASOUP_ANNOUNCED_IP=192.168.100.19
CORS_ORIGIN=http://localhost:3000,https://localhost:3000,http://192.168.100.19:3000,https://192.168.100.19:3000
EOF
    
    print_success "Backend setup complete"
    cd ..
}

# Setup frontend
setup_frontend() {
    print_status "Setting up frontend..."
    
    cd frontend
    
    # Install dependencies
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
    else
        print_success "Frontend dependencies already installed"
    fi
    
    # Copy SSL certificates
    cp ../key.pem ../cert.pem ./
    
    # Create .env.local file for local development
    cat > .env.local << EOF
NODE_ENV=development
NEXT_PUBLIC_API_URL=https://192.168.100.19:3001
NEXT_PUBLIC_WS_URL=wss://192.168.100.19:3001
EOF
    
    print_success "Frontend setup complete"
    cd ..
}

# Setup NDI bridge
setup_ndi_bridge() {
    print_status "Setting up NDI bridge..."
    
    cd ndi-bridge
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        print_status "Creating Python virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment and install dependencies
    print_status "Installing Python dependencies..."
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    
    # Create .env file for local development
    cat > .env.local << EOF
NDI_BRIDGE_HOST=0.0.0.0
NDI_BRIDGE_PORT=8000
BACKEND_URL=https://192.168.100.19:3001
BACKEND_WS_URL=wss://192.168.100.19:3001
LOG_LEVEL=DEBUG
NDI_SOURCE_PREFIX=MobileCamera
EOF
    
    print_success "NDI bridge setup complete"
    cd ..
}

# Create start scripts
create_start_scripts() {
    print_status "Creating start scripts..."
    
    # Backend start script
    cat > start-backend.sh << 'EOF'
#!/bin/bash
cd backend
export NODE_ENV=development
npm run dev
EOF
    chmod +x start-backend.sh
    
    # Frontend start script
    cat > start-frontend.sh << 'EOF'
#!/bin/bash
cd frontend
export NODE_ENV=development
npm run dev
EOF
    chmod +x start-frontend.sh
    
    # NDI bridge start script
    cat > start-ndi-bridge.sh << 'EOF'
#!/bin/bash
cd ndi-bridge
source venv/bin/activate
export PYTHONPATH=$PWD/src:$PYTHONPATH
python src/main.py
EOF
    chmod +x start-ndi-bridge.sh
    
    # Start all script
    cat > start-all.sh << 'EOF'
#!/bin/bash

# Start all services in background
echo "🚀 Starting all services..."

# Start backend
./start-backend.sh &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start NDI bridge
./start-ndi-bridge.sh &
NDI_PID=$!

# Wait a bit for NDI bridge to start
sleep 3

# Start frontend
./start-frontend.sh &
FRONTEND_PID=$!

echo "✅ All services started!"
echo "Backend PID: $BACKEND_PID"
echo "NDI Bridge PID: $NDI_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "🌐 Frontend: https://192.168.100.19:3000"
echo "🔧 Backend: https://192.168.100.19:3001"
echo "📡 NDI Bridge: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo "🛑 Stopping all services..."
    kill $BACKEND_PID $NDI_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for all processes
wait
EOF
    chmod +x start-all.sh
    
    print_success "Start scripts created"
}

# Main setup function
main() {
    print_status "Starting local development setup..."
    
    check_node
    check_python
    check_ffmpeg
    generate_certificates
    setup_backend
    setup_frontend
    setup_ndi_bridge
    create_start_scripts
    
    print_success "🎉 Local development setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Run: ./start-all.sh (to start all services)"
    echo "2. Or run services individually:"
    echo "   - Backend: ./start-backend.sh"
    echo "   - Frontend: ./start-frontend.sh"
    echo "   - NDI Bridge: ./start-ndi-bridge.sh"
    echo ""
    echo "🌐 Access URLs:"
    echo "   - Frontend: https://192.168.100.19:3000"
    echo "   - Backend: https://192.168.100.19:3001"
    echo "   - NDI Bridge: http://localhost:8000"
    echo ""
    echo "📱 Mobile access: https://192.168.100.19:3000"
    echo "   (Accept the self-signed certificate warning)"
}

# Run main function
main "$@"
