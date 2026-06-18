# Proposal: Camera Lens Control

## Intent

Replace the binary front/back camera toggle with full lens enumeration and selection. Users can see and pick every available lens (ultra-wide, wide, telephoto, front) from both the phone client and the desktop dashboard, with zoom slider on supported devices.

## Scope

### In Scope
- Enhanced `CameraService` with `enumerateDevices()` + `getCapabilities()` integration
- `LensInfo` type with deviceId, label, groupId, facingMode, zoom range, lensType
- Phone: lens picker replacing the toggle button
- Phone: zoom slider on devices with zoom capability
- Signaling: `register-camera-info` (phone→backend), `set-camera-lens` (dashboard→backend→phone)
- Desktop: camera controls in StreamModal (lens picker + zoom slider)
- iOS: two-phase initialization (getUserMedia for permissions, then enumerate)
- Fallback: deviceId-based switching when zoom unsupported

### Out of Scope
- Torch/flash control
- Focus/pan/tilt control
- Photo capture from desktop

## Capabilities

### New Capabilities
- `camera-lens-control`: Lens enumeration, selection, and zoom management on the phone client

### Modified Capabilities
- `stream-pipeline`: Camera info attached to stream metadata; new signaling events for remote lens control
- `dashboard-stream-modal`: Add remote camera controls (lens picker, zoom if available)

## Approach

Combined enumeration: `enumerateDevices()` after first `getUserMedia` for labels/deviceId/groupId, plus `getCapabilities()` for zoom range per device. Hybrid switching: `deviceId` for primary switch (stream restart) + `zoom` constraints for back-camera lens switching on iOS (instant, no restart). Remote control reuses `stream-started` for camera-info propagation, single `set-camera-lens` command event.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/lib/camera-service.ts` | Major | Add enumeration, getCapabilities, applyConstraints, deviceId-targeted start |
| `frontend/src/store/stream-store.ts` | Modified | New state: camera list, selected lens, zoom level; new actions |
| `frontend/src/components/StreamControls.tsx` | Major | Replace toggle with lens picker + zoom slider |
| `frontend/src/components/dashboard/StreamModal.tsx` | Modified | Add remote camera controls section |
| `frontend/src/lib/dashboard-service.ts` | Modified | New socket events for camera info and remote control |
| `frontend/src/store/dashboard-store.ts` | Modified | New actions for remote camera control |
| `backend/src/server.ts` | Modified | New signaling events for camera relay |
| `backend/src/mediasoup/router.ts` | Modified | Extend StreamInfo with camera metadata |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| iOS empty labels until first getUserMedia | High | Two-phase init: grant permission first, then enumerate |
| Zoom unsupported on device | Medium | Check capabilities before showing slider; fall back to deviceId switching |
| Zoom = digital zoom on Android, not optical | High | Label "zoom" generically; deviceId for real lens switching on Android |
| Stream restart drops video ~500ms | Medium | Show "Reconnecting..." overlay; use zoom constraints when possible |

## Rollback Plan

Revert the `stream-started` payload extension and `set-camera-lens` socket events. Restore `StreamControls` to the single toggle button. No backend migration needed — new events are additive, old clients ignore unknown events.

## Success Criteria

- [ ] Phone client shows ALL available cameras with correct labels
- [ ] Selecting a lens on the phone switches the camera within 2 seconds
- [ ] Dashboard operator can remotely select a lens for a streaming device
- [ ] Zoom slider appears on iOS back cameras, hidden on unsupported devices
- [ ] deviceId fallback works when zoom is unavailable
