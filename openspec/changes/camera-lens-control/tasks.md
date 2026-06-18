# Tasks: Camera Lens Control

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~460 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Phone client (Phase 1–2) → PR 2: Backend + Dashboard (Phase 3–4) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Phone: CameraService + lens picker UI | PR 1 | Base = main; standalone phone-side feature (~255 lines) |
| 2 | Backend signaling + Dashboard controls | PR 2 | Base = main after PR 1 merges; depends on CameraInfo type defined in PR 1 (~205 lines) |

## Phase 1: CameraService + Data Model (Phone Client)

- [x] 1.1 Add `LensInfo` interface with `lensType` heuristic in `frontend/src/lib/camera-service.ts` (R-CLC-002)
- [x] 1.2 Implement `enumerateLenses()` with two-phase iOS init: `getUserMedia` → stop → `enumerateDevices` → `getCapabilities` per device (R-CLC-001, R-CLC-005)
- [x] 1.3 Implement `switchToLens(deviceId)`: same-groupId → `applyConstraints(zoom)`; cross-group → deviceId stream restart with abort-pending logic (R-CLC-003, R-CLC-006)
- [x] 1.4 Implement `setZoom(level)` using `track.applyConstraints({ advanced: [{ zoom }] })` (R-CLC-004)
- [x] 1.5 Export `CameraInfo` type (lenses, activeLens, zoom) from `camera-service.ts` for `stream-started` payload

## Phase 2: Phone Client UI

- [x] 2.1 Add `lenses`, `activeLens`, `zoom`, `registerCameraInfo` state + `selectLens`, `setZoom`, `setLenses` actions to `frontend/src/store/stream-store.ts`
- [x] 2.2 Replace single toggle in `StreamControls.tsx` with lens picker (horizontal chips grouped by facingMode); emit `selectLens` on tap (R-CLC-003)
- [x] 2.3 Add zoom slider to `StreamControls.tsx`; show only when `getCapabilities().zoom` exists; clamp to zoomMin/zoomMax/zoomStep (R-CLC-004)
- [x] 2.4 Wire `enumerateLenses()` call + state in `frontend/src/app/stream/page.tsx`; pass lens/zoom props to `StreamControls`

## Phase 3: Signaling + Backend

- [ ] 3.1 Add `cameraInfo?: CameraInfo` to `StreamInfo` in `frontend/src/types/dashboard.ts` and `backend/src/mediasoup/router.ts` (R-SPD-004)
- [ ] 3.2 Add `register-camera-info` handler in `backend/src/server.ts`: store lenses/activeLens/zoom in device metadata (R-SPD-004)
- [ ] 3.3 Extend `stream-started` payload to include `cameraInfo` from stored device metadata (R-SPD-004)
- [ ] 3.4 Add `set-camera-lens` handler (dashboard→backend→phone relay) with device-not-connected error response (R-SPD-005)
- [ ] 3.5 Add `camera-lens-changed` handler (phone→backend→dashboard broadcast) (R-SPD-006)
- [ ] 3.6 Add/refactor helper for socket-ID lookup by deviceId in backend socket handlers

## Phase 4: Desktop Dashboard Controls

- [ ] 4.1 Add `cameraControlState` (per-device Record), `setCameraLens`, `updateCameraControlState`, `setStreamCameraInfo` to `frontend/src/store/dashboard-store.ts` (R-DSM-007)
- [ ] 4.2 Add `setCameraLens()` emit + `onCameraLensChanged` callback to `frontend/src/lib/dashboard-service.ts` (R-DSM-007)
- [ ] 4.3 Add Camera section to `StreamModal.tsx`: lens picker dropdown grouped by facingMode, zoom slider (debounced on release), read-only state indicators (R-DSM-006)
- [ ] 4.4 Wire `stream-started` cameraInfo init + `camera-lens-changed` listener in dashboard socket handlers
- [ ] 4.5 Handle backward compat: hide Camera section when `cameraInfo` absent; revert UI on failed lens switch (R-DSM-006 edge cases)
