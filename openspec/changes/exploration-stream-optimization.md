## Exploration: Stream Pipeline Quality Optimization

### Current Pipeline Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  iPHONE CAMERA (Frontend PWA)                                            │
│                                                                          │
│  getUserMedia({ width: 1280, height: 720, frameRate: 30 })              │
│       ↓                                                                  │
│  H.264 encoder (browser native)                                          │
│       ↓                                                                  │
│  Simulcast encodings:                                                    │
│    Layer 2: scale=1,   maxBitrate=1,000,000  ← 720p full-resolution     │
│    Layer 1: scale=2,   maxBitrate=500,000    ← ~360p                    │
│    Layer 0: scale=4,   maxBitrate=200,000    ← ~180p (LOWEST)           │
│       ↓                                                                  │
│  mediasoup-client lib → WebRTC → mediasoup SFU                           │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  MEDIASOUP ROUTER (Backend Node.js)                                     │
│                                                                          │
│  Router mediaCodecs: H.264 Constrained Baseline (42e01f), VP8, VP9      │
│  WebRtcTransport: maxIncomingBitrate=1,500,000                           │
│  SFU pure forwarding — NO transcoding                                    │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐                             │
│  │  Browser        │    │  NDI Bridge     │                             │
│  │  Consumer       │    │  Consumer       │                             │
│  ├─────────────────┤    ├─────────────────┤                             │
│  │  spatial=2      │    │  spatial=0 🤮   │  ← THIS IS THE BUG         │
│  │  temporal=2     │    │  temporal=0     │                             │
│  │  (HIGHEST)      │    │  (LOWEST)       │                             │
│  └────────┬────────┘    └────────┬────────┘                             │
└────────────┼──────────────────────┼──────────────────────────────────────┘
             │                      │
             ▼                      ▼
┌──────────────────────┐  ┌─────────────────────────────────────┐
│  DASHBOARD BROWSER   │  │  NDI BRIDGE (Python aiortc)         │
│                      │  │                                      │
│  WebRTC → video tag  │  │  RTCPeerConnection recvonly          │
│  Looks GOOD ✔️       │  │  codec=H.264 PT 96                   │
│                      │  │  packetization-mode=1                │
│                      │  │  profile-level-id=42e01f             │
│                      │  │  DTLS role=active                    │
│                      │  │       ↓                              │
│                      │  │  frame.to_ndarray(format="bgra")     │
│                      │  │       ↓                              │
│                      │  │  ndi.send_send_video_v2()            │
│                      │  │       ↓                              │
│                      │  │  NDI SOURCE "MCR-{producerId}"       │
│                      │  │  frame_rate_D=1001                   │
│                      │  │  frame_rate_N=frameRate*1001         │
│                      │  │  FourCC=BGRA                         │
│                      │  │       ↓                              │
│                      │  │  Looks BAD 🤮 (lowest simulcast)    │
└──────────────────────┘  └─────────────────────────────────────┘
```

### Resolution/Quality at Each Stage

| Stage | Resolution | Bitrate | Codec | Notes |
|-------|-----------|---------|-------|-------|
| iPhone Camera capture (default) | 1280×720 | N/A | Raw YUV | `ideal` constraint, may vary per device |
| Browser H.264 encoder | 1280×720 | 1,000,000 (layer 2) | H.264 CB | Simulcast layer 2 |
| mediasoup SFU | 1280×720 (layer 2) | varies | H.264 CB | Pure forwarder, no transcoding |
| Dashboard browser consumer | 1280×720 | 1,000,000 | H.264 CB | Gets spatialLayer=2 ✅ |
| **NDI bridge consumer** | **~180p** (scaled×4) | **200,000** | H.264 CB | **Gets spatialLayer=0 ❌** |
| NDI output | ~180p | 200,000 | NDI BGRA | Matches consumer output |
| OBS/Resolume | ~180p | 200,000 | NDI BGRA | Bad quality 🚫 |

### Identified Bottlenecks & Quality Loss Points

1.  **spatialLayer=0 for NDI bridge consumer** [CRITICAL]
    - File: `backend/src/server.ts`, line 471 (resume-consumer handler)
    - The backend explicitly sets `spatialLayer: 0, temporalLayer: 0` for the NDI bridge consumer
    - This causes the bridge to receive the lowest simulcast layer (~180p@200kbps)
    - The dashboard consumer correctly requests `spatialLayer: 2, temporalLayer: 2`

2.  **Default quality preset is Medium (720p@24fps)**
    - File: `frontend/src/store/stream-store.ts`, line 58
    - Default preset: `CameraService.QUALITY_PRESETS[1]` = 1280×720 @24fps, 500kbps
    - User must manually select High (1080p) or Ultra (4K)
    - Maximum: 3840×2160 @30fps, 2Mbps (Ultra)

3.  **WebRTC transport bitrate cap**
    - File: `backend/src/mediasoup/config.ts`, line 132
    - `maxIncomingBitrate: 1500000` (1.5 Mbps)
    - This caps the total incoming bitrate from the producer
    - For 1080p60 this is very conservative

4.  **H.264 profile limitation**
    - File: `backend/src/mediasoup/config.ts`, line 83
    - Uses Constrained Baseline profile (`42e01f`)
    - iOS hardware encoder supports High Profile, which would give better quality at same bitrate

5.  **Frame dropping threshold**
    - File: `ndi-bridge/src/stream_manager.py`, line 156
    - Drops frames arriving faster than `interval * 0.5` → may cause uneven frame pacing

6.  **Stats are fake/mock data**
    - File: `backend/src/server.ts`, lines 618-625
    - Dashboard stream stats are randomly generated, not real producer stats
    - Makes debugging quality issues harder

### Open-Source Tools & Packages for Optimization

| Tool | Purpose | Phase |
|------|---------|-------|
| **mediasoup `setConsumerPreferredLayers()`** | Change spatial/temporal layer | Immediate fix |
| **ffmpeg/libavcodec** | H.264 SW decode (fallback) | Already in bridge |
| **OpenCV (cv2)** | Frame processing | Already used |
| **NDI SDK v5** | NDI output | Already used |
| **libvpx (VP8/VP9)** | Alternative codecs | Already in mediasoup config |
| **SVT-AV1** | Future: software AV1 encode | Not yet integrated |
| **Prometheus + Grafana** | Real quality metrics | Monitoring |
| **WebRTC stats API** | Real per-stream metrics | Needs backend wiring |

### Recommended Approaches with Tradeoffs

#### Approach A: Fix spatial layer selection (Minimum change)

Change `backend/src/server.ts` to use `spatialLayer: 2` (highest) for the NDI bridge consumer, matching what the browser dashboard consumer does.

- **Pros**: Single-line change, immediate quality improvement, zero risk
- **Cons**: Higher bandwidth on NDI bridge WebRTC consumer (1Mbps vs 200kbps); doesn't address camera capture quality
- **Effort**: Low (minutes)

#### Approach B: Full pipeline quality tuning (Recommended)

1.  Fix spatial layer selection (from A above)
2.  Change default quality preset to High (1920×1080 @30fps)
3.  Remove or increase WebRTC transport `maxIncomingBitrate` (e.g., to 5-10 Mbps)
4.  Add H.264 High Profile support to mediasoup router codec list
5.  Wire real producer stats from mediasoup's `getStats()` instead of mock data
6.  Add NDI sender configuration for explicit quality metadata

- **Pros**: End-to-end quality improvement, real monitoring, professional-grade pipeline
- **Cons**: Higher bandwidth usage on LAN (but LAN-grade); requires more testing
- **Effort**: Medium (hours)

#### Approach C: Maximum quality — Sender-Controlled Stream

Replace simulcast with a single high-quality H.264 stream. Remove simulcast layers and send one high-bitrate encoding from the iPhone.

- **Pros**: Highest possible quality for NDI (no layer selection issues)
- **Cons**: No adaptation for bandwidth-constrained consumers (dashboard); dashboard gets same high-bitrate stream; may overload browser decoders
- **Effort**: Low (remove encodings array from produce call)

### Recommendation

**Approach B** is recommended. The critical fix is Approach A (the spatialLayer bug), and this MUST be done regardless. Beyond that, tuning the camera defaults, bitrate caps, and codec profile delivers a professional pipeline without architectural changes.

The single-line fix in `backend/src/server.ts` changes:
```
spatialLayer: 0 → spatialLayer: 2
```

### Risks

- **Higher LAN bandwidth**: WebRTC from mediasoup to NDI bridge will increase to ~1-2 Mbps per stream from ~200 Kbps. On a local LAN this is negligible, but if the NDI bridge is remote, monitor bandwidth.
- **iOS encoder behavior**: Higher bitrates may trigger iOS thermal throttling. Consider adaptive bitrate based on device state.
- **Browser decoder load**: Dashboard consumers getting the same high-bitrate stream (if using Approach C) may struggle on low-end devices. Keep simulcast for browser consumers.
- **Backward compatibility**: Changing `spatialLayer` doesn't affect existing producers — they still publish all 3 layers. Only consumer selection changes.
- **No existing tests**: The backend has zero integration tests for the signaling flow. Changes should be manually verified end-to-end.

### Ready for Proposal

Yes. The primary fix and optimization path is clear. The orchestrator should proceed to the proposal phase with the "stream-optimization" change, prioritizing the spatialLayer fix as the MVP.
