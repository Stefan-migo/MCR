# NDI Signaling Specification

## Purpose

Socket.io `/ndi-bridge` namespace for NDI bridge RTP stream discovery and PlainTransport lifecycle. Auto-creates PlainTransports per video Producer, pushes real-time start/stop events, isolated from main WebRTC signaling.

## Requirements

### R-001: Bridge Namespace Isolation
The system MUST expose a `/ndi-bridge` Socket.io namespace isolated from the default `/`, with a registry tracking connected sockets and their PlainTransport sets.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Bridge connects | Bridge connects to `/ndi-bridge` | Handshake completes | Receives `active-streams`, main `/` untouched |
| No interference | Bridge active on `/ndi-bridge` | WebRTC client connects | Normal signaling flows uninterrupted |

### R-002: Stream Discovery on Connect
The system MUST emit `active-streams` on bridge connect with all video Producers (producerId, mimeType, clockRate, payloadType, rtpPort, ip).

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| No producers | Bridge connects, no Producers | Handshake completes | `active-streams` returns empty array |
| Active producers | 2 video Producers active | Handshake completes | `active-streams` contains both with full RTP info |

### R-003: Real-time Stream Started
When a video Producer appears while a bridge is connected, the system MUST create a PlainTransport and emit `stream-started`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| New video | Bridge connected | New video Producer | PlainTransport created, `stream-started` emitted |
| Audio skipped | Bridge connected | Audio Producer | No PlainTransport, no event |

### R-004: Real-time Stream Stopped
When a video Producer closes while a bridge is connected, the system MUST close its PlainTransport and emit `stream-stopped`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Producer closes | Bridge connected, stream active | Producer fires `transportclose` | PlainTransport closed, `stream-stopped` emitted |

### R-005: Bridge Disconnect Cleanup
Bridge disconnect MUST close all its PlainTransports and release UDP ports.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Active streams | Bridge with 3 streams | Bridge disconnects | 3 PlainTransports closed, ports freed |
| No streams | Bridge with 0 streams | Bridge disconnects | Registry cleaned, no transports |

### R-006: Multiple Concurrent Bridges
The system MAY support multiple bridges. Each session MUST track its own PlainTransport set independently.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Second bridge | Bridge A with 2 streams | Bridge B connects | B gets new transports on different ports, A unchanged |
| One disconnects | Two bridges, 2 streams each | Bridge A disconnects | Only A's transports closed, B continues |

### R-007: PlainTransport Configuration
PlainTransports MUST use `listenIp: "127.0.0.1"`, `comedia: true`, `rtcpMux: false`. RTP output MUST match the Producer's codec.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| VP8 | Producer with video/VP8 | Transport created | Stream info: codec "video/VP8", payload type from rtpParameters |
| H.264 | Producer with video/H264 | Transport created | Stream info: codec "video/H264", payload type from rtpParameters |

### R-008: Port Range and Exhaustion
Port allocation MUST use `mediasoupConfig.plainTransport.portRange` (default 20000-21000), overridable via `MEDIASOUP_PLAIN_TRANSPORT_PORT_RANGE`. Exhaustion MUST NOT crash.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Default | No env var | Port allocated | From 20000-21000 |
| Custom range | `PORT_RANGE=30000-30010` | Port allocated | From 30000-30010 |
| Exhaustion | 2 ports available, 2 transports exist | 3rd starts | Error logged, event to bridge, server continues |

### R-009: Configuration Schema
`mediasoupConfig` MUST include `plainTransport` section. Docker Compose MUST add `ndi-bridge` placeholder.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Config loads | Backend starts | Config resolved | `plainTransport` present with defaults |
| Docker | `docker compose up` | ndi-bridge starts | Entry with `depends_on: backend`, placeholder image |
