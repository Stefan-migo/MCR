#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/switch-network.sh 192.168.100.11
NEW_IP="${1:-}"
if [ -z "$NEW_IP" ]; then
  echo "Usage: $0 <NEW_LAN_IP>"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Generating self-signed certs for $NEW_IP"
if [ -f ./generate-certs.sh ]; then
  ./generate-certs.sh "$NEW_IP"
else
  openssl req -x509 -newkey rsa:4096 \
    -keyout key.pem \
    -out cert.pem \
    -days 365 \
    -nodes \
    -subj "/C=US/ST=State/L=City/O=MobileCameraReceptor/CN=$NEW_IP" \
    -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1,IP:$NEW_IP,IP:0.0.0.0"
fi

echo "==> Copying certs into services"
cp -f cert.pem key.pem backend/ || true
cp -f cert.pem key.pem frontend/ || true

echo "==> Creating backend/run-backend.sh (Git Bash)"
cat > backend/run-backend.sh <<EOF
#!/usr/bin/env bash
set -e
cd "\$(dirname "\$0")"
export NODE_ENV=development
export MEDIASOUP_ANNOUNCED_IP=$NEW_IP
npm run dev
EOF
chmod +x backend/run-backend.sh

echo "==> Creating frontend/run-frontend.sh (Git Bash)"
cat > frontend/run-frontend.sh <<'EOF'
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
npm run dev:https
EOF
chmod +x frontend/run-frontend.sh

if [ -d "ndi-bridge" ]; then
  echo "==> Creating ndi-bridge/run-ndi-bridge.sh (Git Bash + MSYS2 Python)"
  cat > ndi-bridge/run-ndi-bridge.sh <<EOF
#!/usr/bin/env bash
set -e
cd "\$(dirname "\$0")"

export BACKEND_URL="https://$NEW_IP:3001"
export BACKEND_WS_URL="wss://$NEW_IP:3001"
export SSL_CERT_FILE="$ROOT_DIR/backend/cert.pem"
export REQUESTS_CA_BUNDLE="$ROOT_DIR/backend/cert.pem"

export PATH="/c/msys64/mingw64/bin:/c/Program Files/NDI/NDI 6 Runtime/Bin/x64:\$PATH"
export GI_TYPELIB_PATH="/c/msys64/mingw64/lib/girepository-1.0"
export GST_PLUGIN_PATH="/c/msys64/mingw64/lib/gstreamer-1.0"
export GST_PLUGIN_SYSTEM_PATH="/c/msys64/mingw64/lib/gstreamer-1.0"

export NDI_PREFERRED="ctypes"
export NDI_DISABLE_FFMPEG="1"

export PYTHONUTF8=1
export PYTHONIOENCODING="utf-8"

"/c/msys64/mingw64/bin/python.exe" src/main.py
EOF
  chmod +x ndi-bridge/run-ndi-bridge.sh
fi

echo "==> Done."
echo "Run each in its own Git Bash:"
echo "  ./backend/run-backend.sh"
echo "  ./frontend/run-frontend.sh"
echo "  ./ndi-bridge/run-ndi-bridge.sh   (optional)"
echo "Open dashboard: https://$NEW_IP:3000"