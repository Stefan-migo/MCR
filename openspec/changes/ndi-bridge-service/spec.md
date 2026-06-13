# NDI Bridge Specification

## Purpose

Python service that connects to the `/ndi-bridge` Socket.io namespace, receives RTP/H.264 streams from Mediasoup PlainTransports, decodes them via PyAV, and publishes each camera stream as a discoverable NDI source via ndi-python.

## Requirements

### R-001: Backend consume-stream Protocol

The system MUST extend the `/ndi-bridge` namespace with `consume-stream` (client→server), `consumer-ready` (server→client), and `consumer-error` (server→client). On `consume-stream`, the backend SHALL create a Consumer on the existing PlainTransport and pipe the Producer to it.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Consume success | Bridge sends `consume-stream {producerId, rtpCapabilities}` | Backend creates Consumer | `consumer-ready {producerId, ssrc?}` emitted |
| Missing producer | Bridge sends `consume-stream` with unknown `producerId` | Backend processes | `consumer-error {producerId, error}` emitted |
| Transport gone | Bridge sends `consume-stream` but PlainTransport closed | Backend processes | `consumer-error {producerId, error: "transport not found"}` emitted |

### R-002: Bridge Connection Lifecycle

The bridge MUST connect to `/ndi-bridge`, receive `active-streams` on connect, and `stream-started`/`stream-stopped` events. For each stream, it SHALL send a dummy UDP packet to the stream's RTP port (comedia handshake), then send `consume-stream` to activate RTP output.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Fresh connect | Bridge connects, no active streams | Handshake completes | `active-streams` with empty array, no PlainTransport interaction |
| Existing streams | 2 video Producers active | Bridge connects | `active-streams` with 2 entries, dummy UDP sent, `consume-stream` sent for each |
| Stream appears | Bridge connected, new video Producer | `stream-started` received | Dummy UDP sent, `consume-stream` sent, NDI source created |
| Stream stops | Bridge consuming stream | `stream-stopped` received | NDI source destroyed, UDP socket closed |
| Bridge disconnect | Bridge crashes or network lost | Socket.io disconnects | Backend closes all session PlainTransports and Consumers |
| Reconnection | Bridge restarts | After backoff, reconnects | Full handshake repeats, streams re-created |

### R-003: Bridge RTP Reception

The bridge MUST create a UDP socket per stream bound to an ephemeral port. It SHALL buffer incoming RTP packets, depacketize H.264 (extract NAL units from RTP payload), handle packet loss via FFmpeg decoder resilience, and feed NAL units to the PyAV decoder.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Normal RTP | RTP packets arrive in order | Decoder receives packets | NAL units extracted, decoded to YUV frames |
| Packet loss | RTP sequence numbers have gaps | Decoder processes | Missing frames handled by FFmpeg decoder (artifacts expected, no crash) |
| Reordering | Packets arrive out of order | Buffer reorders | Frames decoded in presentation order |
| Clean teardown | Stream stops | Codec flushed | Last decoded frames discarded, no memory leak |

### R-004: Bridge H.264 Decoding

The bridge MUST use PyAV to decode H.264 NAL units. It SHALL read codec parameters from the Producer's `rtpParameters.codecs[0].parameters` (profile-level-id, packetization-mode). Output decoded YUV420P frames SHALL be converted to BGRA via NumPy/OpenCV for NDI.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| H.264 baseline | Producer with packetization-mode=1, profile-level-id=42e01f | Decoder initialized | Frames decoded at native resolution |
| Resolution change | Producer changes encoding resolution | Decoder receives new SPS/PPS | Decoder adapts, no crash |
| Invalid NAL | Corrupted NAL unit received | Decoder processes | Frame skipped, decoder continues (no cascade failure) |

### R-005: Bridge NDI Output

The bridge MUST create one NDI source per Producer named `<NDI_SOURCE_NAME_PREFIX><deviceName>` (fallback: `<NDI_SOURCE_NAME_PREFIX>Camera-<producerId>-<shortId>`). It SHALL push BGRA frames at the source's framerate. NDI sources MUST be discoverable via mDNS (Resolume, OBS). On stream stop, the source SHALL be destroyed cleanly.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| NDI visible | Bridge creates NDI source | After first frame pushed | Source appears in Resolume/OBS within 3s |
| Frame pacing | Source configured at 30fps | 60fps input arrives | Bridge throttles to 30fps (drops or rate-limits) |
| Stream stops | Stream ended | `stream-stopped` handler runs | NDI source destroyed, disappears from network within 3s |
| Multiple sources | 4 active streams | All producing video | 4 NDI sources visible, named distinctly |

### R-006: Bridge Configuration

The bridge SHALL accept these environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `BACKEND_URL` | Yes | — | Socket.io backend URL (e.g., `http://backend:3001`) |
| `NDI_SOURCE_NAME_PREFIX` | No | `MCR-` | Prefix for all NDI source names |
| `MAX_STREAMS` | No | `8` | Hard limit on concurrent streams |
| `LOG_LEVEL` | No | `INFO` | Logging verbosity (DEBUG, INFO, WARN, ERROR) |

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Required missing | No `BACKEND_URL` set | Bridge starts | Bridge logs fatal error and exits |
| Max streams hit | `MAX_STREAMS=2`, 2 streams active | 3rd stream appears | Bridge logs warning, ignores stream |
| Custom prefix | `NDI_SOURCE_NAME_PREFIX=Studio-` | Bridge creates source | Source named `Studio-<deviceName>` |

### R-007: Docker Deployment

The bridge SHALL run as a Docker container with a multi-stage `Dockerfile` (slim-bookworm base). `docker-compose.yml` SHALL include the `ndi-bridge` service with `BACKEND_URL=http://backend:3001`, `depends_on: backend`, and the `mcr-network` network. A health check endpoint on a configurable port (default 9999) SHALL return HTTP 200.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Docker compose | `docker compose up` | Backend healthy | Bridge starts, connects to `/ndi-bridge` |
| Backend delayed | Backend starts 15s after bridge | Bridge connects | Bridge retries with exponential backoff |
| Health check | Bridge running | GET `/health` | Returns `{"status":"ok","streams":2,"uptime":123}` |

### R-008: Error Recovery

The bridge SHALL implement exponential backoff reconnection (Socket.io client built-in). On backend restart, it SHALL reconnect and re-establish all streams. If NDI SDK initialization fails, the bridge SHALL log the error and retry.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Backend restart | Bridge with 3 active streams | Backend goes down | Bridge detects disconnect, waits, reconnects, re-creates streams |
| NDI init fail | NDI SDK not available | Bridge starts | Error logged, bridge retries every 10s |
| Socket.io error | Invalid event received | Bridge processes | Error logged, connection state maintained |

### R-009: Resource Limits

The bridge MUST NOT exceed `MAX_STREAMS` concurrent streams. Each stream's UDP socket SHALL have a receive buffer of at least 256KB. Unused sockets SHALL be closed within 5s of `stream-stopped`. Memory SHALL be garbage-collected after stream removal.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Stream cap | `MAX_STREAMS=4`, 4 active | 5th stream | Ignored, warning logged, no resource leak |
| Cleanup | Stream removed | After 5s | UDP socket closed, decoder freed, NDI sender destroyed |
| Memory | 4 streams at 1080p | System under load | RSS stays under 2GB (no leak detection test) |

## Non-Goals

- Audio NDI support
- Frontend NDI status UI
- Tally/PTZ feedback
- Compositing or multi-view NDI sources
- NDI-to-RTP (reverse direction)
