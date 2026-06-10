> Note: Examples use 192.168.100.11 (Windows host). If you clone on another machine, replace with that machine's LAN IP.

### Manual run commands (Git Bash)

Run each service in its own Git Bash window.

#### Backend (HTTPS, Mediasoup)
```bash
cd /e/Proyectos/mobileCameraReceptor/backend
export NODE_ENV=development
export MEDIASOUP_ANNOUNCED_IP=192.168.100.11
npm run dev
```

Quick check:
```bash
curl -k https://192.168.100.11:3001/api/rtp-capabilities | jq . | head
```

#### Frontend (HTTPS)
```bash
cd /e/Proyectos/mobileCameraReceptor/frontend
npm run dev:https
# Alternative (equivalent):
# NODE_ENV=development node server.js
```

Open dashboard:
```
https://192.168.100.11:3000
```

#### NDI Bridge (Windows, Git Bash + MSYS2 Python)
```bash
cd /e/Proyectos/mobileCameraReceptor/ndi-bridge

# Backend URLs + trust self-signed cert
export BACKEND_URL="https://192.168.100.11:3001"
export BACKEND_WS_URL="wss://192.168.100.11:3001"
export SSL_CERT_FILE="/e/Proyectos/mobileCameraReceptor/backend/cert.pem"
export REQUESTS_CA_BUNDLE="/e/Proyectos/mobileCameraReceptor/backend/cert.pem"

# GStreamer + NDI on PATH (MSYS2 + NDI 6 Runtime)
export PATH="/c/msys64/mingw64/bin:/c/Program Files/NDI/NDI 6 Runtime/Bin/x64:$PATH"
export GI_TYPELIB_PATH="/c/msys64/mingw64/lib/girepository-1.0"
export GST_PLUGIN_PATH="/c/msys64/mingw64/lib/gstreamer-1.0"
export GST_PLUGIN_SYSTEM_PATH="/c/msys64/mingw64/lib/gstreamer-1.0"

# Prefer native SDK sender, disable ffmpeg fallback
export NDI_PREFERRED="ctypes"
export NDI_DISABLE_FFMPEG="1"

# UTF-8 console
export PYTHONUTF8=1
export PYTHONIOENCODING="utf-8"

# Start the bridge with MSYS2 Python
"/c/msys64/mingw64/bin/python.exe" src/main.py
```

---

## Shortcut for ndi-bridge

```bash
cd /e/Proyectos/mobileCameraReceptor/ndi-bridge

export BACKEND_URL="https://192.168.100.11:3001"
export BACKEND_WS_URL="wss://192.168.100.11:3001"
export SSL_CERT_FILE="/e/Proyectos/mobileCameraReceptor/backend/cert.pem"
export REQUESTS_CA_BUNDLE="/e/Proyectos/mobileCameraReceptor/backend/cert.pem"

export PATH="/c/msys64/mingw64/bin:/c/Program Files/NDI/NDI 6 Runtime/Bin/x64:$PATH"
export GI_TYPELIB_PATH="/c/msys64/mingw64/lib/girepository-1.0"
export GST_PLUGIN_PATH="/c/msys64/mingw64/lib/gstreamer-1.0"
export GST_PLUGIN_SYSTEM_PATH="/c/msys64/mingw64/lib/gstreamer-1.0"

export NDI_PREFERRED="ctypes"
export NDI_DISABLE_FFMPEG="1"

export PYTHONUTF8=1
export PYTHONIOENCODING="utf-8"

"/c/msys64/mingw64/bin/python.exe" src/main.py
```


Health endpoint:
```bash
curl http://localhost:8000/health/detailed | jq .
```

Expected:
- `components.ndi_sdk.available: true`
- While streaming from phone, `streams[...].frame_count` should increase.

#### Notes
- Ensure Windows Firewall allows inbound UDP 10000-12000 (WebRTC workers) and 30000-31000 (PlainTransport to NDI bridge).
- Frontend and Backend must run over HTTPS/WSS at `192.168.100.11`.
- Start the phone stream first, then refresh the dashboard if a preview is blank initially.


how to run the script to change the ip::

`chmod +x scripts/switch-network.sh`

`./scripts/switch-network.sh 192.168.x.y`