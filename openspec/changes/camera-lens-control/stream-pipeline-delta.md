# Delta: Stream Pipeline — Camera Lens Control

## Purpose

Extend the stream pipeline with camera metadata propagation and remote lens control signaling. The `stream-started` event gains camera info (lenses, active lens, zoom), and two new socket events enable dashboard operators to remotely control lens selection and zoom on streaming devices.

This delta is additive — no existing requirements are modified or removed.

## Requirements

### R-SPD-004: Camera Info in Stream Metadata

The `stream-started` event payload MUST be extended with a `cameraInfo` field.

```typescript
// Added to stream-started event payload (existing fields unchanged)
interface CameraInfoPayload {
  lenses: LensInfo[];        // All available lenses on the device
  activeLens: string | null; // deviceId of the currently active lens
  zoom: number | null;       // Current zoom level, null if device does not support zoom
}
```

The `lenses` array MUST be populated from the camera service's current enumeration (R-CLC-001). The `activeLens` MUST be the `deviceId` currently feeding the stream's video track. The `zoom` MUST be the current zoom value from the applied constraints.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — stream starts with camera info | A phone starts streaming with zoom-capable back camera | Backend receives `stream-started` | Payload includes `cameraInfo` with `lenses` array (1+ entries), `activeLens` matching the active device, `zoom: 1.0` |
| Happy — single lens device | A phone with only a front camera starts streaming | `stream-started` fires | `cameraInfo.lenses` has 1 entry; `activeLens` is the front camera's deviceId |
| Edge — zoom unsupported device | Device has no zoom capability | `stream-started` fires | `cameraInfo.zoom` is `null` |
| Edge — backward compat | Older client (before CLC change) does not send `cameraInfo` | Backend processes `stream-started` | `cameraInfo` is `undefined`; dashboard displays no camera controls for that stream |
| Edge — lens switch during stream | User switches from wide to telephoto on the phone | Phone emits `camera-lens-changed` (R-SPD-006) | Dashboard receives updated `activeLens` and `zoom` without a full `stream-started` |

#### Acceptance Criteria

- [ ] `stream-started` event includes `cameraInfo` with `lenses`, `activeLens`, `zoom`
- [ ] `cameraInfo` is backward compatible — old clients without it do not break
- [ ] Dashboard receives camera info immediately on stream start

---

### R-SPD-005: Remote Lens Control

A new Socket.io event `set-camera-lens` (default namespace) MUST enable dashboard-to-backend-to-device lens control.

**Event**: `set-camera-lens` (dashboard → backend)

**Payload**:
```typescript
interface SetCameraLensPayload {
  deviceId: string;          // Target streaming device
  lensDeviceId?: string;     // Target lens deviceId to switch to
  zoom?: number;             // Target zoom level to apply
}
```

**Backend behavior**:
1. Backend receives `set-camera-lens` from a dashboard client.
2. Backend looks up the target device's socket room (via `deviceId`).
3. Backend relays the event to the device's socket: `set-camera-lens` on the device's socket (same payload).
4. If the device socket is not found, backend returns `{ error: "Device not connected" }` to the dashboard caller.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — dashboard selects lens | Dashboard operator selects a telephoto lens for device D1 | Dashboard emits `set-camera-lens { deviceId: "D1", lensDeviceId: "<telephoto-id>" }` | Backend relays to D1's socket with the same payload |
| Happy — dashboard changes zoom | Dashboard operator moves zoom slider to 2.0x for device D1 | Dashboard emits `set-camera-lens { deviceId: "D1", zoom: 2.0 }` | Backend relays to D1's socket with `{ lensDeviceId: undefined, zoom: 2.0 }` |
| Happy — combined lens + zoom | Dashboard operator selects ultra-wide lens at 0.5x zoom | Dashboard emits `set-camera-lens { deviceId: "D1", lensDeviceId: "<uw-id>", zoom: 0.5 }` | Backend relays both `lensDeviceId` and `zoom` |
| Edge — device not connected | Dashboard operator sends command for device that was disconnected | Backend looks up device socket | `{ error: "Device not connected" }` returned to dashboard caller |
| Edge — unknown lensDeviceId | Dashboard sends a `lensDeviceId` that does not exist on the device | Backend relays to device | Device handles the error locally; device responds with `camera-lens-changed { success: false }` |
| Edge — zoom out of range | Zoom value exceeds device's `zoomMax` | Backend relays to device | Device clamps zoom to valid range or rejects; `camera-lens-changed { success: false }` |

#### Acceptance Criteria

- [ ] `set-camera-lens` event is relayed from dashboard to device via backend
- [ ] Backend returns error when target device is not connected
- [ ] Payload supports `lensDeviceId`, `zoom`, or both (partial updates)
- [ ] No modification to existing socket events

---

### R-SPD-006: Remote Lens Ack

The device MUST respond to `set-camera-lens` with a `camera-lens-changed` event (phone → backend → dashboard).

**Event**: `camera-lens-changed` (phone → backend)

**Payload**:
```typescript
interface CameraLensChangedPayload {
  deviceId: string;           // The streaming device's ID
  activeLens: string;         // The currently active lens deviceId after the change
  zoom: number;               // The current zoom level after the change
  success: boolean;           // Whether the change was applied successfully
}
```

**Backend behavior**:
1. Backend receives `camera-lens-changed` from a device's socket.
2. Backend broadcasts `camera-lens-changed` to ALL dashboard clients (default namespace).
3. The same payload is forwarded — dashboards update their UI to reflect the new lens/zoom state.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — lens switch ack | Device D1 successfully switches from wide to telephoto after dashboard command | Phone emits `camera-lens-changed` | Payload: `{ deviceId: "D1", activeLens: "<telephoto-id>", zoom: 2.0, success: true }`; broadcast to all dashboards |
| Happy — zoom change ack | Device D1 applies zoom 3.0x | Phone emits `camera-lens-changed` | Payload: `{ deviceId: "D1", activeLens: "<current-id>", zoom: 3.0, success: true }` |
| Edge — failed switch | Device D1 cannot switch to the requested lens | Phone emits `camera-lens-changed` | Payload: `{ success: false }`; dashboard shows error state; active lens stays at previous value |
| Happy — phone-initiated switch | User changes lens directly on the phone (not via dashboard) | Phone emits `camera-lens-changed` | Dashboard receives the update and reflects the new lens/zoom state |
| Edge — device D2 connects mid-session | Device D2 is known but not yet streaming | Device D2 emits any event | No spurious `camera-lens-changed` emission — only emitted in response to lens changes or `set-camera-lens` |

#### Acceptance Criteria

- [ ] `camera-lens-changed` is broadcast to all dashboard clients
- [ ] Payload includes `deviceId`, `activeLens`, `zoom`, `success`
- [ ] `success: false` does not crash the dashboard; UI shows error state
- [ ] Phone-initiated lens changes also emit `camera-lens-changed`, keeping dashboard in sync

## Impact on Existing Requirements

| Existing Requirement | Impact |
|---|---|
| R-003 (stream-pipeline spec) — `stream-started` event | Payload extended with optional `cameraInfo` field. No existing fields changed. |
| R-SQC-002 (stream-pipeline) — `set-stream-quality` event | Independent — `set-stream-quality` and `set-camera-lens` are separate events with different routing. No overlap. |
| R-SPD-002 (stream-pipeline) — `set-ndi-control` event | Independent — NDI control and camera control are separate concerns. No overlap. |

## Non-Goals

- **Persistent lens preference per device**: Not stored server-side. Dashboard must re-query after stream reconnect.
- **Real-time zoom sync without change**: Zoom level is communicated only on change events — no periodic polling.
- **Backend validation of lens capabilities**: Backend is a relay; all capability validation happens on the device.
