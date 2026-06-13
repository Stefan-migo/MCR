# Exploration: NDI Integration

## Current State

### What exists today
- **Mediasoup backend** with WebRTC transport support — mobile phones connect as Producers, dashboard browsers consume as Consumers.
- **PlainTransport support** in `MediasoupRouter` (`createPlainTransport()`) — implemented but **NOT wired to any Socket.io signaling event**. No way for an external process to request one.
- **No NDI bridge code** — the entire `ndi-bridge/` directory was removed in commit `e6ec1db` ("chore: remove NDI SDK binaries, deprecated Python bridge, stale docs"). All 15+ Python source files, C++ compiled executables, and support scripts were deleted.
- **Frontend** has zero NDI-related UI. The `manifest.json` lists "NDI output" in its `features` array but no controls or status exist.
- **Docker Compose** (`docker-compose.yml`) has no NDI bridge service. Only backend + frontend.
- **`.gitignore`** retains patterns for `ndi-bridge/venv/` and `ndi-bridge/ndi-python/` — remnants of the old bridge.

### What the old NDI bridge tried to do
The removed `ndi-bridge/` contained a complete but **never functional** WebRTC→NDI pipeline:

| Layer | Files | Status |
|-------|-------|--------|
| FastAPI server | `src/main.py` (404 lines) | Worked — health check, stream listing |
| Signaling client | `src/webrtc/signaling.py` (503 lines) | Worked — Socket.io connection to backend |
| Stream manager | `src/services/stream_manager.py` (515 lines) | Worked — orchestrated lifecycle |
| WebRTC consumer | `src/webrtc/consumer.py` (381 lines) | **BROKEN** — used `_generate_test_pattern_loop()` instead of real RTP reception |
| Frame pipeline | `src/processing/pipeline.py` (325 lines) | Partially implemented — queue + timing |
| NDI sender (SDK) | `src/ndi/sender.py` (376 lines) | Fallback to C++ exec — ndi-python never worked reliably |
| NDI sender (FFmpeg) | `src/ndi/ffmpeg_sender.py` (369 lines) | Worked but created local files, not NDI network sources |
| Color converter | `src/ndi/converter.py` (222 lines) | Good utility code |
| Settings | `src/config/settings.py` (326 lines) | Pydantic settings — reusable |

**Critical finding: The old bridge NEVER achieved real WebRTC→NDI conversion.** The consumer had `_generate_test_pattern_loop` as a placeholder. RTP reception via UDP socket was attempted but VP8/H.264 decoding was never implemented.

## Media Pipeline Architecture

```
Mobile Phone (PWA)
    │  getUserMedia() → RTCPeerConnection
    │
    ▼  SRTP/UDP (ICE/DTLS)
Mediasoup WebRtcTransport (Producer)
    │
    ▼
Mediasoup Router
    │
    ├──► WebRtcTransport (Consumer) → Dashboard preview (browser)
    │
    └──► PlainTransport (available but NOT exposed)
              │
              └──► RTP/UDP → [NDI Bridge would connect here]
```

### How the backend works today
1. Mobile client connects via Socket.io, `register-device`
2. Client calls `create-transport` → backend creates `WebRtcTransport`
3. Client calls `connect-transport` → DTLS handshake
4. Client calls `produce` → backend creates Producer in Mediasoup Router
5. Dashboard clients call `create-recv-transport` + `consume-stream` → receive video
6. Stats broadcast every 2s via Socket.io

### What's needed for NDI
The NDI bridge needs to:
1. Connect to backend signaling (Socket.io)
2. Get notified of new Producers (stream-started events)
3. Request a **PlainTransport** from Mediasoup (RTP/UDP output, no DTLS/ICE)
4. Receive raw RTP packets (VP8 or H.264)
5. Decode frames (requires codec decoder: FFmpeg/libav, GStreamer, or built-in)
6. Convert color space (YUV → BGRA)
7. Push to NDI SDK (ndi-python or NDI C library)

## Affected Areas

| File | Why affected |
|------|-------------|
| `backend/src/mediasoup/router.ts` | Already has `createPlainTransport()` — needs Socket.io wiring to expose it to NDI bridge |
| `backend/src/mediasoup/config.ts` | May need PlainTransport listen IP config (currently uses `getAnnouncedIp()` for WebRTC only). PlainTransport UDP port range maybe needed. |
| `backend/src/server.ts` | Needs new Socket.io events: `ndi-bridge-create-plain-transport`, `ndi-bridge-request-streams`, `stream-started` for bridge. |
| `ndi-bridge/` (new) | Complete Python service needs to be rebuilt: FastAPI, signaling client, RTP receiver, decoder, NDI sender |
| `docker-compose.yml` | Needs ndi-bridge service added |
| `frontend/` | May want NDI status indicators in dashboard |
| `.env` | May need NDI bridge config vars |
| `Install_NDI_SDK_v5_Linux.tar.gz` | Already exists in repo root — NDI SDK installer |

## Approaches

### 1. Python Bridge with aiortc + ndi-python (rebuild old approach)

Rebuild the Python NDI bridge but with a **real RTP consumption strategy** using Mediasoup PlainTransport output.

**How**: Python service uses Socket.io to signal the backend, receives RTP over UDP via PlainTransport, decodes with `av` (FFmpeg bindings) or direct H.264 depacketization, converts to BGRA via numpy/OpenCV, pushes to NDI SDK.

| Pros | Cons | Effort |
|------|------|--------|
| Leverages existing Python code base (settings, signaling, converter) | Old bridge proved Python+NdiLib+aiortc was unreliable | **High** |
| Python has best NDI SDK support (ndi-python) | RTP depacketization + decoding is complex (need H.264/VP8 parser) | |
| FastAPI is battle-tested for the REST API | Python GIL + per-stream frame processing = scaling concerns | |
| Full codec flexibility | Must install NDI SDK system-wide | |

### 2. Node.js NDI Bridge with node-ndi + FFmpeg

Build the bridge in Node.js/TypeScript to stay in the same ecosystem.

**How**: Node process connects via Socket.io as a special client. Mediasoup PipeTransport pipes RTP to a local port. FFmpeg subprocess reads the stream (via pipe or UDP) and outputs NDI using FFmpeg's NDI output plugin.

| Pros | Cons | Effort |
|------|------|--------|
| Same language as backend, easier maintenance | `node-ndi` is a less mature binding than ndi-python | **Medium** |
| FFmpeg handles ALL codec parsing/decoding | FFmpeg NDI output is not official — requires custom build or plugin |
| Mediasoup PipeTransport is proven for inter-worker routing | Higher latency from pipe → FFmpeg → NDI |
| No color space conversion needed (FFmpeg handles it) | More complex process management |

### 3. GStreamer Pipeline + NDI Plugin

Use GStreamer with the `ndi-send` element for the entire pipeline.

**How**: Backend creates a PipeTransport or PlainTransport that outputs to a UDP port. GStreamer pipeline reads from UDP, decodes, converts, and sends via ndi-sink element.

| Pros | Cons | Effort |
|------|------|--------|
| GStreamer handles ALL media processing natively | Requires GStreamer + gst-ndi plugin installation | **Medium** |
| Zero-copy buffers possible | GStreamer pipelines are hard to debug and configure dynamically |
| battle-tested in broadcast environments | Dynamic stream creation (per mobile device) adds complexity |
| Lower latency than FFmpeg-based approaches | PipeTransport may require additional Mediasoup config |

### 4. Direct Mediasoup PipeTransport + External NDI Sink

Use Mediasoup's `pipeToRouter()` or PipeTransport to send the stream to a local media server (like an FFmpeg or GStreamer process), which then outputs NDI.

**How**: No Python bridge at all. Backend pipes RTP to localhost UDP. A lightweight wrapper (Node.js or shell script) launches FFmpeg/GStreamer instances consuming the UDP stream and outputting NDI. Mediasoup handles all routing.

| Pros | Cons | Effort |
|------|------|--------|
| Minimal code — leverages existing Mediasoup capabilities | Still need FFmpeg/GStreamer with NDI support | **Medium-Low** |
| Proven approach (many Mediasoup projects pipe to FFmpeg) | Per-stream process management is messy | |
| No aiortc/ndi-python dependency hell | Limited error recovery without a proper supervisor | |

## Dependencies Needed

### Python approach (Options 1)
- **Python 3.11+**
- `aiortc` (WebRTC native in Python — alternative to Socket.io signaling; but we'll use signaling + PlainTransport instead)
- `ndi-python>=5.1.0` (NDI SDK bindings)
- `opencv-python>=4.8.0` (frame conversion)
- `numpy>=1.24.0` (array operations)
- `av>=10.0.0` (FFmpeg bindings for codec decoding)
- `fastapi>=0.100.0` + `uvicorn>=0.20.0` (API server)
- `python-dotenv>=1.0.0` + `pydantic-settings>=2.0.0` (config)
- `websockets>=11.0` (signaling transport)
- **System**: NDI SDK v5 runtime libraries (`libndi.so`)

### Node.js approach (Options 2)
- `socket.io-client` (signaling)
- `child_process` (FFmpeg spawn)
- **System**: FFmpeg with NDI output (custom compile or `--enable-libndi_newtek`)
- Optional: `node-ndi` npm package (unstable)

### GStreamer approach (Options 3)
- `gstreamer` + `gst-plugins-base` + `gst-plugins-good`
- `gst-ndi` plugin (from `gst-plugins-rs` or community builds)
- **System**: NDI SDK runtime

## Risks

1. **NDI SDK licensing** — NDI SDK is free but requires accepting NewTek's EULA. Redistribution is restricted.
2. **RTP depacketization complexity** — H.264 and VP8 RTP payload formats are non-trivial. FFmpeg/GStreamer handle this well; custom implementations (aiortc) have struggled historically.
3. **Per-stream resource usage** — Each NDI source is a separate encoding pipeline. At 10+ streams, CPU/memory could be significant.
4. **NDI on Windows vs Linux** — The NDI SDK for Windows is mature; Linux support exists but is less tested. Docker containerization adds another layer.
5. **Latency accumulation** — WebRTC (~100ms) + RTP decode (~1 frame) + color conversion (~1-2ms) + NDI encode (~1 frame) = need to keep total under ~200ms for "real-time".

## Recommended Change Scope

### Recommendation: Split into 2 changes

**Change A — Backend: PlainTransport signaling + bridge API**
- Wire `createPlainTransport()` to a Socket.io event (`request-plain-transport`)
- Add `ndi-bridge` Socket.io namespace or identify bridge clients via event
- Expose stream list for bridge consumption (`ndi-bridge-get-streams`)
- Add REST API endpoints for bridge management
- Document the PlainTransport RTP output format (IP, port, payload type, codec)
- Add Dockerfile and docker-compose service definition

**Change B — NDI Bridge service**
- Build the actual Python (or Node/GStreamer) service that:
  - Connects to backend signaling
  - Discovers active streams
  - Creates PlainTransports for each stream
  - Receives RTP, decodes video
  - Outputs to NDI network sources
  - Handles stream lifecycle (start/stop/reconnect)

### Why split

The backend changes are small, well-defined, and can be tested independently (plain transport creation returns UDP port info). The NDI bridge is the complex, high-risk component that deserves its own design iteration. Splitting allows:
1. Backend changes can be reviewed and merged quickly
2. NDI bridge can iterate on decoding approach without blocking the signaling API
3. Clear separation of concerns: backend exposes RTP, bridge consumes it

## Ready for Proposal

**Yes**. The exploration is complete. Key findings:
- Old bridge code was removed entirely and was never functional
- Backend has PlainTransport primitives but no signaling exposure
- Three viable approaches (Python, Node/FFmpeg, GStreamer) with clear tradeoffs
- Recommend splitting into Backend signaling changes + NDI Bridge service

The orchestrator should proceed to **Proposal** phase with the recommendation to split into 2 changes.
