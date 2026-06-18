# Design: Stream Pipeline Optimization

## Technical Approach

Five atomic, independently revertible changes across 4 domains, ordered by dependency. Each change targets a specific bottleneck in the pipeline: NDI bridge spatial layer → bitrate ceiling → H.264 profile → camera defaults → dashboard instrumentation.

## Domain 1: ndi-bridge-quality — Spatial Layer Fix

### Current State

Two code paths create simulcast/SVC consumers without requesting the highest spatial layer:

| Code Path | File | Current Behavior | Impact |
|-----------|------|-----------------|--------|
| Browser dashboard | `server.ts:469-475` | `setPreferredLayers({ spatialLayer:0 })` downgrades all to ~180p | Low-res previews |
| NDI bridge | `ndiSignaling.ts:140-147` | `consumer.resume()` with NO `setPreferredLayers` call | NDI bridge gets layer 0 |

### Fix

**server.ts**: Change `spatialLayer: 0` → `2` at line 471. This upgrades browser dashboard consumers to 720p.

**ndiSignaling.ts**: Add `setPreferredLayers({ spatialLayer:2, temporalLayer:0 })` after `consumer.resume()` at line 146. This upgrades NDI bridge consumers to 720p.

Both sites: wrap in try/catch (already present in server.ts; add in ndiSignaling.ts). If the producer has fewer layers, mediasoup silently uses the highest available — no crash.

### Sequence: NDI Bridge Consumer Flow

```
NDI Bridge Python          Server (ndiSignaling.ts)         Mediasoup Router
     |                              |                              |
     |-- connect (/ndi-bridge) ---->|                              |
     |<-- transport-created --------|                              |
     |<-- active-streams -----------|                              |
     |                              |                              |
     |-- consume-stream ----------->|                              |
     |       { producerId }         |-- transport.consume() ------>|
     |                              |<-- consumer created ---------|
     |                              |-- consumer.resume()          |
     |                              |-- setPreferredLayers({       |
     |                              |     spatialLayer:2,          |
     |                              |     temporalLayer:0 })       |
     |<-- consumer-ready -----------|                              |
     |                              |                              |
     |<======== RTP (spatialLayer=2, 720p) =======================>|
```

## Domain 2: stream-encoding-config — Bitrate Cap & Codec Profile

### Bitrate Cap

`config.ts:132` — change `maxIncomingBitrate` from `1500000` to `10000000` (10 Mbps).

- Producer-side cap only (device → SFU direction). Device encoder rate control is primary limiter.
- 10 Mbps leaves headroom for 1080p H.264 peaks (2-8 Mbps typical) without risking congestion on wired/pro Wi-Fi.

### H.264 High Profile

Insert a second H.264 video codec entry in `config.ts:66-92` after the existing baseline entry:

```typescript
{
  kind: 'video' as const,
  mimeType: 'video/h264',
  clockRate: 90000,
  parameters: {
    'packetization-mode': 1,
    'profile-level-id': '640c1f',    // High Profile 4.1
    'level-asymmetry-allowed': 1,
    'x-google-start-bitrate': 1000
  },
  rtcpFeedback: [
    { type: 'nack' },
    { type: 'nack', parameter: 'pli' },
    { type: 'ccm', parameter: 'fir' }
  ]
}
```

Key decisions:
- **Same rtcpFeedback as baseline**: NACK/PLI/FIR are standard — no reason to differ.
- **Same x-google-start-bitrate**: High Profile is more efficient at the same bitrate, so 1000 kbps start rate is safe.
- **Baseline entry stays first**: Mediasoup matches codecs in array order. Clients that support both will negotiate Baseline unless their SDP explicitly prefers High Profile. This preserves backward compat.

### Transport Lifecycle Note

The `maxIncomingBitrate` is set at transport creation time (`config.ts` → `webRtcTransport`). Existing transports keep the old cap. New transports (created after deploy) use 10 Mbps. If an in-flight producer hits the old 1.5 Mbps cap, only a reconnection or new transport creation picks up the new limit. For this app (short-lived streaming sessions), this is acceptable — no hot-reload needed.

## Domain 3: camera-defaults — Default Preset

`stream-store.ts:58` — change `QUALITY_PRESETS[1]` → `QUALITY_PRESETS[2]`.

```typescript
selectedQualityPreset: CameraService.QUALITY_PRESETS[2], // High quality by default
```

The High preset (`QUALITY_PRESETS[2]`) is `1920×1080 @30fps, 1,000,000 bps`. The existing presets array is:

```
[0]: Low     (640×480 @15fps, 200kbps)
[1]: Medium  (1280×720 @24fps, 500kbps)   ← old default
[2]: High    (1920×1080 @30fps, 1Mbps)     ← new default
[3]: Ultra   (1920×1080 @60fps, 2.5Mbps)   ← unchanged
```

`getUserMedia` fallback: if the device cannot do 1080p, the browser returns the nearest supported resolution (usually 720p). No error handling change needed.

## Domain 4: stream-stats — Real Producer Stats

### Mock Data to Replace

`server.ts:618-625` — the `Math.random()` block inside `startStatsBroadcasting`.

### Implementation

```typescript
// Track packet count per producer for frameRate estimation
const prevPackets = new Map<string, { count: number; ts: number }>();

function startStatsBroadcasting() {
  setInterval(async () => {
    try {
      const streams = mediasoupRouter.getActiveStreams();
      if (streams.length === 0) return;

      const results = await Promise.allSettled(
        streams.map(async (stream) => {
          if (!stream.stats) return;
          const producer = mediasoupRouter.getProducer(stream.producerId);
          if (!producer) return;

          const stats = await producer.getStats();
          const rtpStats = stats[0]; // RtpStreamRecvStats
          if (!rtpStats) return;

          stream.stats.bitrate = rtpStats.bitrate;
          stream.stats.packetsLost = rtpStats.packetsLost;
          stream.stats.jitter = rtpStats.jitter;
          stream.stats.rtt = rtpStats.roundTripTime ?? stream.stats.rtt;

          // Estimate frameRate from packet count delta
          const prev = prevPackets.get(stream.producerId);
          const now = Date.now();
          if (prev && prev.count < rtpStats.packetCount) {
            const elapsed = (now - prev.ts) / 1000;
            const delta = rtpStats.packetCount - prev.count;
            stream.stats.frameRate = elapsed > 0 ? Math.round(delta / elapsed) : stream.stats.frameRate;
          }
          prevPackets.set(stream.producerId, { count: rtpStats.packetCount, ts: now });
        })
      );

      // Log per-stream errors but don't fail the whole batch
      for (const result of results) {
        if (result.status === 'rejected') {
          console.error('Stats fetch error:', result.reason);
        }
      }

      io.emit('stream-stats-update', { streams });
    } catch (error) {
      console.error('Error broadcasting stats:', error);
    }
  }, 2000);
}
```

Key decisions:
- **`Promise.allSettled`**: Isolates per-producer failures. A closed producer mid-cycle doesn't crash the broadcast.
- **frameRate estimation**: Mediasoup's `RtpStreamRecvStats` lacks frameRate on the receiver side. Using packet-count delta over the 2s interval gives a rough estimate (~1 packet/frame for H.264 at these resolutions). Falls back to the last known value.
- **No frontend changes**: The `StreamStats` interface (`dashboard.ts:13-19`) matches the backend `StreamInfo['stats']` shape exactly. The event name and payload structure are unchanged.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| spatialLayer in ndiSignaling vs server.ts | (a) Both paths, (b) Only server.ts | (a) fixes both browsers AND NDI bridge, (b) leaves NDI bridge at layer 0 | (a) Both — sync the fix |
| maxIncomingBitrate value | 5/10/20 Mbps | 5 may clip peaks, 20 is overkill for mobile | 10 Mbps — headroom for 1080p |
| frameRate source | (a) Packet delta estimator, (b) Fixed 30, (c) Remove field | (a) Rough but dynamic, (b) Won't show pauses, (c) Breaks frontend | (a) Packet delta |
| H.264 High Profile position | (a) Before baseline, (b) After baseline | (a) Would be preferred over baseline, breaking compat, (b) Baseline preferred by default | (b) After baseline |

## File Map

| File | Lines | Action | Change |
|------|-------|--------|--------|
| `backend/src/server.ts` | 471 | Modify | `spatialLayer: 0` → `2` |
| `backend/src/server.ts` | 611-634 | Rewrite | Replace `Math.random()` mock with `async getStats()` |
| `backend/src/mediasoup/config.ts` | 132 | Modify | `maxIncomingBitrate`: `1500000` → `10000000` |
| `backend/src/mediasoup/config.ts` | 77-92 | Insert | Add H.264 High Profile codec entry |
| `backend/src/mediasoup/ndiSignaling.ts` | 146 | Insert | Add `setPreferredLayers({ spatialLayer: 2, temporalLayer: 0 })` after resume |
| `frontend/src/store/stream-store.ts` | 58 | Modify | `QUALITY_PRESETS[1]` → `QUALITY_PRESETS[2]` |

## Testing Strategy

No automated tests exist. All verification is manual:

| Domain | What to Verify | How |
|--------|---------------|-----|
| ndi-bridge-quality | NDI output at 720p (not ~180p) | Check NDI source resolution in OBS/Resolume |
| ndi-bridge-quality | Dashboard consumer still works | Preview card renders video |
| stream-encoding-config | Producer bitrate reaches 2-4 Mbps | Dashboard stats show >1.5 Mbps |
| stream-encoding-config | iOS H.264 High Profile negotiated | Mediasoup logs show `640c1f` match |
| stream-encoding-config | Desktop baseline still works | Browser consumer connects without SDP error |
| camera-defaults | New device starts at 1080p | Dashboard resolution field shows 1920×1080 |
| camera-defaults | Device that can't do 1080p falls back | Test on 720p-only device — no crash |
| stream-stats | Dashboard shows real (non-random) values | Values change smoothly, not random jumps |
| stream-stats | Producer close doesn't crash stats | Stop streaming — dashboard doesn't error |
| stream-stats | Paused producer shows 0 bitrate | Pause producer — stats reflect paused state |

## Rollout Order

1. **spatialLayer fix** (both server.ts + ndiSignaling.ts) — root cause, immediate impact
2. **bitrate cap increase** — needs deploy to take effect on new transports
3. **H.264 High Profile** — codec change, needs router re-init (server restart)
4. **camera defaults** — frontend-only, deploy independently
5. **real stats** — backend-only, no frontend changes needed

Each change is an independently revertible commit.
