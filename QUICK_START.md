# Quick Start Guide — Mobile Camera Receptor

## Requisitos

- Node.js 20+
- Python 3.11+
- Cloudflare Tunnel (`cloudflared`) — para exponer a internet
- NDI Tools (opcional, para NDI)

## Arrancar todo (ordenado)

Necesitás **4 terminales**. Arrancalas en este orden.

### 1. Backend

```bash
cd backend
NDI_BRIDGE_ENABLED=true npm run dev
```

Esperá a ver:
```
✅ Mediasoup router ready
🚀 Backend server running on https://0.0.0.0:3001
```

### 2. Cloudflare Tunnel — Backend

```bash
cloudflared tunnel --url https://localhost:3001 --no-tls-verify
```

Esperá a ver:
```
https://algo.trycloudflare.com
```
**Copiá esa URL** → la necesitás para el frontend.

### 3. Frontend

```bash
cd frontend
export NEXT_PUBLIC_API_URL="https://algo.trycloudflare.com"
export NEXT_PUBLIC_WS_URL="wss://algo.trycloudflare.com"
npm run dev
```

> **En Windows Git Bash**: usá `export`, no `$env:`

**En otra terminal**, exponé el frontend para tu iPhone:

```bash
cloudflared tunnel --url http://localhost:3000 --no-tls-verify
```
→ Copiá la URL: `https://otro.trycloudflare.com`

### 4. NDI Bridge

```bash
cd ndi-bridge
python -m src.bridge
```

Esperá a ver:
```
[Bridge] Connected to backend
[Bridge] Connected. Waiting for streams...
```

### Desde el iPhone

Abrí: `https://otro.trycloudflare.com`
→ Conectá un stream como cámara.

En la terminal del bridge deberías ver:
```
[Manager] Consume-stream requested for... (bridge at 127.0.0.1:XXXXX)
[RTP] Packet #1 from...
[NDI] Created source: MCR-...
[Pipeline] ... decoded X frames
```

### En Resolume / OBS

El source NDI aparece con nombre `MCR-...`. En Resolume: botón derecho en Sources → Add NDI Source (o Refresh).

## Opcional: Sin Cloudflare (solo WiFi local)

Si estás en la misma WiFi, no necesitás tunnels:

```bash
# Terminal 1
cd backend && NDI_BRIDGE_ENABLED=true npm run dev

# Terminal 2
cd frontend && npm run dev

# Terminal 3
cd ndi-bridge && python -m src.bridge
```

Desde el iPhone: `https://192.168.100.11:3000` (aceptá el cert autofirmado una vez)

## Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| Backend no arranca | Puerto 3001 ocupado | `netstat -ano \| findstr :3001`, matá el proceso |
| Frontend no conecta al backend | WS_URL mal | Revisá que `NEXT_PUBLIC_WS_URL` sea `wss://...` |
| Bridge no conecta | Backend caído o SSL | Revisá que el backend esté corriendo con HTTPS |
| NDI offline en Resolume | No llegan frames | Revisá logs del bridge: buscá `[Pipeline] decoded` |
| Tunnel falla con TLS | Usaste https en vez de http | Para frontend: `http://localhost:3000` (sin s) |
| Multi-streaming | Más de 6 streams | Ajustá `NDI_MAX_STREAMS` en docker-compose |

## Enlaces

- Dashboard: `http://localhost:3000/dashboard`
- Health Check Bridge: `http://localhost:9999/health`
- Health Check Backend: `https://localhost:3001/health`
