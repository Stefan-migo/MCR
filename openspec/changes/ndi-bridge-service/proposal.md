# Proposal: NDI Bridge Service

## Intent

Consume RTP/H.264 from Mediasoup PlainTransports (Change A) and publish as NDI sources discoverable by Resolume/OBS. One NDI source per active mobile camera.

## Scope

**In:** RTP reception from PlainTransport UDP ports; H.264 depacketization + decode via PyAV; YUV→BGRA via OpenCV; NDI source per producer via ndi-python (named `Camera-<deviceName>`); Socket.io client to `/ndi-bridge`; stream lifecycle (connect/discover/create/stop); Docker build with NDI SDK v5; reconnection backoff.

**Out:** Audio NDI; frontend NDI status UI; tally feedback; compositing/multi-view.

## Capabilities

**New:** `ndi-bridge` — RTP→NDI pipeline (stream lifecycle, decoding, NDI output).  
**Modified:** None.

## Approach

**Python + PyAV + ndi-python** (Approach 1). ARCHITECTURE.md prescribes Python; ndi-python is the only mature NDI binding; PyAV handles RTP depacketization and H.264 decode without reimplementing payload parsing.

Per stream: bridge creates UDP socket, sends dummy packet (comedia handshake), receives RTP. PyAV depacketizes NAL units, decodes to YUV420P. OpenCV converts to BGRA, pushed to ndi-python sender. NDI registers via mDNS. On `stream-stopped`, sender destroyed.

## Affected Areas

| Area | Impact |
|------|--------|
| `ndi-bridge/` (new) | Python service: Dockerfile, src/, requirements.txt |
| `docker-compose.yml` | Wire real ndi-bridge image + env |
| `backend/src/mediasoup/config.ts` | PlainTransport `listenIp: '0.0.0.0'` (was `127.0.0.1`) |

## Risks

| Risk | Mitigation |
|------|------------|
| `comedia` + Docker: bridge can't reach `127.0.0.1` | Change listenIp to `0.0.0.0`; bridge uses backend hostname |
| NDI SDK EULA restricts redistribution | Install from repo tar; internal-use image |
| CPU at 10+ streams | `NDI_MAX_STREAMS` env guard; FFmpeg software decode |
| RTP loss artifacts | FFmpeg decoder handles missing frames |

## Rollback

Remove `ndi-bridge/`, revert docker-compose to placeholder, revert `listenIp`. Verify dashboard previews.

## Dependencies

Python 3.12 slim-bookworm. `python-socketio[client]`, `av>=12`, `numpy>=1.26`, `opencv-python>=4.9`, `ndi-python>=5.5`. System: `libndi.so` v5 (from repo tar), FFmpeg 6.x libs (apt). Build: `gcc`, `python3-dev`, `libav*-dev`.

## Success Criteria

- [ ] Bridge connects → receives `active-streams` with existing producers
- [ ] New phone → `stream-started` → NDI source in Resolume within 5s
- [ ] Video renders at >=25fps, <500ms latency
- [ ] Phone disconnects → `stream-stopped` → NDI source gone within 3s
- [ ] Bridge restart → reconnects, re-creates NDI for active streams
- [ ] `docker compose up` runs all 3 services together
