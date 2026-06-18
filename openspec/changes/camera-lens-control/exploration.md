## Exploration: Camera Lens Control

### Current State

**CameraService** (`frontend/src/lib/camera-service.ts`):
- Uses `enumerateDevices()` to list `videoinput` devices; stores only `deviceId`, `label`, and a **guessed** `facingMode` (derived from substring matching on the label — fragile).
- `switchCamera()` / `toggleCamera()` **only toggles** `facingMode: 'user' ↔ 'environment'`. No lens selection, no `deviceId` targeting.
- **Never calls** `MediaStreamTrack.getCapabilities()` — zero awareness of `zoom`, `pan`, `tilt`, `torch`.
- **Never calls** `track.applyConstraints()` for lens switching — only resolution changes trigger it via `startCamera()` restart.
- `startCamera()` builds constraints with `facingMode: { ideal: ... }` — no `deviceId: { exact: ... }` support.
- `CameraCapabilities` interface: `{ deviceId, label, facingMode }` — no groupId, no zoom range, no lens type.

**StreamStore** (`frontend/src/store/stream-store.ts`):
- `cameraConstraints` stores `{ width, height, frameRate, facingMode }` — no deviceId, no lens/zoom state.
- `switchCamera` action → `cameraService.toggleCamera()` → restart with opposite facingMode.
- No lens list, no zoom value, no selected lens tracking.

**StreamControls** (`frontend/src/components/StreamControls.tsx`):
- Single 🔄 button for `onSwitchCamera` (visible only when `hasMultipleCameras` is true).
- No lens picker, no zoom slider, no camera group visualization.

**Stream Page** (`frontend/src/app/stream/page.tsx`):
- Passes `cameraService?.hasMultipleCameras || false` to StreamControls.
- No lens-aware UI beyond the toggle button.

**Dashboard StreamModal** (`frontend/src/components/dashboard/StreamModal.tsx`):
- **No camera controls whatsoever**. Only video preview, NDI controls, quality selector, disconnect.
- The control panel is for the **already-streaming** device — no remote camera commands exist.

**Backend Server** (`backend/src/server.ts`):
- `register-device` event receives `{ deviceId, deviceName? }` — no camera capabilities.
- **No camera-info event exists** anywhere in the signaling protocol.
- `DeviceInfo` type: `{ deviceId, socketId, deviceName?, isConnected, isStreaming, streamId?, lastSeenAt }` — no camera metadata.
- `stream-started` event carries `{ stream: { ...stream, deviceId } }` — still no camera info.

**MediasoupRouter** (`backend/src/mediasoup/router.ts`):
- `StreamInfo` interface: includes `deviceId`, `deviceName`, `resolution`, `bitrate` — **no camera/lens info**.
- `deviceName` is hardcoded as `` `Device ${clientId.slice(-4)}` `` — no real device name propagation.

---

### Affected Areas

| File | Why affected |
|------|-------------|
| `frontend/src/lib/camera-service.ts` | Core rewrites: enumeration strategy, getCapabilities(), applyConstraints(), deviceId-targeted start, zoom management |
| `frontend/src/store/stream-store.ts` | New state: camera list, selected lens, zoom level, lens groups; new actions: selectLens, setZoom |
| `frontend/src/components/StreamControls.tsx` | Replace single toggle button with lens picker (and possibly zoom slider) |
| `frontend/src/app/stream/page.tsx` | Pass new props (lenses, selected lens, zoom) |
| `frontend/src/components/dashboard/StreamModal.tsx` | Add remote camera control section (lens picker, zoom slider) |
| `frontend/src/types/dashboard.ts` | Add camera info types to `StreamInfo` or new `CameraDevice` type |
| `frontend/src/lib/dashboard-service.ts` | New socket events: `camera-device-info`, `set-camera-lens`, `camera-lens-changed` |
| `frontend/src/store/dashboard-store.ts` | New actions for remote camera control |
| `backend/src/server.ts` | New signaling events for camera info relay and remote control |
| `backend/src/mediasoup/router.ts` | Extend `StreamInfo` with camera capabilities metadata |
| `backend/src/api/routes/streams.ts` | Possibly extend stream info API response |

### Approaches

#### 1. Camera Enumeration (how to get real labels/names)

**A. Enumerate after stream start** — Call `getUserMedia` once (any camera) to trigger permission, then re-enumerate. On iOS Safari, labels are empty until permission is granted. After permission, `enumerateDevices()` returns populated labels with descriptors like "Back Ultra Wide Camera", "Back Camera", "Back Telephoto Camera", "Front Camera".
- **Pros**: Works on all platforms; labels carry lens type info; `groupId` groups back vs front.
- **Cons**: Two-phase flow (permission request, then enumeration); label format varies by OEM.
- **Effort**: Low

**B. Use `getCapabilities().zoom` to detect lenses** — After stream is active, query `track.getCapabilities()` for the `zoom` range. On iPhones, zoom range directly maps to optical lenses (0.5→1.0→3.0). Android zoom alone is unreliable (digital zoom without lens switch).
- **Pros**: Direct lens capability data; `zoom.step` reveals granularity.
- **Cons**: Requires active stream; zoom≠lens count on Android; doesn't give friendly names.
- **Effort**: Low

**C. Combined — Enumerate + zoom capabilities** — Use enumerateDevices() for labels/deviceId grouping, then supplement with getCapabilities() zoom info per device. Merge both into a structured `LensInfo[]` with `{ deviceId, label, groupId, facingMode, zoomRange, lensType }`.
- **Pros**: Best of both; handles iOS and Android; produces actionable data for UI.
- **Cons**: Most code; needs careful iOS timing (wait for permission).
- **Effort**: Medium

#### 2. Camera Switching Mechanism (deviceId vs facingMode vs zoom)

**A. deviceId-based switching** — Enumerate all `videoinput` devices. User picks a specific device. Stop current stream, start new one with `deviceId: { exact: selectedDeviceId }`.
- **Pros**: Direct, works everywhere; full control over which physical camera.
- **Cons**: Stream restart delay (~500ms-1s); loses WebRTC track (must renegotiate); iOS may reuse the same lens if deviceId is the same sensor group.
- **Effort**: Medium

**B. Zoom-based lens switching** — Keep the stream alive. Use `track.applyConstraints({ zoom: { exact: value } })` to switch between lenses. On iPhones, zoom values 0.5→ultra-wide, 1.0→wide, 2-3→telephoto. No stream restart needed.
- **Pros**: Instant switch (no restart); no WebRTC renegotiation works while streaming; native iOS behavior.
- **Cons**: Only works for back cameras (zoom not available on front); unreliable on Android (digital zoom); `zoom` not universally supported.
- **Effort**: Low (capabilities check) to Medium (full UI)

**C. Hybrid — deviceId for primary switch + zoom for secondary** — Use facingMode for front/back selection. Within back cameras, present lens "presets" (ultra-wide, wide, telephoto) that apply `zoom` constraints on the active stream. Fall back to deviceId restart when zoom is unsupported or on Android.
- **Pros**: Instant switch for back lenses (no restart); graceful fallback; covers all platforms.
- **Cons**: More code paths; state management complexity; need to detect which mechanism works on device.
- **Effort**: High

#### 3. Remote Control from Desktop (signaling protocol)

**A. New dedicated events** — Three new Socket.io events:
  1. `camera-device-info` (phone → server): emitted after enum, carries `{ deviceId, cameras: LensInfo[] }`
  2. `set-camera-lens` (dashboard → server → phone): `{ deviceId, lensDeviceId? | zoom?: number }`
  3. `camera-lens-changed` (phone → server → dashboard): acknowledgment with new lens info
- **Pros**: Clean separation; follows existing event patterns (ndi-control); explicit.
- **Cons**: Three events to implement; must handle delivery guarantee.
- **Effort**: Medium

**B. Extend existing register-device + device-command** — Add camera capabilities to the `register-device` payload. Add a generic `device-command` event for remote control that carries a `{ command: 'set-camera', params: { ... } }` envelope.
- **Pros**: Fewer new event types; extensible for future commands (torch, focus, etc.).
- **Cons**: Generic envelope adds indirection; harder to validate.
- **Effort**: Medium

**C. Reuse stream-started + stream-updated for info, socket commands for control** — Attach camera capabilities to the `stream-started` event payload (already carries `deviceId`). Add `set-camera-lens` as a standalone command event. Dashboard receives lens state via `stream-updated` (extended). Reuses existing event patterns entirely.
- **Pros**: Minimal new infrastructure; `stream-started` already delivers device metadata.
- **Cons**: Camera info is tied to stream lifecycle (what about non-streaming state?).
- **Effort**: Low-Medium

---

### Recommendation

**1. Enumeration**: Use **Approach C (Combined)** — `enumerateDevices()` after first `getUserMedia` gives labels and groupId; `getCapabilities()` enriches each device with zoom range. Build a `CameraInfo` / `LensInfo[]` structure as a first-class concept.

**2. Switching**: Use **Approach C (Hybrid)** as the long-term target, but start implementation with **Approach A (deviceId)** for the phone client (simpler, correct everywhere) and **Approach B (zoom)** for back-camera lens switching on iOS. This gives an incremental path:
- Phase 1: deviceId-based switching on phone side (stream restart)
- Phase 2: zoom-based switching on supported devices (no restart)
- Phase 3: fallback logic for Android

**3. Remote Control**: Use **Approach C (Reuse stream-started + set-camera-lens event)** — attach camera capabilities to `stream-started`, single `set-camera-lens` command event for remote control. Minimum new infrastructure, follows established patterns (quality control, NDI control).

---

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| iOS Safari empty labels until first getUserMedia | **HIGH** — always true | Two-phase init: call getUserMedia once for permission, then re-enumerate. Document as intentional design. |
| Zoom capability not available on device | **MEDIUM** — many Android devices lack it | Check `'zoom' in track.getCapabilities()` before showing slider. Fall back to deviceId switching. |
| Zoom applies digital (not optical) zoom on Android | **HIGH** — Android camera2 API abstraction varies by OEM | Label it "zoom" generically, not "lens switch". For real lens switching on Android, use deviceId. |
| Stream restart during WebRTC streaming drops video momentarily | **MEDIUM** — ~500ms gap | Show transient "Reconnecting..." overlay. Use zoom constraints when possible to avoid restart. |
| Dashboard remote control has no delivery guarantee | **LOW** — Socket.io is unreliable for transient disconnects | Accept best-effort delivery (like current quality control pattern). User can retry. |
| Multiple back cameras may have same facingMode | **MEDIUM** — iPhone has 3 back cameras all `facingMode: 'environment'` | Use deviceId + groupId + label for disambiguation, not facingMode alone. |
| Permission model varies — Android may not require getUserMedia for enum, iOS does | **LOW** | Always call getUserMedia first before relying on any camera API data. |
| Browser support — `enumerateDevices()` and `getCapabilities()` widely supported, but `applyConstraints` zoom is newer | **LOW** | Check capabilities before applying. Try/catch applyConstraints and fall back. |

---

### Ready for Proposal

**Yes** — all information needed for a proposal is gathered. The orchestrator can proceed with `sdd-propose` for `camera-lens-control`.

Key findings to pass to proposal:
- **Camera switching today is binary** (front/back toggle via facingMode) — no lens awareness, no zoom.
- **Browser APIs exist** to enumerate real lenses and switch via zoom or deviceId — but with iOS vs Android asymmetry.
- **The signaling protocol** needs 1-2 new events (camera-info attached to stream-started, set-camera-lens command).
- **The dashboard** has no camera controls — adding them is the primary UX gain.
- **Stream restart** is the main friction point — zoom-based switching avoids it on iOS back cameras.
