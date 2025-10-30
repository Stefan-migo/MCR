### Manual run commands (Git Bash)

Run each service in its own Git Bash window.

#### Backend (HTTPS, Mediasoup)
```bash
cd /e/Proyectos/mobileCameraReceptor/backend
export NODE_ENV=development
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

#### NDI Bridge
```bash
cd /e/Proyectos/mobileCameraReceptor/ndi-bridge
source venv/Scripts/activate
export LOG_LEVEL=DEBUG
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

# Normal start
python src/main.py

# If NDI 6 runtime is installed system-wide but SDK 5 is also present,
# start with SDK 5 DLLs forced (use this instead of the normal start):
export PYTHONPATH=./src
python - <<'PY'
import os, runpy
# Ensure project modules import correctly when running via here-doc
os.environ.setdefault('PYTHONPATH', os.getcwd()+os.sep+'src')
# Force-load NDI 5 DLLs for this process only
os.add_dll_directory(r"C:\\Program Files\\NDI\\NDI 5 SDK\\Bin\\x64")
runpy.run_module("main", run_name="__main__")
PY
```

Health endpoint:
```bash
curl http://localhost:8000/health/detailed | jq .
```

Expected:
- `components.ndi_sdk.available: true`
- While streaming from phone, `streams[...].frame_count` should increase.

#### Notes
- Ensure Windows Firewall allows inbound UDP 10000-10100 (WebRTC) and, if used, 40000-40100 (PlainTransport).
- Frontend and Backend must run over HTTPS/WSS at `192.168.100.11`.
- Start the phone stream first, then refresh the dashboard if a preview is blank initially.


