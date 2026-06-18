# Spec: NDI Port Control

## Purpose

Dashboard operators need per-stream control over NDI output — create NDI senders for team monitoring, destroy them when not needed, and assign meaningful names for OBS/Resolume operators. The NDI bridge manages these ports in-memory, with default auto-creation enabled for all active streams.

## Requirements

### R-NPC-001: NDI port lifecycle management

The system MUST allow NDI ports to be created and destroyed per-stream from the dashboard via Socket.io events.

- NDI port lifecycle is managed by the bridge (Python, in-memory).
- The bridge maintains a `Dict[str, NdiPortState]` mapping `deviceId → port state`.
- Each NDI port has:
  - `deviceId: str` — stable device identifier (primary key for the mapping)
  - `producerId: str` — current mediasoup producer ID (changes on reconnect)
  - `ndiSourceName: str` — the NDI source name as it appears on the network (`<prefix><name>`)
  - `active: bool` — whether the NDI sender is currently running

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — create port | Dashboard enables NDI for device D1 | `set-ndi-control { deviceId: "D1", enabled: true }` processed | Bridge creates NDI sender; `ndi-control-updated { active: true }` broadcast |
| Happy — destroy port | Dashboard disables NDI for device D1 | `set-ndi-control { deviceId: "D1", enabled: false }` processed | Bridge destroys NDI sender; `ndi-control-updated { active: false }` broadcast |
| Happy — custom name | Dashboard enables NDI with name "StageLeft" | `set-ndi-control { deviceId: "D1", enabled: true, ndiName: "StageLeft" }` | NDI source appears as `MCR-StageLeft` on the network |
| Edge — already active | NDI port already active for D1 | Same device re-enables NDI | Bridge returns current state; no duplicate sender created |
| Edge — already inactive | NDI port already destroyed for D1 | Dashboard disables again | No-op; bridge returns current (inactive) state |

#### Acceptance Criteria

- [ ] NDI sender creation completes within 3 seconds of `set-ndi-control` with `enabled: true`
- [ ] NDI sender destruction completes within 3 seconds of `set-ndi-control` with `enabled: false`
- [ ] Custom NDI name appears in OBS/Resolume within 5 seconds
- [ ] `ndi-control-updated` event is broadcast after every successful state change
- [ ] Duplicate enable/disable commands are idempotent

---

### R-NPC-002: Default auto-creation (transition mode)

The bridge MUST auto-create an NDI sender for every new video stream by default.

- This preserves existing behavior — no operator action needed for NDI output.
- Once an operator explicitly disables NDI for a `deviceId` via `set-ndi-control { enabled: false }`, the bridge stores that override in-memory.
- On subsequent `stream-started` events for the same `deviceId` (e.g., after reconnect), the bridge MUST respect the override and NOT auto-create NDI.
- On bridge restart, the in-memory override map is lost — auto-creation defaults to ON for all devices.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — auto-create | Device D1 starts streaming | Bridge receives `stream-started` | NDI sender auto-created for D1 |
| Happy — override respected | Operator disabled NDI for D1 | D1 reconnects (new stream-started) | No NDI sender created (in-memory override) |
| Edge — bridge restart | Bridge restarts, D1 reconnects | D1 streams again | NDI auto-created (default ON — override map empty) |

#### Acceptance Criteria

- [ ] New streams auto-create NDI output
- [ ] Explicitly-disabled NDI stays off across reconnections (same bridge session)
- [ ] Bridge restart resets to ON for all devices

---

### R-NPC-003: In-memory state only

The NDI port mapping MUST live entirely in memory — no disk, no database, no file persistence.

- State: `Dict[str, NdiPortState]` keyed by `deviceId`.
- `NdiPortState` fields:
  - `deviceId: str`
  - `producerId: str` (current — may change on reconnect)
  - `ndiSourceName: str`
  - `active: bool`
  - `disabledByUser: bool` (override flag for auto-creation suppression)
- On bridge restart, ALL state is lost.
- The bridge MUST initialize the map empty and rebuild it from `active-streams` on connect.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — fresh state | Bridge starts | Connection to backend established | `NdiPortState` map is empty; `active-streams` repopulates active streams |
| Happy — state change | NDI toggled for device | State map updated | In-memory map reflects current state immediately |
| Edge — bridge restart | Bridge restarts | All state lost | Map empty; reconnect re-creates NDI for active streams (default ON) |

#### Acceptance Criteria

- [ ] Map is empty on bridge start
- [ ] State changes are reflected immediately (no polling)
- [ ] No file I/O occurs for NDI port state
- [ ] Bridge restart shows dashboard `active: false` for all previously-enabled NDI ports

---

### R-NPC-004: `set-ndi-control` event protocol

The Socket.io event `set-ndi-control` MUST follow this protocol:

**Direction**: Dashboard → Backend → Bridge (forwarded by backend)
**Namespace**: Default namespace (`/`) — NOT `/ndi-bridge`
**Payload**:

```typescript
{
  deviceId: string;       // Required. Stable device identifier.
  enabled: boolean;       // Required. true = create NDI sender, false = destroy.
  ndiName?: string;       // Optional. Custom NDI source name. If omitted, bridge uses default naming.
}
```

**Response**: `ndi-control-updated` (broadcast to all dashboard clients)

```typescript
{
  deviceId: string;       // The device the update applies to.
  enabled: boolean;       // Whether NDI was requested to be enabled.
  ndiName: string;        // The actual NDI source name (resolved by bridge).
  active: boolean;        // True if NDI sender is currently running.
  error?: string;         // Present if operation failed (e.g., resource exhaustion).
}
```

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — create | Socket emits `set-ndi-control { deviceId, enabled: true }` | Backend receives | Forwards to bridge; bridge creates sender; broadcasts `ndi-control-updated { active: true }` |
| Happy — destroy | Socket emits `set-ndi-control { deviceId, enabled: false }` | Backend receives | Forwards to bridge; bridge destroys sender; broadcasts `ndi-control-updated { active: false }` |
| Error — unknown device | Socket emits with non-existent `deviceId` | Backend validates | Returns `{ error: "No active stream for device" }` to caller; no broadcast |
| Error — bridge offline | Bridge not connected | Backend cannot forward | Returns `{ error: "Bridge not connected" }` to caller; no broadcast |

#### Acceptance Criteria

- [ ] Backend validates `deviceId` exists in active streams before forwarding
- [ ] Bridge-offline case returns clear error to the dashboard
- [ ] `ndi-control-updated` payload includes all required fields
- [ ] Unknown deviceId never forwarded to bridge

---

## Non-Goals

- **Disk persistence**: All state is in-memory. No DB, file, or config storage for NDI port mappings.
- **Audio NDI**: NDI port control covers video streams only. Audio NDI is deferred.
- **Tally/PTZ feedback**: No NDI metadata feedback from OBS/Resolume to the dashboard.
- **Per-operator preferences**: NDI control is per-device, not per-user. No user preference storage.
- **Bulk operations**: No "enable NDI for all" toggle — each device is controlled individually.

## Edge Cases & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bridge restarts during active NDI output | Low | All state lost; reconnection triggers auto-creation (default ON). Operator re-toggles if needed. |
| Backend restarts lose bridge connection state | Low | Bridge reconnects with backoff; `active-streams` repopulates; NDI state resets to defaults. |
| Custom NDI name conflicts on network | Low | NDI SDK handles conflicts (appends `(2)`, `(3)` etc.) — no crash, no data loss. |
| Dashboard sends rapid toggle (spam) | Low | Bridge processes each command; idempotent for same state. Rate-limiting is future work. |
| `deviceId` collides between two different physical devices | Very Low | `deviceId` is a UUID generated once per device — collision probability is negligible. |
