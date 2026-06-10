# Windows Setup Guide

## Prerequisites

### 1. Install Node.js
- Download from: https://nodejs.org/
- Install LTS version (18.x or 20.x)
- Verify: `node --version` and `npm --version`

### 2. Install Python
- Download from: https://www.python.org/downloads/
- Install Python 3.11 (recommended for NDI compatibility)
- **Important**: Check "Add Python to PATH" during installation
- Verify: `python --version`

### 3. Install NDI SDK for Windows
- Download from: https://www.newtek.com/ndi/sdk/
- Install NDI SDK 5.x for Windows
- Note the installation path (usually `C:\Program Files\NewTek\NDI 5 SDK`)

### 4. Install Visual Studio Build Tools
- Download from: https://visualstudio.microsoft.com/downloads/
- Install "Build Tools for Visual Studio 2022"
- Select "C++ build tools" workload
- This is required for Python packages with C extensions

## Setup Instructions

### 1. Clone Repository
```bash
git clone https://github.com/Stefan-migo/MCR.git
cd MCR
```

### 2. Install Backend Dependencies
```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies
```bash
cd ../frontend
npm install
```

### 4. Install NDI Bridge Dependencies
```bash
cd ../ndi-bridge
pip install -r requirements.txt
```

### 5. Configure Environment
```bash
# Copy environment file
copy .env.example .env

# Edit .env file with your Windows IP address
# Replace 192.168.100.19 with your Windows machine IP
```

## Testing NDI-Python on Windows

### Test 1: Basic NDI Import
```bash
cd ndi-bridge
python -c "import ndi; print('NDI import successful')"
```

### Test 2: NDI SDK Detection
```bash
python -c "import ndi; print('NDI SDK available:', ndi.initialize())"
```

### Test 3: Create NDI Source
```bash
python test_ndi_installation.py
```

## Running the Project

### Option A: Native (Test NDI-Python)
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev

# Terminal 3 - NDI Bridge
cd ndi-bridge
python src/main.py
```

### Option B: Docker (Recommended)
```bash
# Run all services in Docker
docker-compose up
```

## Expected Results

### If NDI-Python Works:
- You should see NDI sources in OBS Studio
- Mobile camera stream should appear in OBS

### If NDI-Python Fails:
- You'll see "Could not allocate capsule object!" error
- Test patterns will still work in OBS Studio
- This confirms the environment issue

## Troubleshooting

### Common Issues:
1. **Python not found**: Add Python to PATH
2. **Build tools missing**: Install Visual Studio Build Tools
3. **NDI SDK not found**: Check installation path
4. **Port conflicts**: Kill processes using ports 3000, 3001, 8000

### Network Configuration:
- Ensure Windows Firewall allows ports 3000, 3001, 8000
- Use your Windows machine's IP address in .env files
- Test mobile connection from same network

## Next Steps

After testing:
1. Report results (NDI-Python working/failing)
2. If working: We can proceed with real video integration
3. If failing: We'll use Docker solution for cross-platform deployment
