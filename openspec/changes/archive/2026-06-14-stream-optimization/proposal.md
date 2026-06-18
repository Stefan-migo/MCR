# Proposal: Stream Pipeline Optimization

## Intent

NDI bridge receives the lowest simulcast layer (spatialLayer=0 → ~180p@200kbps), producing poor-quality NDI output for OBS/Resolume. The fix is to consume the highest layer (spatialLayer=2 → 720p@1Mbps) and tune the rest of the pipeline — camera defaults, bitrate caps, H.264 profile, and stats — for a professional-quality end-to-end stream.

## Scope

### In Scope
1. Fix NDI bridge consumer to request `spatialLayer: 2` instead of `spatialLayer: 0`
2. Upgrade default camera preset from Medium (720p@24fps, 500kbps) to High (1080p@30fps, 1Mbps)
3. Remove/increase `maxIncomingBitrate` (1.5Mbps → 5-10Mbps) to prevent bottleneck
4. Add H.264 High Profile (`640c1f`) to mediasoup router codecs for iOS hardware support
5. Replace fake random dashboard stats with real mediasoup `getStats()` data

### Out of Scope
- NDI bridge Python code changes (already receives correct `rtpParams`; no changes needed)
- Simulcast architecture changes (keep 3 layers; browser consumers still adapt)
- Sender-controlled single-stream approach (Approach C) — deferred if needed
- AV1 or VP9 codec tuning — current H.264 focus is sufficient
- Prometheus/Grafana monitoring integration — future work

## Capabilities

### New Capabilities
- `ndi-bridge-quality`: NDI bridge consumer spatial/temporal layer configuration
- `stream-encoding-config`: mediasoup encoding profiles, bitrate caps, codec profile settings
- `camera-defaults`: default camera quality preset selection
- `stream-stats`: real mediasoup producer stats broadcasting

### Modified Capabilities
None — existing `auto-ip-detection` spec is unrelated.

## Approach

Five atomic changes, independently deployable and revertible:

1. **spatialLayer fix** (critical): `backend/src/server.ts:471` — change `spatialLayer: 0` to `spatialLayer: 2` in the `resume-consumer` handler for NDI bridge consumers. This is a one-line change but is the root cause of the quality issue.

2. **Default preset change** (frontend): `frontend/src/store/stream-store.ts:58` — change `QUALITY_PRESETS[1]` (Medium) to `QUALITY_PRESETS[2]` (High: 1920×1080 @30fps, 1Mbps). New users start with HD by default.

3. **Bitrate cap increase** (backend config): `backend/src/mediasoup/config.ts:132` — increase `maxIncomingBitrate` from `1500000` to `10000000` (10 Mbps). Sustained 1080p H.264 can peak at 4-8 Mbps; this leaves headroom.

4. **H.264 High Profile** (backend config): `backend/src/mediasoup/config.ts:66-92` — add a second H.264 codec entry with `profile-level-id` = `640c1f` (High Profile 4.1). Keep existing Constrained Baseline (`42e01f`) for backward compat. iOS hardware encoder will negotiate High Profile when available.

5. **Real stats** (backend): `backend/src/server.ts:618-625` — replace `Math.random()` mock data with periodic `producer.getStats()` calls, then broadcast real bitrate/packetsLost/frameRate/jitter to dashboard.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/server.ts` | Modified (2 spots) | spatialLayer arg (L471) + stats broadcasting (L618-625) |
| `backend/src/mediasoup/config.ts` | Modified | maxIncomingBitrate + H.264 High Profile codec entry |
| `frontend/src/store/stream-store.ts` | Modified | Default preset index change |
| `ndi-bridge/src/webrtc_consumer.py` | Untouched | Already receives correct rtpParams; spatialLayer is server-side |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Higher NDI bridge bandwidth (200Kbps → ~1-2Mbps per stream on LAN) | High | LAN networks handle this trivially. Monitor if bridge is remote/WAN. |
| iOS thermal throttling at 1080p@30fps | Medium | Keep Medium/Ultra presets available for user override. Default choice is conservative. |
| H.264 High Profile incompatibility with some browser decoders | Low | Keep Baseline profile as first codec entry; client negotiates. Backward compatible. |
| `maxIncomingBitrate` removal could cause congestion on shared uplinks | Low | Applies to producer-side (device→SFU), not SFU→consumers. Device bandwidth is the limiter, not SFU. |
| No existing tests to validate changes | Medium | Manual E2E verification: check NDI output resolution, dashboard stats, stream stability. |


## Rollback Plan

Each change is an atomic, independently revertible commit:

| Item | Rollback |
|------|----------|
| spatialLayer fix | Revert to `spatialLayer: 0` |
| Default preset | Revert to `QUALITY_PRESETS[1]` |
| Bitrate cap | Revert `maxIncomingBitrate` to `1500000` |
| H.264 High Profile | Remove the second codec entry (revert commit) |
| Real stats | Revert to `Math.random()` mock block |

If any change causes regression, revert its commit and re-deploy. No migration or data loss risk.

## Dependencies

- **Ordering**: Item 1 (spatialLayer) should be done first — it's the root cause and has immediate impact. Items 2-5 are independent of each other and can be done in any order after 1.
- **No external dependencies**: All changes are internal to this repo.
- **No NDI bridge changes**: The bridge already handles whatever spatial layer the server sends.

## Success Criteria

- [ ] NDI bridge consumer receives and renders frames at 720p (spatialLayer=2) quality
- [ ] New device streams default to 1080p@30fps without user intervention
- [ ] Producer bitrate reaches 1-4 Mbps under normal lighting (no artificial cap at 1.5 Mbps)
- [ ] iOS devices negotiate H.264 High Profile when available
- [ ] Dashboard displays real (non-random) bitrate, packetsLost, frameRate, jitter
- [ ] No regression on browser dashboard consumer quality
