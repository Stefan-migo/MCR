# Archive Report: Stream Pipeline Optimization

**Change**: stream-optimization
**Archived at**: 2026-06-14
**Status**: Archived (intentional-with-warnings — see Known Issues below)
**Mode**: hybrid (Engram + openspec)

## Artifact Observation IDs (Engram)

| Artifact | Engram ID | Topic Key |
|----------|-----------|-----------|
| Spec | #98 | `sdd/stream-optimization/spec` |
| Design | #99 | `sdd/stream-optimization/design` |
| Tasks | #100 | `sdd/stream-optimization/tasks` |
| Apply-progress | #101 | `sdd/stream-optimization/apply-progress` |
| Verify-report | #102 | `sdd/stream-optimization/verify-report` |
| Archive-report | #103 | `sdd/stream-optimization/archive-report` |

## Summary: What Was Done

Five atomic, independently revertible changes across 4 domains in the streaming pipeline:

### Domain 1: NDI Bridge Quality (`ndi-bridge-quality`)
- **Problem**: NDI bridge consumer received the lowest simulcast layer (spatialLayer=0, ~180p/200kbps), producing poor NDI output for OBS/Resolume
- **Fix**: Changed `spatialLayer: 0` → `2` in `server.ts:471` (resume-consumer handler), and added `setPreferredLayers({ spatialLayer: 2, temporalLayer: 0 })` with try/catch in `ndiSignaling.ts:146` after consumer.resume()
- **Files**: `backend/src/server.ts`, `backend/src/mediasoup/ndiSignaling.ts`

### Domain 2: Stream Encoding Config (`stream-encoding-config`)
- **Bitrate cap**: `maxIncomingBitrate` increased from 1.5 Mbps → 10 Mbps in `config.ts:132`
- **H.264 High Profile**: Inserted new codec entry (`profile-level-id: '640c1f'`) after existing Baseline entry in `config.ts:93-109`, preserving rtcpFeedback and x-google-start-bitrate
- **Files**: `backend/src/mediasoup/config.ts`

### Domain 3: Camera Defaults (`camera-defaults`)
- **Problem**: New users defaulted to Medium quality (720p@24fps, 500kbps)
- **Fix**: Changed `selectedQualityPreset` from `QUALITY_PRESETS[1]` (Medium) → `QUALITY_PRESETS[2]` (High: 1920×1080 @30fps, 1Mbps) in `stream-store.ts:58`
- **Files**: `frontend/src/store/stream-store.ts`

### Domain 4: Real Stream Stats (`stream-stats`)
- **Problem**: Dashboard showed fake `Math.random()` mock data
- **Fix**: Replaced mock block with async `producer.getStats()` using `Promise.allSettled`, prevPackets delta for frameRate estimation, try/catch per producer in `server.ts:611-660`
- **Files**: `backend/src/server.ts`

## What Was Changed (Files)

| File | Change | Lines | Rollback |
|------|--------|-------|----------|
| `backend/src/server.ts` | `spatialLayer: 0` → `2` at `resume-consumer` handler | ~1 | Revert to `0` |
| `backend/src/server.ts` | `Math.random()` mock → `producer.getStats()` with Promise.allSettled | ~49 | Revert commit |
| `backend/src/mediasoup/ndiSignaling.ts` | Add `setPreferredLayers({ spatialLayer:2, temporalLayer:0 })` after `consumer.resume()` with try/catch | ~6 | Revert commit |
| `backend/src/mediasoup/config.ts` | `maxIncomingBitrate`: 1,500,000 → 10,000,000 | ~1 | Revert to 1,500,000 |
| `backend/src/mediasoup/config.ts` | Insert H.264 High Profile (`640c1f`) codec entry after Baseline | ~17 | Revert commit |
| `frontend/src/store/stream-store.ts` | `QUALITY_PRESETS[1]` (Medium) → `QUALITY_PRESETS[2]` (High) | ~1 | Revert to `QUALITY_PRESETS[1]` |

**Total**: ~75 lines changed across 4 files.

## What Is Verified vs Pending

### Verified (6/6 implementation tasks — static analysis)

| Task | Status | Evidence |
|------|--------|----------|
| 1.1 server.ts spatialLayer=2 | ✅ Complete | Line 471 confirmed |
| 1.2 ndiSignaling.ts setPreferredLayers | ✅ Complete | Line 150 confirmed after consumer.resume() |
| 2.1 config.ts maxIncomingBitrate=10Mbps | ✅ Complete | Line 149 confirmed |
| 2.2 config.ts H.264 High Profile codec | ✅ Complete | Lines 93-109 confirmed |
| 3.1 stream-store.ts High preset default | ✅ Complete | Line 58 confirmed |
| 4.1 server.ts real producer.getStats() | ✅ Complete | Lines 611-660 confirmed with Promise.allSettled |

### Passing Tests
- **Backend**: 30/30 passing (4 test suites)
- **Frontend**: 2/2 passing (1 test suite)
- **Combined**: 32/32 passing

### Pre-existing Issues (not caused by this change)
- 6 TypeScript type errors in `server.ts` (unrelated lines)
- 2 tautology placeholder assertions in `server.test.ts`

### Pending — Manual E2E (to be run by user)

| Task | Description | How to Verify |
|------|-------------|---------------|
| 1.3 | NDI bridge output at 720p in OBS/Resolume | Check NDI source resolution; verify dashboard consumer still works; confirm producer without layer 2 doesn't crash |
| 2.3 | Producer bitrate reaches 2-4 Mbps | Check dashboard stats; verify iOS logs show `640c1f` match; confirm desktop baseline still connects |
| 3.2 | Fresh device starts at 1080p@30fps | Verify dashboard resolution field; test switching to Medium/Ultra; test on 720p-only device for graceful fallback |
| 4.2 | Dashboard shows real (non-random) values | Confirm values change smoothly; verify producer close mid-cycle doesn't crash; confirm paused producer shows 0 bitrate |

## Known Issues / Open Items

### CRITICAL (from verify-report)
1. **TDD protocol not followed** — Strict TDD mode was active but the apply phase did not produce a TDD Cycle Evidence table. Implementation was done without test-first development.
2. **0/20 spec scenarios have automated covering tests** — All 20 requirement scenarios remain untested by automated tests. Static analysis confirms implementation is correct, but no runtime test evidence exists.
3. **4 manual E2E tasks pending** — User must run these before the change is considered fully verified.
4. **Pre-existing tautology assertions** — `server.test.ts` has 2 placeholder tests (`expect(typeof 'function').toBe('string')`) that test nothing.

### WARNING
1. **No automated tests exist for this change** — All 20 spec scenarios lack regression coverage.
2. **6 pre-existing TypeScript errors in `server.ts`** — Unrelated to this change but degrade build health.
3. **Backward compatibility of `maxIncomingBitrate`** — New cap (10 Mbps) only applies to new transports; existing transports retain the old 1.5 Mbps cap until reconnection.

### Design Limitations
- `frameRate` not available in mediasoup `RtpStreamRecvStats` on receiver side — uses packet-count delta estimator instead (rough approximation).
- Bitrate cap increase affects producer→SFU direction only; device-side encoder rate control is the primary limiter.

## Rollback Guide

Each change is an atomic, independently revertible commit:

| Change | Git Revert Steps |
|--------|-----------------|
| **spatialLayer fix** (server.ts + ndiSignaling.ts) | `git revert <commit>` — or manually change `spatialLayer: 2` back to `0` in `server.ts:471` and remove the `setPreferredLayers` block from `ndiSignaling.ts:150` |
| **maxIncomingBitrate** | `git revert <commit>` — or manually change `maxIncomingBitrate` back to `1500000` in `config.ts:149` |
| **H.264 High Profile codec** | `git revert <commit>` — or remove the second H.264 codec entry (lines 93-109) from `config.ts` |
| **Default preset** | `git revert <commit>` — or manually change `QUALITY_PRESETS[2]` back to `QUALITY_PRESETS[1]` in `stream-store.ts:58` |
| **Real stats** | `git revert <commit>` — or restore the `Math.random()` mock block at `server.ts:611-660` |

### Full rollback
```bash
# If all changes are in a single commit:
git revert <commit-hash>

# If changes are across multiple commits (revert in reverse order):
git log --oneline --all -- backend/src/server.ts backend/src/mediasoup/config.ts backend/src/mediasoup/ndiSignaling.ts frontend/src/store/stream-store.ts
# Revert each commit in reverse chronological order:
git revert <newest-hash>
git revert <older-hash>
...
```

### Rollback notes
- No migration or data loss risk — all changes are configuration or behavior, not schema.
- The spatialLayer fix should be the highest priority rollback if NDI output quality regresses.
- The default preset change is frontend-only and immediately revertible without backend deploy.

## Source of Truth Updated

- **New**: `openspec/specs/stream-pipeline.md` — Main spec for stream pipeline optimization (4 capabilities)

## Archive Contents

```
openspec/changes/archive/2026-06-14-stream-optimization/
├── archive-report.md    (this file)
├── proposal.md          ✅
├── spec.md              ✅ (cleaned from delta → main spec format)
├── design.md            ✅
├── tasks.md             ✅ (6/6 impl tasks complete, 4 manual E2E pending)
└── verify-report.md     ✅ (FAIL verdict — see Known Issues)
```
