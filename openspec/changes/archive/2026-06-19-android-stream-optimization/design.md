# Design: Android Stream Optimization

## Technical Approach

Extend the existing iOS platform-detection pattern to Android across 4 orthogonal frontend changes: (1) single encoding with `maintain-resolution` for Android producers, (2) default 720p for all mobile, (3) force VP8 codec via `rtpCapabilities` filter, (4) adaptive bitrate reduction via `RTCRtpSender.setParameters()` when CPU-limited. No backend or signaling changes — all decisions happen client-side before/during `sendTransport.produce()`.

## Architecture Decisions

### Decision: Android detection method

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `CameraService.isMobileDevice()` | Conflates Android+iOS; can't distinguish for different bitrate | ❌ |
| UA regex `/android/i` | Same pattern as existing `isIOS`; both needed in same method | ✅ |
| Feature detection (navigator.mediaDevices) | Doesn't distinguish platform; unreliable | ❌ |

**Rationale**: We need to distinguish Android (10Mbps, VP8 forced) from iOS (5Mbps, H.264 available) from desktop (3 simulcast layers). UA regex is the existing, proven pattern.

### Decision: Encoding branch structure

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Nested ternary | Compact but hard to read with 3 branches | ❌ |
| Helper function `getEncodings()` | Clean, testable, follows SRP | ✅ |
| Config map per platform | Over-engineered for 3 variants | ❌ |

**Rationale**: A helper function returning the encoding array is testable in isolation and keeps `startStream()` readable.

### Decision: Default quality initialization

| Option | Tradeoff | Decision |
|--------|----------|----------|
| IIFE in initial state | SSR-safe (`typeof navigator` guard); no lifecycle change | ✅ |
| Initialize in `initializeServices` | Works but spreads responsibility; need to call after CameraService mock setup | ❌ |

### Decision: VP8 filter scope

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Replace existing regex with `/android/i` | Loses targeted MediaTek fix for non-Android devices with buggy H.264 | ❌ |
| Add `isAndroid` before existing regex | Extends coverage; preserves manual `force-vp8` override | ✅ |

**Rationale**: The existing MediaTek-specific regex still protects those devices on any platform. Adding `/android/i` catches all Android OEM H.264 quirks.

### Decision: Stats adaptation mechanism

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `RTCRtpSender.setParameters()` | Non-destructive; no ICE restart; updates live encoding | ✅ |
| Producer restart (close + recreate) | Destructive; gap in stream; complex state management | ❌ |
| Rely solely on `maintain-resolution` | Already active but can't differentiate CPU vs network; no recovery | ❌ |

**Rationale**: `sender.setParameters()` adjusts `maxBitrate` on the live producer without stream interruption — matches NDI's requirement for constant resolution output.

### Decision: Adaptation state ownership

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Inline in `startStatsMonitoring` | Simple; keeps all adaptation in one place | ✅ |
| New `AdaptiveController` class | Extracts responsibility but new file + import for ~50 lines | ❌ |

**Rationale**: Size budget and scope don't justify a new abstraction. Four class fields + a stat check block in the existing 2s interval.

## Data Flow

```
startStream() → createSendTransport → produce(videoTrack)
  → producer created with single encoding (Android) or 3 layers (desktop)
  → startStatsMonitoring() fires every 2s

Stats Adaptation Loop:
  [2s tick]
    → producer.getStats()
    → filter outbound-rtp
    → check qualityLimitationReason
    │
    ├── reason === 'cpu'?
    │     → cpuStruggleCount++
    │     → count >= 5 && !adapted?
    │         → sender.setParameters({ maxBitrate: original * 0.6 })
    │         → adapted = true, recoveryCount = 0
    │
    └── reason !== 'cpu' && adapted?
          → recoveryCount++
          → count >= 10?
              → sender.setParameters({ maxBitrate: original })
              → adapted = false, cpuStruggleCount = 0
```

No signaling sequence changes — this is entirely a client-side monitoring loop. Mediasoup transport lifecycle unchanged.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/lib/webrtc-client.ts` | Modify | Add `isAndroid` detection (line ~152); extract `getEncodings()` helper; expand VP8 filter to all Android (line ~84-93); add adaptation logic to `startStatsMonitoring` (line ~338) |
| `frontend/src/store/stream-store.ts` | Modify | Dynamic default `selectedQualityPreset` — IIFE checking `CameraService.isMobileDevice()` (line 71) |
| `frontend/src/lib/camera-service.ts` | Modify | Align `getOptimalConstraints` mobile `frameRate` from 30 to 24fps (Medium preset consistency) |

## Interfaces / Contracts

```typescript
// Adaptation thresholds — new module constants in webrtc-client.ts
const ADAPTATION_CPU_THRESHOLD = 5;      // consecutive cpu-limited samples → reduce
const ADAPTATION_RECOVERY_THRESHOLD = 10; // consecutive normal samples → restore
const ADAPTATION_BITRATE_REDUCTION = 0.6; // multiplier on maxBitrate

// New class fields on WebRTCClient
private adapted: boolean = false;
private originalMaxBitrate: number | null = null;
private cpuStruggleCount: number = 0;
private recoveryCount: number = 0;

// New helper
private getEncodings(isIOS: boolean, isAndroid: boolean): RTCRtpEncodingParameters[]
// Returns: Android → [{ maxBitrate: 10_000_000, scaleResolutionDownBy: 1, degradationPreference: 'maintain-resolution' }]
//          iOS → [{ maxBitrate: 5_000_000, ... }]
//          Desktop → [{ scaleResolutionDownBy: 4, maxBitrate: 200000 }, ... 3 layers]
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | UA detection | Mock `navigator.userAgent`; test `isAndroid`, `isIOS`, desktop |
| Unit | `getEncodings()` | Test returns correct array per platform; test maintains `maintain-resolution` |
| Unit | Default quality | Mock `CameraService.isMobileDevice()`; verify `selectedQualityPreset` = Medium on mobile, High on desktop |
| Unit | VP8 filter | Mock UA + `rtpCapabilities.codecs`; assert H.264 removed for Android, preserved for iOS/desktop |
| Unit | Stats counters | Test `cpuStruggleCount`/`recoveryCount` increment/reset logic with mock stats arrays (5→adapt, 10→restore) |
| Regression | iOS + desktop unchanged | Verify `isAndroid` false paths produce existing behavior |

`sender.setParameters()` I/O cannot be unit tested without a real RTCRtpSender — the counter logic is independently testable.

## Migration / Rollout

No migration required. All changes are client-side and take effect on next page load. Feature flags not needed — changes are backwards-compatible (Android gets better defaults, desktop is unaffected).

## Open Questions

- None
