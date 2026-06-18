# VPS Deployment Guide — Mobile Camera Receptor

> **Target**: Ubuntu VPS (Kamatera)  
> **Goal**: Run Backend + Frontend + NDI Bridge on the VPS  
> **Local machine**: Runs NDI Bridge (NewTek) to receive NDI sources in Resolume/OBS

---

## Architecture Overview

```
📱 Mobile phones (any network — 4G, WiFi)
   │  WebRTC + Socket.io
   ▼
🌍 VPS (Kamatera — Ubuntu, Docker)
   ├── Backend (port 3001) — mediasoup WebRTC + signaling
   ├── Frontend (port 3000) — Next.js dashboard
   └── NDI Bridge (Python) — WebRTC → NDI conversion (localhost media)
        │
        │ NDI output on ports 5960-5999 TCP/UDP
        ▼
   NDI source: "MCR-<deviceId>" (reachable via VPS public IP)

        ▲ NDI Bridge (NewTek) — TCP connection
        │
💻 Local PC (institutional WiFi, UDP blocked)
   └── Resolume / OBS → receives NDI via TCP
```

**Key insight**: WebRTC media stays inside the VPS (localhost between backend and bridge). The VPS has full UDP access. Your local PC connects to NDI sources over **TCP**, which works even on restrictive WiFi.

---

## Prerequisites

- Ubuntu 22.04+ VPS with root/sudo access
- Docker & Docker Compose installed
- DuckDNS domain pointing to VPS public IP
- Ports open in VPS firewall (see below)
- NDI SDK runtime for Linux (installed in Docker image)

---

## Firewall / Security Group (Kamatera)

Open these ports in the VPS firewall / security group:

| Port(s) | Protocol | Purpose |
|---------|----------|---------|
| `3001` | TCP | Backend API + Socket.io signaling |
| `3000` | TCP | Frontend dashboard (or via reverse proxy) |
| `5960-5999` | TCP + UDP | NDI output (for remote NDI receivers) |
| `20000-21000` | UDP | mediasoup WebRTC media |

Optional:
- `22` TCP — SSH access
- `80` / `443` TCP — if using reverse proxy (Caddy/Nginx)

---

## Deployment Steps

### 1. Clone the repository

```bash
git clone https://github.com/Stefan-migo/MCR.git /opt/mcr
cd /opt/mcr
```

### 2. Build and start with Docker Compose

```bash
# Backend
cd backend
docker build -t mcr-backend -f Dockerfile.ubuntu .
docker run -d \
  --name mcr-backend \
  --restart unless-stopped \
  -p 3001:3001 \
  -p 20000-21000:20000-21000/udp \
  -v $(pwd)/.env.local:/app/.env.local \
  mcr-backend

# Frontend
cd ../frontend
docker build -t mcr-frontend -f Dockerfile .
docker run -d \
  --name mcr-frontend \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://<tu-dominio>.duckdns.org:3001 \
  -e NEXT_PUBLIC_WS_URL=wss://<tu-dominio>.duckdns.org:3001 \
  mcr-frontend
```

### 3. NDI Bridge (Docker)

First, build the bridge image with NDI SDK:

```bash
cd ../ndi-bridge

# Build Docker image with NDI SDK
docker build -t mcr-ndi-bridge -f - . <<'DOCKERFILE'
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    ffmpeg libavcodec-extra gcc wget \
    && rm -rf /var/lib/apt/lists/*

# Install NDI SDK runtime
RUN wget -q https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v5_Linux.sh && \
    chmod +x Install_NDI_SDK_v5_Linux.sh && \
    yes | ./Install_NDI_SDK_v5_Linux.sh && \
    rm Install_NDI_SDK_v5_Linux.sh && \
    ldconfig

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 5960-5999
EXPOSE 9999

CMD ["python", "-m", "src.bridge"]
DOCKERFILE

docker run -d \
  --name mcr-ndi-bridge \
  --restart unless-stopped \
  --network host \
  -e NDI_BACKEND_URL=https://localhost:3001 \
  -e NDI_SSL_VERIFY=false \
  mcr-ndi-bridge
```

> ⚠️ **Note on NDI SDK download URL**: The NDI SDK download link may change. Visit https://ndi.video/sdk/ to get the latest URL if the one above fails.

> **Note on `--network host`**: The NDI bridge needs host networking so NDI sources are discoverable on the network and NDI TCP ports work correctly.

### 4. Verify everything is running

```bash
docker ps
# Should show 3 containers: mcr-backend, mcr-frontend, mcr-ndi-bridge

# Check backend health
curl http://localhost:3001/health

# Check bridge health
curl http://localhost:9999/health
```

### 5. Environment configuration

Create `backend/.env.local` on the VPS:

```env
NODE_ENV=production
BACKEND_PORT=3001
BACKEND_HOST=0.0.0.0
NDI_BRIDGE_ENABLED=true
CORS_ORIGIN=https://<tu-dominio>.duckdns.org:3000,http://localhost:3000
```

The CORS origin **must** include your DuckDNS domain so the frontend (on :3000) can reach the backend (on :3001).

---

## Connection Flow — Complete

```
1. Mobile opens https://frontend:3000/stream
2. Mobile connects to backend :3001 via Socket.io (WebSocket)
3. Mobile starts sending WebRTC video to backend (mediasoup)
4. Backend emits 'stream-started' event on /ndi-bridge namespace
5. NDI Bridge receives event, creates WebRTC consumer (localhost → localhost)
6. Bridge decodes H.264 frames via aiortc
7. Bridge pushes frames to NDI SDK → NDI source "MCR-XXXXXXXX"
8. NDI source available on VPS public IP, ports 5960-5999

TO CONSUME ON LOCAL PC:
9. Install NDI Bridge (NewTek) on local Windows machine
10. Connect NDI Bridge to VPS IP
11. Resolume/OBS sees NDI sources as if local
```

---

## Local Machine Setup (Windows, institutional WiFi)

### Install NDI Bridge (NewTek)

1. Download from: https://ndi.video/tools/
2. Install **NDI Bridge**
3. Open NDI Bridge → **Connect to remote**
4. Enter VPS public IP → Port `5960`
5. The bridge will list available NDI sources (`MCR-XXXXXXXX`)
6. Enable the ones you want
7. Open Resolume → Add **NDI Source** → select the source

**No UDP ports needed on your local network** — NDI Bridge uses TCP for the remote connection.

### Alternative: Direct connection in Resolume

If Resolume doesn't auto-discover the VPS NDI sources:
- Use NDI Studio Monitor to connect to `tcp://VPS_IP:5960`
- Or add NDI source by IP in Resolume's advanced input settings

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| NDI Bridge can't find VPS sources | VPS firewall blocking 5960-5999 | Open ports on Kamatera firewall |
| Mobile can't connect to backend | DuckDNS not resolving, or port 3001 blocked | Check DNS + firewall |
| NDI Bridge container crashes | NDI SDK not installed in container | Check Docker build logs |
| No video in Resolume | NDI Bridge not connected, or no mobile streaming | Check bridge health at :9999/health |
| WebRTC "ICE failed" | UDP ports 20000-21000 not open | Open UDP range on firewall |

---

## Maintenance

```bash
# View logs
docker logs mcr-backend -f
docker logs mcr-ndi-bridge -f
docker logs mcr-frontend -f

# Restart services
docker restart mcr-ndi-bridge

# Update from latest code
cd /opt/mcr
git pull
# Rebuild + restart as needed
```
