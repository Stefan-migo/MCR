# Design: Camera Lens Control

## Technical Approach

Extend the existing `CameraService` to enumerate individual camera lenses via `getCapabilities()` and add per-device zoom control. Backend relays lens commands between dashboard and phone using the same socket-ID routing pattern as NDI control. Lenses are exposed in `stream-started` payload through a new `cameraInfo` field on `StreamInfo`.

## Architecture Decisions

### Decision: applyConstraints vs stream restart for lens switching

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Always restart stream + producer | Clean path, works on all devices | ~500ms video gap, WebRTC renegotiation |
| `applyConstraints({ zoom })` for same-groupId lenses | Instant switch, no renegotiation | Only works when zoom constraint is supported (iOS back cameras, limited Android) |

**Choice**: Try `applyConstraints` first when target lens is same `groupId` as active lens. On failure or cross-group switch, restart the stream. The `switchToLens()` method selects the path automatically.

### Decision: Backend relay pattern for remote lens control

**Choice**: Reuse the NDI control relay pattern — dashboard emits `set-camera-lens` → backend forwards by socket ID lookup → phone responds with `camera-lens-changed`. No WebRTC involvement on the relay path.

**Alternatives considered**: Direct dashboard→phone signaling (no relay path, simpler) — rejected because phones may be behind NAT and socket.io multiplexing already handles the routing via the backend.

### Decision: Two-phase enumeration for iOS

**Choice**: `enumerateLenses()` first calls `getUserMedia({ video: true, audio: false })` with a minimal constraint, stops the stream immediately, then calls `enumerateDevices()` + `getCapabilities()` per device. This ensures iOS populates device labels.

**Rationale**: iOS Safari returns empty labels until camera permission is granted via an active `getUserMedia` call. Without this, the lens picker shows "Camera 1, Camera 2" — useless to the user.

## Data Flow

### Remote Lens Switch Sequence

```
Dashboard                Backend                       Phone
   │                        │                            │
   │  set-camera-lens       │                            │
   │  { deviceId,           │                            │
   │    lensDeviceId }      │                            │
   │───────────────────────>│                            │
   │                        │  socket.to(phone)          │
   │                        │  .emit('set-camera-lens',  │
   │                        │    { lensDeviceId })       │
   │                        │───────────────────────────>│
   │                        │                            │ switchToLens()
   │                        │                            │ (applyConstraints
   │                        │                            │  or restart
   │                        │                            │  stream+producer)
   │                        │                            │
   │                        │  camera-lens-changed       │
   │                        │  { deviceId, activeLens,   │
   │                        │    zoom, success }         │
   │                        │<───────────────────────────│
   │  camera-lens-changed   │                            │
   │  (broadcast)           │                            │
   │<───────────────────────│                            │
```

### Lens Enumeration Flow (Phone Client)

```
User Opens Stream Page
        │
        ▼
  initializeServices()
        │
        ▼
  CameraService.initialize()
        │
        ▼
  updateAvailableDevices()  ← existing, label-only
        │
        ▼
  CameraService.enumerateLenses()  ← NEW
        │
        ├─ getUserMedia(grant permission on iOS)
        ├─ stop test stream
        ├─ enumerateDevices() → filter videoinput
        ├─ per device: getCapabilities() → zoom/{min,max,step}
        └─ return LensInfo[] with lensType derived from label
        │
        ▼
  Phone emits register-camera-info { deviceId, lenses }
        │
        ▼
  Backend stores in DeviceInfo, attaches to stream-started
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/lib/camera-service.ts` | Modify | Add `LensInfo` type, `enumerateLenses()`, `switchToLens()`, `setZoom()` |
| `frontend/src/store/stream-store.ts` | Modify | Add `lenses`, `activeLens`, `zoom`, `registerCameraInfo` state + actions |
| `frontend/src/components/StreamControls.tsx` | Modify | Replace switch button with lens picker (horizontal chips) + zoom slider |
| `frontend/src/app/stream/page.tsx` | Modify | Wire `enumerateLenses()` on init, pass lens/zoom state to StreamControls |
| `frontend/src/types/dashboard.ts` | Modify | Add `CameraInfo` to `StreamInfo` |
| `frontend/src/lib/dashboard-service.ts` | Modify | Add `onCameraLensChanged` callback, `setCameraLens()` socket emit |
| `frontend/src/store/dashboard-store.ts` | Modify | Add `setCameraLens()` action, `camera-lens-changed` handler |
| `frontend/src/components/dashboard/StreamModal.tsx` | Modify | Add Camera section (lens dropdown + zoom slider below NDI controls) |
| `backend/src/mediasoup/router.ts` | Modify | Add `cameraInfo?: CameraInfo` to `StreamInfo` |
| `backend/src/server.ts` | Modify | Add `register-camera-info`, `set-camera-lens`, `camera-lens-changed` socket handlers |

## Interfaces / Contracts

```typescript
// frontend/src/lib/camera-service.ts — NEW types
interface LensInfo {
  deviceId: string;
  label: string;
  groupId: string;
  facingMode?: 'user' | 'environment';
  zoomMin: number;   // 1 if unsupported
  zoomMax: number;   // 1 if unsupported
  zoomStep: number;  // 0.1 typical
  lensType: 'ultra-wide' | 'wide' | 'telephoto' | 'front' | 'unknown';
}

// Attached to StreamInfo for signaling
interface CameraInfo {
  lenses: LensInfo[];
  activeLens: string;  // deviceId of current lens
  zoom: number;
}
```

### Socket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `register-camera-info` | Phone→Backend | `{ deviceId, lenses: LensInfo[], activeLens, zoom }` |
| `set-camera-lens` | Dashboard→Backend→Phone | `{ deviceId, lensDeviceId, zoom? }` |
| `camera-lens-changed` | Phone→Backend→Dashboard | `{ deviceId, activeLens, zoom, success }` |

### `stream-started` Payload Extension

```typescript
// Backend adds cameraInfo to the stream payload when available
interface StreamStartedEvent {
  stream: {
    ...existing StreamInfo,
    cameraInfo?: CameraInfo;  // ← NEW
  };
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — CameraService | `enumerateLenses()` transforms devices to LensInfo correctly | Mock `enumerateDevices` + `getCapabilities`. Verify lensType heuristics, zoom range fallback |
| Unit — CameraService | `switchToLens()` chooses applyConstraints vs restart path | Mock track.getCapabilities to toggle zoom support. Verify path selection |
| Unit — Socket handlers | `register-camera-info` updates device metadata correctly | Test backend handler stores lens data and attaches to stream-started |
| Integration | Remote lens switch roundtrip | Socket.io test: dashboard emits → backend relays → phone handler called → response broadcast |
| E2E | Full flow on iOS | Manual: real device, verify labels appear, lens switching works |

## Migration / Rollout

No migration required. New socket events are additive. Old dashboard clients ignore unknown events. Phone client auto-upgrades on next load. Rollback: revert socket events and restore single-toggle `StreamControls`.

## Open Questions

- [ ] Does `getCapabilities()` return zoom parameters on the target Android devices? (Pixels do, budget devices may not)
- [ ] iOS optical zoom values across models (iPhone 15 Pro has 0.5x/1x/3x/5x, iPhone 16e has 1x only) — need fallback to show only lenses that exist
