# Tasks: Stream Pipeline Optimization

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~78 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: NDI Bridge Quality Fix

- [x] 1.1 `backend/src/server.ts:471` — Change `spatialLayer: 0` → `2` in `resume-consumer` handler. Dep: None. Effort: Low. Rollback: revert to `0`.
- [x] 1.2 `backend/src/mediasoup/ndiSignaling.ts:146` — Add `consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 0 })` after `consumer.resume()`, wrapped in try/catch. Dep: None. Effort: Low. Rollback: revert commit.
- [ ] 1.3 Manual E2E: NDI bridge output at 720p in OBS/Resolume; dashboard consumer still works; producer without layer 2 no crash.

## Phase 2: Stream Encoding Config

- [x] 2.1 `backend/src/mediasoup/config.ts:132` — Change `maxIncomingBitrate` from `1500000` to `10000000`. Dep: Phase 1. Effort: Low. Rollback: revert to `1500000`.
- [x] 2.2 `backend/src/mediasoup/config.ts:77-92` — Insert H.264 High Profile (`640c1f`) codec entry after existing Baseline entry, preserving `rtcpFeedback` and `x-google-start-bitrate`. Dep: Phase 1. Effort: Low. Rollback: revert commit.
- [ ] 2.3 Manual E2E: Producer bitrate reaches 2-4 Mbps in dashboard; iOS logs show `640c1f` match; desktop baseline still connects.

## Phase 3: Camera Defaults

- [x] 3.1 `frontend/src/store/stream-store.ts:58` — Change `QUALITY_PRESETS[1]` → `QUALITY_PRESETS[2]` for `selectedQualityPreset`. Dep: None (frontend-only, independent). Effort: Low. Rollback: revert to `QUALITY_PRESETS[1]`.
- [ ] 3.2 Manual E2E: Fresh device starts at 1080p@30fps; switching to Medium/Ultra still works; 720p-only device falls back gracefully.

## Phase 4: Real Stream Stats

- [x] 4.1 `backend/src/server.ts:611-634` — Replace `Math.random()` mock block with async `producer.getStats()` using `Promise.allSettled`, `prevPackets` delta for frameRate estimation, try/catch per producer. Dep: Phase 1. Effort: Medium. Rollback: revert commit.
- [ ] 4.2 Manual E2E: Dashboard shows smoothly changing real values (bitrate, packetsLost, frameRate, jitter); producer close mid-cycle no crash; paused producer shows 0 bitrate.
