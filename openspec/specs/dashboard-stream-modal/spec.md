# Spec: Dashboard Stream Modal

## Purpose

Replaces the current popup-window behavior when clicking a StreamCard on the dashboard. A modal overlay provides stream video preview, stream controls (rename, quality, disconnect), NDI toggle + naming, and an explicit "Open in new window" button — all without leaving the dashboard view. Modal state is managed via the existing Zustand dashboard store.

## Requirements

### R-DSM-001: Modal open on StreamCard click

Clicking a StreamCard MUST open the StreamModal overlay instead of calling `window.open`.

- The StreamCard's `onClick` handler MUST set `selectedDeviceId` in the dashboard store, which controls modal visibility.
- The modal MUST render over the dashboard without navigating away from the current page.
- The modal MUST follow the existing `QRCodeModal` pattern: fixed overlay, centered content, Escape/backdrop dismiss.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — open modal | Dashboard displays 3 StreamCards | User clicks on StreamCard for device D1 | Modal opens showing D1's stream preview and controls; no popup window created |
| Happy — multiple opens | Modal is open for device D1 | User clicks on StreamCard for device D2 | Modal content replaces to show D2's stream preview and controls |
| Edge — stream ended while modal open | Modal shows live stream for device D1 | Device D1 disconnects | Modal content reflects disconnected state (stream preview stops, controls disabled); modal stays open |

#### Acceptance Criteria

- [ ] Clicking StreamCard opens modal, not popup
- [ ] Clicking a different StreamCard while modal is open switches the modal content to the new stream
- [ ] Modal renders without page navigation
- [ ] Stream that disconnects mid-view shows graceful disconnect state

---

### R-DSM-002: Modal content

The StreamModal MUST display:

1. **Video preview**: Renders the stream's video in a `<video>` element (same as the current StreamCard preview).
2. **Stream controls**:
   - **Rename**: Text input to rename the device label (persisted in store, NOT sent to backend — local label only).
   - **Quality selector**: Low / Medium / High buttons — calls `setStreamQuality(producerId, spatialLayer)` on click.
   - **Disconnect button**: Calls the existing disconnect flow (emits `request-stop-stream` for the device).
3. **NDI controls**:
   - **NDI toggle**: Switch to enable/disable NDI output for this device — emits `set-ndi-control { deviceId, enabled }`.
   - **NDI name input**: Text input for custom NDI source name — appears when NDI is enabled; on blur or Enter, emits `set-ndi-control { deviceId, enabled: true, ndiName }`.
4. **"Open in new window" button**: Explicit button that opens the stream in a popup window (the previous StreamCard default behavior).

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — all controls visible | Modal is open for an active stream | Modal renders | Video preview, rename input, quality selector, disconnect, NDI toggle, NDI name input, and "Open in new window" button are all visible |
| Happy — open popup from modal | Modal is open | User clicks "Open in new window" | `window.open` is called with the stream's popup URL; modal stays open |
| Edge — stream not active | Modal is open but stream is disconnected | Modal renders | Controls (except rename and "Open in new window") are disabled; video preview shows last frame or placeholder |

#### Acceptance Criteria

- [ ] Modal renders video preview for the selected stream
- [ ] Quality selector changes the stream's spatial layer
- [ ] Disconnect button stops the stream
- [ ] "Open in new window" creates a popup without closing the modal
- [ ] All controls are present and functional for active streams
- [ ] Controls are gracefully disabled for disconnected streams

---

### R-DSM-003: NDI toggle behavior

The NDI toggle in the modal MUST communicate with the backend via the `set-ndi-control` Socket.io event.

- **Toggle ON**: Emits `set-ndi-control { deviceId, enabled: true }` — bridge creates NDI sender.
- **Toggle OFF**: Emits `set-ndi-control { deviceId, enabled: false }` — bridge destroys NDI sender.
- The toggle state MUST reflect the `active` field from the latest `ndi-control-updated` event.
- If the `set-ndi-control` call returns an error, the toggle MUST revert to its previous state.
- **NDI name input**: Appears only when NDI is enabled. Must be a text input with placeholder text (e.g., "NDI source name...").
  - On blur or Enter key, emits `set-ndi-control { deviceId, enabled: true, ndiName: "<value>" }`.
  - If empty string is submitted, bridge uses its default naming scheme.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — enable NDI | NDI toggle is OFF | User toggles ON | `set-ndi-control { enabled: true }` emitted; NDI name input appears; `ndi-control-updated { active: true }` updates toggle state |
| Happy — disable NDI | NDI toggle is ON, name input visible | User toggles OFF | `set-ndi-control { enabled: false }` emitted; name input hides; `ndi-control-updated { active: false }` updates toggle state |
| Happy — custom name | NDI is ON with default name | User types "LiveFeed" and presses Enter | `set-ndi-control { enabled: true, ndiName: "LiveFeed" }` emitted |
| Happy — empty name clears custom | NDI is ON with custom name "LiveFeed" | User clears input and presses Enter | `set-ndi-control { enabled: true, ndiName: "" }` emitted; bridge uses default naming |
| Error — failed to create | User toggles ON, backend returns error | `ndi-control-updated { active: false, error: "Bridge not connected" }` received | Toggle reverts to OFF; error toast displayed |
| Edge — rapid toggle | User rapidly toggles ON/OFF several times | Multiple `set-ndi-control` events sent | Bridge processes each command; idempotent for duplicate states; no crash |

#### Acceptance Criteria

- [ ] Toggling NDI ON emits `set-ndi-control { enabled: true }` with the correct `deviceId`
- [ ] Toggling NDI OFF emits `set-ndi-control { enabled: false }`
- [ ] Name input appears/disappears in sync with toggle state
- [ ] Custom name submission emits with the correct `ndiName` value
- [ ] Toggle reverts on error response
- [ ] Empty name submission resets to default bridge naming

---

### R-DSM-004: Modal dismiss behavior

The modal MUST support three dismissal methods:

1. **Escape key**: Pressing the Escape key closes the modal.
2. **Backdrop click**: Clicking the overlay background (outside the modal content area) closes the modal.
3. **Stream ended**: If the stream's producer closes while the modal is open, the modal stays open but shows disconnected state — does NOT auto-close (operator may want to see the state).

On dismiss:
- `selectedDeviceId` in the dashboard store is set to `null`.
- Modal content is removed from the DOM (no hidden state leaking).
- Stream video preview is released.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — Escape | Modal is open | User presses Escape | Modal closes; `selectedDeviceId` set to `null` |
| Happy — backdrop click | Modal is open | User clicks outside the modal content | Modal closes; `selectedDeviceId` set to `null` |
| Edge — stream dies | Modal is open with D1's stream | D1 disconnects | Modal stays open; content shows disconnected state; controls disabled |
| Edge — Escape while typing in rename input | Rename input is focused | User presses Escape | Input loses focus; modal does NOT close (native input behavior) — second Escape closes modal |

#### Acceptance Criteria

- [ ] Escape key dismisses modal (when no input is focused)
- [ ] Backdrop click dismisses modal
- [ ] Stream disconnection does not auto-close the modal
- [ ] `selectedDeviceId` is `null` after dismiss
- [ ] Video preview stops when modal closes

---

### R-DSM-005: Modal state management

Modal state MUST live in the Zustand dashboard store.

**Store state additions:**

```typescript
interface DashboardStore {
  // Existing state...
  selectedDeviceId: string | null;
  ndiControlState: Record<string, {
    enabled: boolean;
    active: boolean;
    ndiName: string;
  }>;
  
  // Existing actions...
  
  // New actions:
  selectDevice: (deviceId: string | null) => void;
  setNdiControl: (deviceId: string, enabled: boolean, ndiName?: string) => void;
  updateNdiControlState: (deviceId: string, state: { enabled: boolean; active: boolean; ndiName: string }) => void;
}
```

- `selectedDeviceId`: Controls modal visibility — `null` = modal closed, non-null = modal open for that device.
- `ndiControlState`: Per-device NDI control state, updated from `ndi-control-updated` events.
- `selectDevice(deviceId)`: Sets `selectedDeviceId` — called by StreamCard `onClick` and modal dismiss.
- `setNdiControl(deviceId, enabled, ndiName?)`: Emits `set-ndi-control` via DashboardService.
- `updateNdiControlState(deviceId, state)`: Updates the NDI state from `ndi-control-updated` events — called by the `ndi-control-updated` Socket.io handler.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — open modal | `selectedDeviceId` is `null` | `selectDevice("D1")` called | `selectedDeviceId` becomes `"D1"`; modal opens |
| Happy — close modal | `selectedDeviceId` is `"D1"` | `selectDevice(null)` called | `selectedDeviceId` becomes `null`; modal closes |
| Happy — NDI state update | Dashboard receives `ndi-control-updated { deviceId: "D1", active: true }` | `updateNdiControlState("D1", { enabled: true, active: true, ndiName: "Camera1" })` called | Store updates `ndiControlState["D1"]`; modal toggle reflects new state |

#### Acceptance Criteria

- [ ] `selectedDeviceId` is `null` when modal is closed
- [ ] `selectDevice()` correctly opens/closes the modal
- [ ] `ndiControlState` is updated on every `ndi-control-updated` event
- [ ] Store state is reactive — modal renders reflect store changes instantly

---

## Non-Goals

- **Drag-and-drop modal resizing**: Modal has fixed sizing. Resizing is future work.
- **Keyboard shortcuts beyond Escape**: No additional keyboard navigation (Tab order within modal is browser default).
- **Multiple concurrent modals**: Only one modal at a time. Switching streams replaces modal content.
- **Modal animation/smooth transitions**: Basic show/hide. Animations are polish, deferred.
- **Mobile-responsive modal layout**: Dashboard is primarily a desktop view. Mobile layout is future work.

## Edge Cases & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Modal opened for a stream that ends seconds later | Low | Modal shows disconnected state; controls disabled; "Open in new window" still works (shows last state). |
| Rapid switch between streams (click StreamCard A, then B) | Low | Modal content replaces cleanly per R-DSM-001; no double-modal or flash. |
| Video preview continues playing after modal close | Low | Modal `onClose` releases the `<video>` element's `srcObject`; component unmount stops the stream. |
| NDI toggle state out of sync with bridge (network race) | Low | `updateNdiControlState` on each `ndi-control-updated` keeps store in sync. Optimistic UI updates deferred. |
