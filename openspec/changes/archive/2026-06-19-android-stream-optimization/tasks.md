# Tasks: Android Stream Optimization

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300 (prod: 55, tests: 245) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: TDD — RED Tests

- [x] 1.1 Create `frontend/src/lib/__tests__/webrtc-client.test.ts` — failing test: `isAndroid` true on `/android/i` UA, false on desktop/iOS
- [x] 1.2 Add failing test: `getEncodings(true, true)` for Android returns single encoding with `degradationPreference: 'maintain-resolution'` and `maxBitrate: 10_000_000`
- [x] 1.3 Add failing test: `getEncodings(false, false)` returns 3 simulcast layers for desktop; `getEncodings(true, false)` returns single for iOS with `maxBitrate: 5_000_000`
- [x] 1.4 Add failing test: VP8 filter removes H.264 from `rtpCapabilities.codecs` for Android UA, preserves for iOS/desktop
- [x] 1.5 Add failing test: adaptation counters — `cpuStruggleCount` increment on `qualityLimitationReason='cpu'`, adapt at 5 samples, restore at 10 normal samples
- [x] 1.6 Update `frontend/src/store/__tests__/stream-store.test.ts` — failing test: `selectedQualityPreset` = Medium on mobile, High on desktop
- [x] 1.7 Update `frontend/src/lib/__tests__/camera-service.test.ts` — failing test: `getOptimalConstraints` on mobile returns 720p@24fps

## Phase 2: Core Implementation (GREEN)

- [x] 2.1 Add `isAndroid = /android/i.test(navigator.userAgent)` in `webrtc-client.ts` alongside `isIOS` (line ~152)
- [x] 2.2 Extract `getEncodings(isIOS, isAndroid): RTCRtpEncodingParameters[]` helper — Android single {10Mbps, maintain-resolution}, iOS single {5Mbps}, desktop 3 layers
- [x] 2.3 Replace inline ternary encoding in `startStream()` with `getEncodings()` call
- [x] 2.4 Prepend `isAndroid ||` to existing `hasBuggyH264` check in `connect()` — forces VP8 on all Android (line ~85-93)
- [x] 2.5 Add adaptation constants (`ADAPTATION_CPU_THRESHOLD=5`, `ADAPTATION_RECOVERY_THRESHOLD=10`, `ADAPTATION_BITRATE_REDUCTION=0.6`) + class fields (`adapted`, `originalMaxBitrate`, `cpuStruggleCount`, `recoveryCount`)
- [x] 2.6 Add `qualityLimitationReason` monitoring in `startStatsMonitoring()`: 5 consecutive `cpu` → `sender.setParameters({maxBitrate: *0.6})`, 10 normal → restore
- [x] 2.7 Replace `stream-store.ts` line 71: `selectedQualityPreset: (() => typeof navigator !== 'undefined' && CameraService.isMobileDevice() ? CameraService.QUALITY_PRESETS[1] : CameraService.QUALITY_PRESETS[2])()`
- [x] 2.8 Change `camera-service.ts` `getOptimalConstraints` mobile `frameRate` from 30 to 24

## Phase 3: Verification

- [x] 3.1 All RED tests pass — run `npm test` from workspace root (`npm run test:frontend` equivalent)
- [x] 3.2 Manual regression: iOS UA → `isAndroid=false`, single encoding preserved, H.264 kept
- [x] 3.3 Manual regression: desktop UA → 3 simulcast layers, H.264 kept, default High 1080p
- [x] 3.4 Verify Android UA → single encoding, VP8 only, default Medium 720p@24fps
