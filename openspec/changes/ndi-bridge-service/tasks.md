# Tasks: NDI Bridge Service

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~760 (55 backend + 690 bridge + 15 compose) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Backend → PR 2: Bridge service |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend consume-stream + config + test | PR 1 | Base: `feature/auto-ip-ndi-integration`. ~55 lines. Backward-compatible. |
| 2 | Bridge Python service + Docker + compose | PR 2 | Base: PR 1 branch. ~705 lines. Covers all bridge modules. |

## Phase 1: Backend Foundation

- [x] 1.1 config.ts — change `ndiBridge.plainTransport.listenIp` from `127.0.0.1` to `0.0.0.0`
- [x] 1.2 ndiSignaling.ts — add `consume-stream` handler: find transport by producerId, `transport.consume()`, emit `consumer-ready`/`consumer-error`
- [x] 1.3 ndiSignaling.test.ts — extend tests: mock `transport.consume()`, assert `consumer-ready` and `consumer-error` emit

## Phase 2: Bridge Foundation

- [x] 2.1 Create ndi-bridge/ directory + `src/__init__.py`
- [x] 2.2 Create `ndi-bridge/src/config.py` — `BridgeConfig` with pydantic-settings (`BACKEND_URL`, `NDI_SOURCE_NAME_PREFIX`, `MAX_STREAMS`, `LOG_LEVEL`)
- [x] 2.3 Create `ndi-bridge/requirements.txt` — python-socketio[client], av>=12, numpy, pydantic-settings

## Phase 3: Bridge Signaling

- [x] 3.1 Create `ndi-bridge/src/signaling.py` — Socket.io client to `/ndi-bridge`, handle `active-streams`/`stream-started`/`stream-stopped`/`consumer-ready`, emit `consume-stream`, auto-reconnect

## Phase 4: Bridge RTP→NDI Pipeline

- [x] 4.1 Create `ndi-bridge/src/rtp_receiver.py` — UDP socket per stream, RTP buffer, H.264 depacketization (single NAL, FU-A, STAP-A)
- [x] 4.2 Create `ndi-bridge/src/decoder.py` — PyAV `CodecContext` for H.264, feed NAL units, output `VideoFrame`, handle codec extradata
- [x] 4.3 Create `ndi-bridge/src/ndi_sender.py` — ndi-python source, YUV→BGRA via numpy, frame pacing, clean shutdown
- [x] 4.4 Create `ndi-bridge/src/stream_manager.py` — stream lifecycle (start→consume→RTP→NDI, stop→cleanup), max 8 streams guard, per-stream error recovery

## Phase 5: Entry Point & Deployment

- [x] 5.1 Create `ndi-bridge/src/bridge.py` — main entry: load config, init signaling, start stream manager, health check HTTP on :9999
- [x] 5.2 Create `ndi-bridge/Dockerfile` — python:3.12-slim, system deps (ffmpeg, build tools), pip install, run bridge.py
- [x] 5.3 Update `docker-compose.yml` — add env vars (`NDI_SOURCE_NAME_PREFIX`, `MAX_STREAMS`, `LOG_LEVEL`) to ndi-bridge service

## Phase 6: Testing

- [ ] 6.1 Bridge unit tests — mock signaling, assert dispatch; feed synthetic NAL units to decoder, assert output frames
- [ ] 6.2 Integration smoke test — stand up backend + bridge, verify consume-stream → consumer-ready handshake
