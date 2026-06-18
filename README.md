# 📱 Mobile Camera Receptor (MCR)

Transformá cualquier móvil en una cámara profesional con transmisión WebRTC de ultra-baja latencia. Ideal para VJs, creadores de contenido y artistas multimedia.

**Stack**: Next.js + mediasoup + aiortc + NDI

---

## ✨ Features

- **📱 Streaming desde el móvil**: Interfaz profesional con control de calidad
- **🎛️ Dashboard VJ**: Monitoreo y control de múltiples streams en tiempo real
- **🎬 NDI Integration**: Convierte streams a fuentes NDI para OBS, Resolume, etc.
- **📷 Camera Lens Control**: Selección de lente (gran angular, principal, telescópica) + zoom
- **⚡ Ultra-Baja Latencia**: <100ms con WebRTC
- **🔄 Multi-Stream**: Múltiples dispositivos simultáneos
- **📊 Live Statistics**: Bitrate, latencia, pérdida de paquetes, FPS
- **📱 PWA**: Experiencia app nativa en el móvil
- **🏷️ Device Management**: Renombrá y organizá dispositivos
- **🐳 Docker**: Deploy listo para VPS

---

## 🏗️ Arquitectura

```
📱 Móviles (cualquier red — 4G, WiFi)
   │  WebRTC + Socket.io
   ▼
🌍 VPS (Kamatera — Ubuntu, Docker)
   ├── Backend :3001      — mediasoup + Socket.io signaling
   ├── Frontend :3000     — Dashboard Next.js (vía DuckDNS)
   └── NDI Bridge          — WebRTC → NDI (localhost)
        │
        │ TCP 5960-5999
        ▼
💻 PC local (WiFi institucional, UDP bloqueado)
   └── NDI Bridge (NewTek) → Resolume / OBS
```

Para el detalle completo de deploy en VPS, ver [`Docs/VPS_DEPLOYMENT.md`](Docs/VPS_DEPLOYMENT.md).

---

## 🚀 Deploy en VPS (producción)

> Instrucciones detalladas → [`Docs/VPS_DEPLOYMENT.md`](Docs/VPS_DEPLOYMENT.md)

**Resumen**:
1. VPS con Ubuntu + Docker
2. DuckDNS apuntando a la IP del VPS
3. Backend + Frontend + NDI Bridge en contenedores
4. PC local con NDI Bridge (NewTek) para recibir fuentes NDI

### Puertos necesarios en el VPS

| Puerto | Protocolo | Uso |
|--------|-----------|-----|
| `3001` | TCP | Backend (móviles + frontend) |
| `3000` | TCP | Frontend dashboard |
| `5960-5999` | TCP+UDP | NDI output |
| `20000-21000` | UDP | mediasoup WebRTC media |

---

## 💻 Desarrollo local

### Prerrequisitos

- Node.js 18+
- Python 3.11+ (para NDI Bridge local)
- Docker (opcional)

### Setup rápido

```bash
git clone https://github.com/Stefan-migo/MCR.git
cd MCR

# Backend
cd backend && npm install
cp .env.local.example .env.local  # configurar IP anunciada
npm run dev

# Frontend (otra terminal)
cd frontend && npm install
echo "NEXT_PUBLIC_API_URL=https://localhost:3001" > .env.local
echo "NEXT_PUBLIC_WS_URL=wss://localhost:3001" >> .env.local
npm run dev:https

# NDI Bridge (otra terminal)
cd ndi-bridge
pip install -r requirements.txt
export NDI_BACKEND_URL=https://localhost:3001
export NDI_SSL_VERIFY=false
python -m src.bridge
```

### Configuración de red local

Para que los móviles se conecten desde la misma LAN, el backend necesita saber tu IP local:

```bash
export MEDIASOUP_ANNOUNCED_IP=192.168.x.x   # tu IP local
```

---

## 🎬 NDI Bridge

El bridge corre como un contenedor Docker en el VPS y convierte cada stream WebRTC en una fuente NDI disponible en la IP del VPS.

### Consumir NDI desde PC local

1. Descargá [NDI Tools](https://ndi.video/tools/) → **NDI Bridge**
2. Conectalo a la IP del VPS (TCP, puertos 5960-5999)
3. Resolume / OBS ven las fuentes NDI como si fueran locales

> No necesitás UDP en tu red local — NDI Bridge usa TCP para la conexión remota.

### Health check

```bash
curl http://localhost:9999/health
# → {"status": "ok", "streams": 2, "uptime": 123.4}
```

---

## 📱 Mobile Client

- Switch frontal/trasera
- Selección de lente (gran angular, principal, telescópica)
- Control de zoom
- Presets de calidad (Low / Medium / High / Ultra)
- Soporte PWA (instalable como app)

## 🎛️ VJ Dashboard

- Monitoreo en tiempo real de todos los streams
- Grid / lista
- Estadísticas: bitrate, FPS, latencia, packet loss
- Control de calidad por stream
- Toggle NDI por dispositivo
- Estado de conexión claro (Live / Not Streaming / Disconnected)
- Auto-cleanup de dispositivos desconectados (30s)

---

## 🛠️ Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS, Zustand |
| Backend | Node.js, Express, mediasoup, Socket.io |
| NDI Bridge | Python, aiortc, ndi-python, numpy |
| Infra | Docker, DuckDNS |

---

## 📈 Roadmap

- [x] **Fase 1**: Fundación e infraestructura
- [x] **Fase 2**: WebRTC + Signaling + Mobile Client + Dashboard
- [x] **Fase 3**: NDI Bridge (WebRTC → NDI)
- [x] **Fase 3.5**: Camera Lens Control + Zoom
- [x] **Fase 4.0**: Deploy en VPS (Kamatera + Docker + DuckDNS)
- [ ] **Fase 4.5**: Reverse proxy (Caddy/Nginx)
- [ ] **Fase 5**: Optimización de producción
- [ ] **Fase 6**: Escalado multi-VPS

---

## 🔒 Seguridad

- HTTPS requerido para acceso a cámara
- CORS configurable por entorno
- WebRTC con DTLS + SRTP
- Certificados auto-firmados para desarrollo

---

## 📄 Licencia

MIT — ver [LICENSE](LICENSE).

---

**Built with ❤️ for the VJ and multimedia community**
