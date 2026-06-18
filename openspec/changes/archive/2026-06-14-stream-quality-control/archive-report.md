# Archive Report: Stream Quality Control

**Archived**: 2026-06-14
**Verdict**: PASS WITH WARNINGS (intentional-with-warnings)
**Mode**: hybrid (openspec + engram)

---

## Change Summary

Replaced iPhone's single-adaptive-bitrate encoding with 3-layer simulcast (1080p/540p/270p) and added operator quality selection in the dashboard. Server propagates the chosen spatial layer to ALL consumers (browser + NDI) simultaneously via `consumer.setPreferredLayers()`.

## Files Changed (9)

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `backend/src/mediasoup/router.ts` | Modified | Added `getConsumersByProducerId()` — iterates private `consumers` Map, filters by `producerId`, returns `Consumer[]` |
| 2 | `frontend/src/lib/webrtc-client.ts` | Modified | Single encoding → 3-layer simulcast array (`scaleResolutionDownBy: [4,2,1]`, `maxBitrate: [200k, 500k, 4M]`); iOS Safari UA fallback to single `maintain-resolution` encoding |
| 3 | `backend/src/server.ts` | Modified | Added `set-stream-quality` socket handler: validates params, iterates consumers with per-consumer try/catch, broadcasts `stream-quality-changed`, returns `consumersUpdated` count |
| 4 | `frontend/src/types/dashboard.ts` | Modified | Added `SpatialLayer`, `QualityLabel`, `StreamQuality` types; optional `quality` field on `StreamInfo` |
| 5 | `frontend/src/lib/dashboard-service.ts` | Modified | Added `setStreamQuality()` socket emit + `onStreamQualityChanged` callback; registered `stream-quality-changed` listener |
| 6 | `frontend/src/store/dashboard-store.ts` | Modified | Added `setStreamQuality` action updating store + calling service; wired `onStreamQualityChanged` callback |
| 7 | `frontend/src/components/dashboard/StreamControls.tsx` | Modified | Added 3 segmented quality buttons (Low/Medium/High) with active highlight; skips re-select of current quality |
| 8 | `frontend/src/components/dashboard/StreamCard.tsx` | Modified | Added quality badge overlay (top-right of preview) showing current label; defaults to "High" |
| 9 | `frontend/src/lib/webrtc-consumer.ts` | Modified | Added `setSpatialLayer(layer)` — checks consumer type, calls `setPreferredLayers` with try/catch, silent no-op for non-simulcast consumers |

## Implementation Order

### Phase 1: Core Infrastructure (Backend + Producer)
- **1.1** `router.ts` — `getConsumersByProducerId()` ✅
- **1.2** `webrtc-client.ts` — 3-layer simulcast + iOS fallback ✅
- **1.3** `server.ts` — `set-stream-quality` socket handler ✅

### Phase 2: Frontend Plumbing (Types/Service/Store)
- **2.1** `types/dashboard.ts` — `StreamQuality` types ✅
- **2.2** `dashboard-service.ts` — quality methods + callback ✅
- **2.3** `dashboard-store.ts` — quality action + wiring ✅

### Phase 3: Dashboard UI Components
- **3.1** `StreamControls.tsx` — quality selector buttons ✅
- **3.2** `StreamCard.tsx` — quality badge overlay ✅

### Phase 4: Browser Consumer Method
- **4.1** `webrtc-consumer.ts` — `setSpatialLayer()` method ✅

**9/9 tasks complete**

## iOS Fallback Implementation

iOS Safari simulcast support is unverified (iOS Safari WebRTC limitations are a known concern). The producer detects iOS Safari via `navigator.userAgent` (excluding Chrome/CriOS/FxiOS/OPiOS/mercury) and falls back to a single encoding:

```typescript
const encodings = isIOS
  ? [{ maxBitrate: 10000000, scaleResolutionDownBy: 1, degradationPreference: 'maintain-resolution' }]
  : [/* 3 simulcast layers */];
```

This fallback fires at `sendTransport.produce()` time. If iOS does support simulcast in a future version, the UA detection can be relaxed or replaced with a runtime `producer.layerschange` detection approach.

## Spec Merge Details

| Domain | Action | Details |
|--------|--------|---------|
| `stream-pipeline` | Updated | Added section 5 with 8 new requirements (R-SQC-001 through R-SQC-008); removed outdated non-goal "Simulcast architecture changes — No change to sender encoding configuration" |

### Requirements Added
- R-SQC-001: Producer simulcast encodings [sdp-exchange]
- R-SQC-002: Server set-stream-quality event
- R-SQC-003: MediasoupRouter.getConsumersByProducerId()
- R-SQC-004: Stream quality types and store
- R-SQC-005: Dashboard quality selector
- R-SQC-006: Dashboard quality badge
- R-SQC-007: Browser consumer setSpatialLayer method
- R-SQC-008: DashboardService quality methods

### Reconciliation Note
R-SQC-007 method name was changed from `setQuality()` (delta spec) to `setSpatialLayer()` during merge to match design, tasks, and implementation. The verify-report flagged this as a WARNING — the code was correct, the spec was outdated. Resolved by updating the main spec to align with design/tasks/implementation.

## Verification Results

| Metric | Value |
|--------|-------|
| Tasks total | 9 |
| Tasks complete | 9 |
| Tests pass | 32/32 (2 frontend + 30 backend) |
| Pre-existing TS errors | 6 backend + 1 frontend (degradationPreference type gap) |
| Spec compliance | 8/8 requirements implemented (static analysis) |
| Scenario coverage | 0/19 with runtime tests (E2E/manual pattern) |

**Verdict**: PASS WITH WARNINGS — all 9 tasks complete, all 8 requirements implemented. Documentation inconsistency between spec and design resolved during archive merge. Zero runtime tests for new functionality (consistent with project's E2E/manual testing strategy).

## Archived Artifacts

| Artifact | Path |
|----------|------|
| Proposal | `openspec/changes/archive/2026-06-14-stream-quality-control/proposal.md` |
| Spec (delta) | `openspec/changes/archive/2026-06-14-stream-quality-control/spec.md` |
| Design | `openspec/changes/archive/2026-06-14-stream-quality-control/design.md` |
| Tasks | `openspec/changes/archive/2026-06-14-stream-quality-control/tasks.md` |
| Verify report | `openspec/changes/archive/2026-06-14-stream-quality-control/verify-report.md` |
| Archive report | `openspec/changes/archive/2026-06-14-stream-quality-control/archive-report.md` |

### Engram Observation IDs
| Artifact | Observation ID |
|----------|---------------|
| Proposal | #105 (architecture) |
| Spec | #106 (architecture) |
| Design | #107 (architecture) |
| Tasks | #108 (architecture) |
| Verify Report | #110 (architecture) |
| Archive Report | (this save) |

## Source of Truth Updated

`openspec/specs/stream-pipeline.md` now includes the stream-quality-control requirements as section 5.

## Risks Carried Forward

1. **iOS Safari simulcast unverified** — UA detection fallback is a proxy. Real device testing needed to confirm.
2. **No automated WebRTC/Socket.io tests** — 0/19 spec scenarios have runtime coverage. Risk if regression is introduced in future changes touching these areas.
3. **`(stream as any).quality` casts in 4 locations** — dashboard-service.ts `StreamInfo` interface lacks `quality` field, requiring type casts. Cleanup recommended.

## SDD Cycle Complete

The change has been fully explored, proposed, specified, designed, implemented, verified, and archived. Ready for the next change.
