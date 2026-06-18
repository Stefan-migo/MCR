# Delta: Stream Pipeline — NDI Naming & Control Events

**Capability**: `stream-pipeline` (MODIFIED)
**Change**: `ndi-dashboard-control`
**Status**: DRAFT

---

## Changes

### R-SPD-001: NDI source naming stability via deviceId

The NDI source name MUST use `deviceId` instead of `producerId` when creating NDI senders in the bridge's `on_stream_started` handler.

- `deviceId` is already present in the `stream-started` event payload at `data["stream"]["deviceId"]` — no backend changes needed.
- The bridge (`stream_manager.py`) MUST extract `deviceId` from the incoming event and use it as the NDI source name identifier.
- `producerId` MAY still be stored as metadata (not part of the NDI source name).

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — reconnect stable name | Device disconnects and reconnects, gets a new `producerId` | The bridge calls `on_stream_started` again | The NDI source name is identical to the previous connection — same `deviceId` → same name |
| Edge — new device | A completely new device connects | Bridge creates NDI source | NDI source name uses the new `deviceId` — distinct from all others |
| Edge — no deviceId in payload | `stream-started` payload lacks `deviceId` (unexpected format) | Bridge processes the event | Bridge falls back to `producerId[:8]` (backward-compatible); error is logged |

#### Acceptance Criteria

- [ ] Device disconnect → reconnect → NDI source name is IDENTICAL (no `-2`, `-3` suffixes)
- [ ] `deviceId` extraction from `stream-started` payload works with existing backend event format
- [ ] Bridge logs when falling back to `producerId` (deviceId not found)

---

### R-SPD-002: NDI lifecycle control events

The backend MUST expose two new Socket.io events on the default namespace (not `/ndi-bridge`):

1. **`set-ndi-control`** (dashboard → backend):
   - Payload: `{ deviceId: string, enabled: boolean, ndiName?: string }`
   - Backend forwards this to the bridge via the bridge's existing signaling channel
   - If `enabled: true`, bridge creates an NDI sender for the given `deviceId`
   - If `enabled: false`, bridge destroys the NDI sender for the given `deviceId`
   - `ndiName` (optional): custom NDI source name — if omitted, bridge uses the default naming scheme

2. **`ndi-control-updated`** (backend → dashboard):
   - Payload: `{ deviceId: string, enabled: boolean, ndiName: string, active: boolean }`
   - Broadcast to all dashboard clients when NDI port state changes
   - The `active` field reflects the actual runtime state (creating an NDI sender may fail)

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — enable NDI | Dashboard sends `set-ndi-control { deviceId: "D1", enabled: true }` | Backend receives and forwards to bridge | Bridge creates NDI sender; `ndi-control-updated { deviceId: "D1", enabled: true, active: true }` broadcast |
| Happy — disable NDI | Dashboard sends `set-ndi-control { deviceId: "D1", enabled: false }` | Backend receives and forwards to bridge | Bridge destroys NDI sender; `ndi-control-updated { deviceId: "D1", enabled: false, active: false }` broadcast |
| Happy — custom name | Dashboard sends `set-ndi-control { deviceId: "D1", enabled: true, ndiName: "MainCamera" }` | Bridge receives with name | NDI source created with name `MCR-MainCamera` |
| Edge — unknown deviceId | Dashboard sends `set-ndi-control` for a device that has no active stream | Backend processes | Backend returns error `{ error: "No active stream for device" }`; no bridge forwarding |
| Edge — bridge disconnected | Bridge is not connected when `set-ndi-control` arrives | Backend processes | Backend queues the event (best-effort); if bridge reconnects within 5s, command applies |
| Edge — NDI sender creation fails | Bridge cannot create NDI sender (resource exhaustion, NDI SDK error) | Bridge attempts creation | `ndi-control-updated { active: false }` emitted; error logged on bridge |

#### Acceptance Criteria

- [ ] Dashboard can enable/disable NDI per stream via `set-ndi-control`
- [ ] Custom NDI names propagate within 5 seconds
- [ ] All dashboard clients receive `ndi-control-updated` broadcasts
- [ ] Unknown `deviceId` returns error, does not crash backend
- [ ] Bridge resource exhaustion does not cascade to other streams

---

### R-SPD-003: Default auto-creation on stream start

The bridge MUST continue auto-creating NDI senders when a `stream-started` event is received (default ON behavior).

- This is the "transition approach" — all streams get NDI by default.
- The `set-ndi-control` toggle is an override per-device: once a user explicitly disables NDI for a device, the bridge MUST NOT auto-create NDI on subsequent `stream-started` events for that device (within the same bridge session).
- On bridge restart, the in-memory override map is lost — auto-creation defaults to ON for all devices again.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — default auto-create | A new device starts streaming | `stream-started` arrives at bridge | Bridge auto-creates NDI sender (default ON) |
| Happy — explicit disable sticks | Operator disables NDI for device D1 via `set-ndi-control { enabled: false }` | D1 reconnects (new producerId, same deviceId) | Bridge does NOT auto-create NDI for D1 (in-memory override persists for this bridge session) |
| Edge — bridge restart | Bridge restarts (in-memory state lost) | D1 reconnects after restart | Bridge auto-creates NDI for D1 (default ON — override map is empty) |

#### Acceptance Criteria

- [ ] New streams auto-create NDI output without user action
- [ ] Explicitly-disabled NDI stays off on reconnection (same bridge session)
- [ ] Bridge restart resets to default ON for all devices

---

## Impact on Existing Requirements

| Existing Requirement | Impact |
|---|---|
| R-005 (ndi-bridge-service spec): NDI source naming | Source name MUST use `deviceId` instead of `producerId` or `deviceName`. The `<deviceName>` fallback in R-005 is superseded by `deviceId`-based naming. |
| R-002 (ndi-bridge-service spec): Bridge lifecycle | No change to the lifecycle itself; `on_stream_started` handler uses `deviceId` for naming instead of `producerId`. |
| R-SQC-002 (stream-pipeline quality control) | Independent — `set-stream-quality` and `set-ndi-control` are separate events. No overlap. |

## Non-Goals

- Audio NDI control
- NDI port persistence to disk
- `/ndi-bridge` namespace changes — NDI control events use the default namespace
- Bridge `set-ndi-control` implementation details (handled by ndi-bridge-service change)

## Edge Cases & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `deviceId` not present in `stream-started` payload | Low | Fallback to `producerId[:8]` preserves backward compatibility |
| Dashboard sends `set-ndi-control` before bridge is ready | Low | Bridge processes events after connection; best-effort queuing |
| Custom ndiName conflicts with existing NDI source name on the network | Low | NDI SDK appends ` (2)` suffix automatically — no crash |
