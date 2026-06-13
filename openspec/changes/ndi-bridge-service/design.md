# Design: NDI Bridge Service

## Technical Approach

Python 3.11+ bridge consuming RTP/H.264 from Mediasoup PlainTransports via comedia, decoding with PyAV, outputting NDI sources via ndi-python. Backend (`ndiSignaling.ts`) extended with `consume-stream` → `consumer-ready` protocol. One socket.io namespace (`/ndi-bridge`) handles all signaling. Per-stream pipeline: dummy UDP (comedia) → `consume-stream` → Consumer creation → RTP flow → PyAV decode → YUV→BGRA → NDI send.

## Architecture Decisions

### Decision: consume-stream Protocol

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Auto-create Consumer on PlainTransport creation | Simpler backend; bridge has no control over timing | ❌ Rejected — bridge must send comedia handshake before RTP flows |
| **Explicit `consume-stream` event** | Bridge controls timing; clear lifecycle; matches spec | ✅ **Chosen** — bridge sends event AFTER dummy UDP |

Bridge sends `consume-stream { producerId }`, backend creates Consumer, emits `consumer-ready { producerId }`.

### Decision: rtpCapabilities Source

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Bridge sends rtpCapabilities | Bridge needs to know Mediasoup capabilities format | ❌ Rejected — unnecessary complexity |
| **Backend derives from Producer** | Backend has Producer's rtpParameters; trivially matches codec | ✅ **Chosen** — bridge only sends `producerId` |

Backend calls `router.getRouterCapabilities()` — Mediasoup matches Producer's H.264 codec automatically.

### Decision: PlainTransport listenIp

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `127.0.0.1` (current) | Works for local-only; bridge-container can't reach | ❌ Rejected — Docker bridge can't reach host loopback |
| **`0.0.0.0`** | Accessible from any container on same network | ✅ **Chosen** — change in `config.ts` `ndiBridge.plainTransport.listenIp` |

### Decision: Comedia Handshake Timing

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Before `stream-started` | Bridge needs to know port first | ❌ Impossibility |
| **After `stream-started`, before `consume-stream`** | Mediasoup learns bridge's IP:port before Consumer starts | ✅ **Chosen** — clean ordering |
| After `consume-stream` | Consumer created before remote endpoint known; first frames lost | ❌ Rejected — unnecessary data loss |

## Data Flow

### Stream Start (new phone connects)

```
Backend                          Bridge
   │                                │
   │  (Phone creates Producer)      │
   │  Emit 'new-producer'           │
   │  Create PlainTransport         │
   ├── stream-started ──────────────►  (producerId, codec, rtpEndpoint)
   │                                │  Create UDP socket
   │                                │  Send dummy UDP packet (comedia)
   │                                │
   ├─── consume-stream (producerId)◄──
   │  Find PlainTransport in session│
   │  transport.consume(...)        │
   ├── consumer-ready (producerId)──►
   │                                │  RTP starts flowing
   │                                │  PyAV decodes H.264
   │                                │  ndi-python pushes NDI frames
```

### Stream Stop / Bridge Reconnect

```
Backend                          Bridge
   │                                │
   │  Producer closed / disconnect  │
   ├── stream-stopped ─────────────►  (producerId)
   │                                │  Close UDP socket
   │                                │  Destroy NDI sender
   │                                │  Free decoder
   │                                │
   │  (Bridge reconnects)           │
   ├── active-streams ─────────────►  (list of active producers)
   │                                │  For each: dummy UDP → consume-stream
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `ndi-bridge/src/bridge.py` | Create | Entry point, health check HTTP |
| `ndi-bridge/src/config.py` | Create | Pydantic settings from env vars |
| `ndi-bridge/src/signaling.py` | Create | Socket.io client, event handlers |
| `ndi-bridge/src/rtp_receiver.py` | Create | UDP socket per stream, RTP buffer |
| `ndi-bridge/src/decoder.py` | Create | PyAV H.264 decoder |
| `ndi-bridge/src/ndi_sender.py` | Create | ndi-python NDI source |
| `ndi-bridge/src/stream_manager.py` | Create | Stream lifecycle orchestration |
| `ndi-bridge/requirements.txt` | Create | Python dependencies |
| `ndi-bridge/Dockerfile` | Create | Multi-stage Python 3.12-slim build |
| `backend/src/mediasoup/ndiSignaling.ts` | Modify | Add `consume-stream` handler, Consumer creation |
| `backend/src/mediasoup/config.ts` | Modify | Change `listenIp` to `0.0.0.0` for ndiBridge |
| `docker-compose.yml` | Modify | Bridge is already defined; ensure `BACKEND_URL` is correct |

## Interfaces / Contracts

### Backend Socket.io Events (`/ndi-bridge`)

| Direction | Event | Payload | Response |
|-----------|-------|---------|----------|
| Bridge → | `consume-stream` | `{ producerId: string }` | `consumer-ready` or `consumer-error` |
| Backend → | `consumer-ready` | `{ producerId: string }` | — |
| Backend → | `consumer-error` | `{ producerId: string, error: string }` | — |

### Bridge Data Structures

```python
@dataclass
class StreamState:
    producer_id: str
    transport_port: int        # PlainTransport UDP port
    local_port: int            # Bridge's local UDP port
    udp_socket: socket.socket
    decoder: av.CodecContext
    ndi_sender: NDIlib.send_instance_t
    codec_params: dict
    fps: float

class BridgeConfig(BaseSettings):
    backend_url: str
    source_name_prefix: str = "MCR-"
    max_streams: int = 8
    log_level: str = "INFO"
```

## Backend Integration (`ndiSignaling.ts`)

Add handler in `handleConnection`:

```typescript
socket.on('consume-stream', async ({ producerId }) => {
  const entry = session.plainTransports.get(producerId);
  if (!entry) return socket.emit('consumer-error', { producerId, error: 'unknown producer' });

  const rtpCapabilities = this.router.getRouterCapabilities();
  const consumer = await entry.transport.consume({ producerId, rtpCapabilities });
  await consumer.resume();
  socket.emit('consumer-ready', { producerId });
});
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Backend `consume-stream` handler | Extend existing `ndiSignaling.test.ts` — mock `transport.consume()`, assert `consumer-ready` emitted |
| Unit | Bridge `signaling.py` event parsing | Mock socket.io client, assert correct handler dispatch |
| Unit | Bridge `decoder.py` | Feed synthetic H.264 NAL units, assert decoded frames |
| Integration | Bridge → Backend flow | Run both services, verify `consume-stream` → RTP flowing |
| E2E | Full pipeline | Docker compose, phone → NDI source visible in OBS |

## Migration / Rollout

No migration. Bridge is additive — backend changes are backward-compatible (existing `/ndi-bridge` namespace consumers unaffected). Deploy by rebuilding `docker-compose up --build ndi-bridge`.

## Open Questions

- [ ] Backend should close the Consumer (not just PlainTransport) on stream stop. Does Consumer.close() cascade to the PlainTransport, or must both be closed separately?
- [ ] Bridge health check endpoint `GET /health` — port collides with backend? Use internal-only port (default `9999`).
