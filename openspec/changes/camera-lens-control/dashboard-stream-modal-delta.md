# Delta: Dashboard Stream Modal — Remote Camera Controls

## Purpose

Add a "Camera" section to the StreamModal overlay, enabling dashboard operators to remotely view and control a streaming device's camera lenses and zoom level. Camera state (available lenses, active lens, zoom) comes from `stream-started`'s extended payload (R-SPD-004) and is kept in sync via `camera-lens-changed` events (R-SPD-006).

This delta is additive — existing modal controls (rename, quality, NDI, disconnect, open-in-window) are untouched.

## Requirements

### R-DSM-006: Remote Camera Controls in StreamModal

The StreamModal MUST render a "Camera" section containing:

1. **Lens picker dropdown**: A `<select>` or equivalent dropdown listing all available lenses for the device, grouped by `facingMode`.
   - Each option MUST show the lens `label` (truncated if long) and an indicator of its `lensType` (e.g., "Ultra-wide", "Wide", "Telephoto", "Front").
   - The currently active lens MUST be selected by default.
   - Changing the dropdown selection MUST call `setCameraLens(deviceId, { lensDeviceId: selectedDeviceId })`.

2. **Zoom slider**: When the active track supports zoom (`zoomMax !== null`), render a range slider.
   - Range: `zoomMin` to `zoomMax`, step `zoomStep`.
   - Current zoom value MUST be displayed as text (e.g., "1.0x", "3.0x").
   - Changing the slider MUST call `setCameraLens(deviceId, { zoom: value })` on release (not on every drag event — debounced/on-change-committed).
   - The slider MUST be hidden when `zoomMax` is `null` or `undefined`.

3. **Camera state indicators**: Show the active lens label and zoom level as read-only text when no control interaction is pending.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — camera section renders | Modal opens for device D1; `stream-started` included `cameraInfo` with 3 lenses | Modal renders | "Camera" section visible; lens picker shows 3 options grouped by facingMode; zoom slider visible if zoom capability exists |
| Happy — select lens from picker | Modal shows 3 lenses; current is Wide | Operator selects "Telephoto" from dropdown | `setCameraLens("D1", { lensDeviceId: "<telephoto-id>" })` called; dropdown shows "Telephoto" as active (optimistic) |
| Happy — change zoom via slider | Zoom slider shows 1.0x–6.0x, current 1.0x | Operator drags slider to 3.0x and releases | `setCameraLens("D1", { zoom: 3.0 })` called; slider shows 3.0x (optimistic); label updates to "3.0x" |
| Edge — no cameraInfo available | `stream-started` did not include `cameraInfo` (older client) | Modal renders | Camera section is NOT rendered; no controls shown |
| Edge — single lens, no zoom | Device D1 has only one lens and no zoom | Modal renders | Camera section shows the single lens label as read-only (no picker interaction); zoom slider is hidden |
| Edge — zoom unsupported | `zoomMax` is `null` or `undefined` | Modal renders | Zoom slider is hidden; no zoom controls visible |
| Edge — camera-lens-changed with failure | Operator selects a lens; device responds with `camera-lens-changed { success: false }` | DashboardService processes the event | Lens picker reverts to its previous selection; error indicator shown briefly (e.g., red flash on picker) |
| Edge — camera-lens-changed with different values | Operator is viewing lens picker; phone user changes lens independently | `camera-lens-changed` arrives with new `activeLens` and `zoom` | Lens picker and zoom slider update to reflect the new state — no desync between UI and device |
| Edge — stream disconnected while modal open | Device D1 disconnects | Modal detects disconnect | Camera controls disabled; section shows "Camera — disconnected" state |

#### Acceptance Criteria

- [ ] Camera section renders with lens picker dropdown grouped by facingMode
- [ ] Zoom slider appears only when zoom capabilities exist
- [ ] Selecting a lens calls `setCameraLens` with the correct `lensDeviceId`
- [ ] Changing zoom slider calls `setCameraLens` with the correct `zoom` value
- [ ] No camera section when `cameraInfo` is absent (backward compat)
- [ ] UI updates on `camera-lens-changed` from any source (phone or dashboard self)
- [ ] Failed lens switches revert the UI to previous state

---

### R-DSM-007: Camera Events in DashboardService and Store

**DashboardService** MUST expose:

```typescript
// Outgoing: dashboard → backend → phone
setCameraLens(deviceId: string, params: { lensDeviceId?: string; zoom?: number }): void;
// Emits: 'set-camera-lens' { deviceId, lensDeviceId?, zoom? }

// Incoming: phone → backend → dashboard
onCameraLensChanged?: (data: {
  deviceId: string;
  activeLens: string;
  zoom: number;
  success: boolean;
}) => void;
// Fires when 'camera-lens-changed' is received from server
```

**DashboardStore (Zustand)** MUST add:

```typescript
interface DashboardStore {
  // Existing state...
  cameraControlState: Record<string, {
    lenses: LensInfo[];
    activeLens: string | null;
    zoom: number | null;
  }>;
  
  // Existing actions...
  
  // New actions:
  setCameraLens: (deviceId: string, params: { lensDeviceId?: string; zoom?: number }) => void;
  updateCameraControlState: (deviceId: string, state: {
    lenses: LensInfo[];
    activeLens: string;
    zoom: number;
  }) => void;
  setStreamCameraInfo: (deviceId: string, cameraInfo: {
    lenses: LensInfo[];
    activeLens: string | null;
    zoom: number | null;
  }) => void;
}
```

- `cameraControlState`: Per-device camera state, keyed by `deviceId`.
- `setCameraLens(deviceId, params)`: Calls `dashboardService.setCameraLens(deviceId, params)` and optimistically updates `cameraControlState[deviceId].activeLens`/`zoom`.
- `updateCameraControlState(deviceId, state)`: Called when `camera-lens-changed` arrives — replaces the per-device state entirely (authoritative update from device).
- `setStreamCameraInfo(deviceId, cameraInfo)`: Called when `stream-started` is processed with `cameraInfo` — initializes `cameraControlState[deviceId]`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — store init from stream-started | Dashboard receives `stream-started` for D1 with `cameraInfo` | `setStreamCameraInfo("D1", cameraInfo)` called | `cameraControlState["D1"]` populated with lenses, activeLens, zoom |
| Happy — optimistic lens picker update | Operator selects a new lens | `setCameraLens("D1", { lensDeviceId: "<id>" })` called | Store updates `activeLens` optimistically; `set-camera-lens` emitted |
| Happy — authoritative update from device | Phone user switches lens; `camera-lens-changed` arrives | `updateCameraControlState("D1", state)` called | Store state REPLACED with device's actual state; optimistic update undone if wrong |
| Edge — cameraInfo not in stream-started | Older client does not send cameraInfo | `setStreamCameraInfo` NOT called | `cameraControlState["D1"]` stays `undefined`; camera section not rendered |
| Edge — device disconnects | Device D1 disconnects | Cleanup runs | `cameraControlState["D1"]` is removed or marked stale; camera controls disabled |

#### Acceptance Criteria

- [ ] `dashboardService.setCameraLens()` emits `set-camera-lens` with correct payload
- [ ] `dashboardService.onCameraLensChanged` fires on `camera-lens-changed` server event
- [ ] `cameraControlState` is initialized from `stream-started`'s `cameraInfo`
- [ ] Optimistic updates are applied on dashboard-initiated changes
- [ ] Authoritative `camera-lens-changed` replaces optimistic state
- [ ] Old clients without `cameraInfo` do not set camera state — no crash

## Impact on Existing Requirements

| Existing Requirement | Impact |
|---|---|
| R-DSM-002 (dashboard-stream-modal spec) — Modal content | Camera section is added as a new section alongside existing controls (rename, quality, NDI, disconnect). No existing controls removed or altered. |
| R-DSM-005 (dashboard-stream-modal spec) — Store state | `cameraControlState` added to store interface. Existing `selectedDeviceId`, `ndiControlState` unchanged. |
| R-DSM-003 (dashboard-stream-modal spec) — NDI toggle | Independent section. Camera controls are a separate UI section below NDI controls. |

## Non-Goals

- **Drag-to-zoom on video preview**: Not implemented. Only slider control.
- **Camera controls in StreamCard (non-modal)**: Camera controls are modal-only. StreamCard shows only the quality badge.
- **Persistent camera preference**: Camera state resets on stream reconnection. No server-side persistence.
- **Multiple camera control per dashboard page**: Only the selected stream's camera controls are visible in the modal.
