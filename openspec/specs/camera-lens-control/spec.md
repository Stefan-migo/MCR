# Spec: Camera Lens Control

## Purpose

Replace the binary front/back camera toggle with full lens enumeration and selection. Users can see and pick every available lens (ultra-wide, wide, telephoto, front) from both the phone client and the desktop dashboard, with zoom slider on supported devices. iOS two-phase initialization handles the platform's permission gating on `enumerateDevices()` labels.

## Requirements

### R-CLC-001: Camera Enumeration

After the first successful `getUserMedia` call, the system MUST call `enumerateDevices()` and filter to `videoinput` devices, extracting `deviceId`, `label`, and `groupId` from each.

For the active stream's video track, the system MUST call `track.getCapabilities()` to obtain the `zoom` range (`min`, `max`, `step`).

The merged data from both sources MUST be assembled into a `LensInfo[]` array and made available to the UI.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — enumerate after first stream | A phone starts streaming and `getUserMedia` succeeds | `enumerateDevices()` is called | At least 1 videoinput device is returned; each has `deviceId`, `label`, `groupId` populated |
| Happy — zoom capabilities available | The active track supports digital/optical zoom | `getCapabilities()` is called | `zoom` range is non-null: `{ min: 1, max: 6, step: 0.1 }` |
| Edge — zoom unsupported | The active track's hardware does not support zoom | `getCapabilities().zoom` is undefined | `zoomMin`, `zoomMax`, `zoomStep` are all `null` — slider is hidden |
| Edge — enumerate before permission | `getUserMedia` has NOT been called yet | `enumerateDevices()` is called | Labels are empty strings on iOS; the system must NOT rely on labels before permission grant |

#### Acceptance Criteria

- [ ] `enumerateDevices()` is called after first `getUserMedia` success
- [ ] `getCapabilities()` is called on the active video track
- [ ] Merged `LensInfo[]` contains all videoinput devices with their properties
- [ ] Zoom range is `null` when unsupported — no crash

---

### R-CLC-002: LensInfo Type

The system MUST define and export a `LensInfo` type.

```typescript
interface LensInfo {
  deviceId: string;
  label: string;
  groupId: string;
  facingMode: 'user' | 'environment' | undefined;
  zoomMin: number | null;
  zoomMax: number | null;
  zoomStep: number | null;
  lensType: 'ultra-wide' | 'wide' | 'telephoto' | 'front' | 'unknown';
}
```

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — all fields populated | A back camera with zoom support is enumerated | `LensInfo` is created | All fields are populated; `lensType` is `'wide'` or `'telephoto'`; `zoomMin`/`zoomMax` are numbers |
| Edge — no zoom | A front camera without zoom is enumerated | `LensInfo` is created | `zoomMin`, `zoomMax`, `zoomStep` are `null` |
| Edge — unknown lensType | A camera label cannot be matched to a known type | `lensType` is assigned | Defaults to `'unknown'` |

**`lensType` heuristic**: Based on `label` text matching:
- `label` contains `"Front"` or `"user"` → `'front'`
- `label` contains `"Ultra"` or `"ultra"` or `"0.5x"` or `"0.6x"` → `'ultra-wide'`
- `label` contains `"Tele"` or `"tele"` or `"2x"` or `"3x"` or `"Zoom"` (lone) → `'telephoto'`
- `label` contains none of the above AND `facingMode === 'user'` → `'front'`
- Otherwise → `'wide'`

#### Acceptance Criteria

- [ ] `LensInfo` type is defined and exported
- [ ] `lensType` heuristic covers known iOS/Android label conventions
- [ ] All zoom fields are `null` when capabilities lack zoom

---

### R-CLC-003: Lens Selection (Phone)

The phone UI MUST display all available lenses grouped by `facingMode` (user vs environment).

When a user selects a lens:
1. **Same group change** (e.g., ultra-wide ↔ telephoto on the same back camera cluster): If the new lens shares the same `groupId` as the active lens, apply zoom constraints via `track.applyConstraints({ advanced: [{ zoom: lensZoomValue }] })` — no stream restart.
2. **Cross-group change** (e.g., front ↔ back, or different physical camera on Android): Fall back to deviceId-based stream restart per R-CLC-006.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — same group lens switch | Back camera is active (wide lens); user selects telephoto (same groupId) | `switchToLens(newDeviceId)` is called | System checks `groupId` matches active group; applies zoom constraint; NO stream restart |
| Happy — cross-group lens switch | Back camera is active; user selects front camera (different groupId) | `switchToLens(newDeviceId)` is called | System detects different groupId; performs stream restart per R-CLC-006 |
| Edge — no zoom capability | Both lenses are in the same group but zoom is unsupported | User selects the other lens | Falls back to deviceId stream restart per R-CLC-006 — same-group zoom shortcut is unavailable |
| Edge — single lens only | Device has only one camera | UI renders | Single lens shown, no selection possible; lens picker may be hidden or show the single option as disabled |

**Lens Zoom Value for same-group switch**: The lens selection maps `lensType` to a hardcoded zoom value on iOS:
- `'ultra-wide'` → zoom = `0.5` (Apple's UWA)
- `'wide'` → zoom = `1.0`
- `'telephoto'` → zoom = `2.0` (or `3.0` depending on device — detected from label)

On Android, same-group switching via zoom constraint is unreliable (zoom is often digital, not optical) — prefer deviceId-based switching for cross-lens transitions.

#### Acceptance Criteria

- [ ] Phone UI lists lenses grouped by `facingMode`
- [ ] Same-group lens switch uses zoom constraints (no stream restart)
- [ ] Cross-group lens switch uses deviceId stream restart
- [ ] Single-lens device shows no lens picker (or picker with one option)

---

### R-CLC-004: Zoom Control

If `track.getCapabilities().zoom` is available and non-null, the system MUST render a zoom slider.

The slider range MUST be `zoomMin` to `zoomMax` with step increments of `zoomStep`.

Applying zoom MUST use:
```javascript
await track.applyConstraints({ advanced: [{ zoom: value }] });
```

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — zoom slider visible | Device supports zoom (capabilities return `{ zoom: { min: 1, max: 6, step: 0.1 } }`) | UI renders | Zoom slider appears, range 1.0–6.0, step 0.1 |
| Happy — adjust zoom | Slider is at 1.0x | User drags slider to 3.0x | `track.applyConstraints({ advanced: [{ zoom: 3.0 }] })` is called; camera optically/digitally zooms in |
| Edge — zoom unsupported | Device has no zoom (capabilities.zoom is undefined) | UI renders | Zoom slider is NOT shown |
| Edge — applyConstraints rejects | Zoom value exceeds track's capability (e.g., 10.0 on a 6.0 max device) | `applyConstraints` throws | Error is caught; current zoom stays unchanged; error toast may be shown |
| Edge — zoom after deviceId switch | Stream restarts with new deviceId | After new stream starts | `getCapabilities()` is called on the new track; zoom slider updates or hides based on new track's capabilities |

#### Acceptance Criteria

- [ ] Zoom slider appears only when `track.getCapabilities().zoom` exists
- [ ] Slider range matches `zoomMin`–`zoomMax` with `zoomStep` increments
- [ ] Moving slider applies zoom in real-time via `applyConstraints`
- [ ] Error in `applyConstraints` does not crash the stream
- [ ] Zoom slider hides on lens switch to a non-zoom device

---

### R-CLC-005: iOS Two-Phase Init

iOS Safari requires a permission grant before `enumerateDevices()` populates `label` fields. The system MUST implement two-phase initialization:

**Phase 1 — Permission grant:**
1. Call `getUserMedia({ video: true })` with minimal constraints (no resolution preference).
2. Immediately stop all tracks (`track.stop()` for each track in the stream).
3. The permission prompt is triggered; once accepted, iOS remembers the grant for the session.

**Phase 2 — Real initialization:**
1. Call `enumerateDevices()` — labels are now populated.
2. Call `getUserMedia` with the real quality preset + selected `deviceId`.
3. Proceed to WebRTC producer creation.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — first init on iOS | iOS device launches camera view | `startStreaming()` is called | Phase 1: minimal `getUserMedia` fires + tracks stopped immediately; Phase 2: `enumerateDevices()` returns populated labels; real `getUserMedia` starts |
| Happy — subsequent init on same page | Initialization already completed (permission granted) | `startStreaming()` is called again (e.g., quality change, reconnection) | Phase 1 is SKIPPED; Phase 2 runs directly; labels are already populated from the first enumeration |
| Edge — permission denied on iOS | User denies the camera permission prompt | Phase 1 `getUserMedia` rejects | Phase 2 is NOT attempted; error is propagated to the UI; user is shown a permission-denied message |
| Edge — not iOS | A desktop browser with no permission-gating issue | `startStreaming()` is called | Phase 1 is SKIPPED; Phase 2 runs directly (labels are already populated or empty) |

**Detection**: Phase 1 runs only if:
- `navigator.userAgent` contains `"iPhone"` or `"iPad"` or `"iPod"` AND
- `enumerateDevices()` returns videoinput entries with empty labels (first-time check)

#### Acceptance Criteria

- [ ] iOS shows camera permission prompt on first stream start
- [ ] After permission grant, `enumerateDevices()` returns labels on iOS
- [ ] Phase 1 is skipped on non-iOS devices
- [ ] Phase 1 is skipped on subsequent `startStreaming()` calls
- [ ] Permission denial on iOS shows a clear error, does not hang

---

### R-CLC-006: Stream Restart on deviceId Switch

When switching cameras via `deviceId` (not zoom constraints), the system MUST:

1. Stop the current WebRTC producer (emit `stop` on the producer transport).
2. Release the camera: stop all tracks on the current `MediaStream` (`track.stop()`).
3. Close the current WebRTC producer and transport if applicable.
4. Start a new camera with `getUserMedia({ video: { deviceId: { exact: selectedDeviceId } } })` merged with the current quality preset constraints.
5. Create a new WebRTC producer from the new stream.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — front to back switch | Front camera is active with producer | User selects back camera deviceId | Current producer stops; tracks stop; new `getUserMedia` fires with `deviceId: { exact: backCameraId }`; new producer created |
| Happy — same groupId switch | Both lenses share the same groupId | User selects other lens in the same group | R-CLC-003 same-group logic applies; NO stream restart — zoom constraints used instead (if available) |
| Edge — new getUserMedia fails | The selected deviceId is no longer valid (e.g., camera unplugged) | `getUserMedia` rejects | Error is caught; previous stream is NOT released (keep-alive); error toast shown; user can retry |
| Edge — rapid switching | User rapidly switches lenses 3 times in 2 seconds | Three switch requests arrive | Each request aborts the in-flight switch (if any); only the LAST request's new stream survives; stale producers are cleaned up |
| Edge — no previous stream | Called before any stream exists (initial camera selection) | `switchToLens` is called | Behaves like a normal first-time `getUserMedia` — no producer to stop, no tracks to release |

**Abort logic for rapid switching**: The `switchToLens` call MUST maintain a pending promise reference. If a new call arrives while a switch is pending, the pending `getUserMedia` is aborted (the stream is discarded, tracks stopped), and the new switch proceeds. Only the final switch's stream becomes the active producer.

#### Acceptance Criteria

- [ ] deviceId switch stops old producer, releases camera, starts new producer
- [ ] Same-group switches with zoom support do NOT restart the stream
- [ ] Failed `getUserMedia` does not destroy the current working stream
- [ ] Rapid switching results in only the last switch taking effect
- [ ] Stream is briefly interrupted (~500ms visible on dashboard) during cross-group switches

---

## Non-Goals

- **Torch/flash control**: Flash/torch toggling is out of scope. Future work.
- **Focus/pan/tilt control**: Manual focus, pan, or tilt controls are not included. Future work.
- **Photo capture from desktop**: Remote photo capture is not part of this change.
- **Persistent lens preference**: The active lens resets to default on page reload. Persistence is future work.
- **Android same-group optical switching**: Android lens switching uses deviceId-based restart because zoom constraints map to digital zoom, not optical lens switching. Device-OS-specific optical switching is future work.

## Edge Cases & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| iOS empty labels until first getUserMedia | High | Two-phase init (R-CLC-005): grant permission first, then enumerate |
| Zoom unsupported on device | Medium | Check capabilities before showing slider; fall back to deviceId switching |
| Zoom = digital zoom on Android, not optical | High | Label "zoom" generically; deviceId for real lens switching on Android |
| Stream restart drops video ~500ms | Medium | Show "Reconnecting..." overlay; use zoom constraints when possible |
| Rapid lens switching causes race condition | Low | Abort pending `getUserMedia`; only the last switch prevails |
| `lensType` heuristic fails for unknown label format | Low | Default to `'wide'` or `'unknown'` — no crash, picker still works |
| `enumerateDevices()` returns same deviceId for front and back on Android | Medium | On Android, front and back cameras have different deviceIds; the same-group heuristic only matches if `groupId` is identical — which it typically isn't for front vs back. No special handling needed beyond the existing logic. |
