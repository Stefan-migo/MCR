# Design: NDI Dashboard Control

## Meta

- **Change**: `ndi-dashboard-control`
- **Status**: Draft
- **Capabilities**: `ndi-port-control`, `dashboard-stream-modal`
- **Modified**: `stream-pipeline`

---

## Architecture

### deviceId Flow

```
Mobile Device ──register-device({ deviceId })──→ Backend (devices Map)
                                                    │
Device produces video ──produce()──→ mediasoup ──stream-started({ stream: { ..., deviceId } })
                                                    │
                                                    ├──→ Dashboard (frontend)
                                                    └──→ Bridge (stream_manager.py)
```

`deviceId` is stable across reconnects (the mobile device generates it once and reuses it). This is the key invariant: NDI source naming uses `deviceId` so OBS/Resolume references survive device reboots.

### Bridge Discovery

Current bridge connects to the **main Socket.IO namespace** (not `/ndi-bridge`). To target the bridge with control events without broadcasting to all clients:

1. Bridge emits `register-bridge` on connect
2. Backend stores `bridgeSocketId: string | null`
3. `set-ndi-control` from dashboard → backend → `io.to(bridgeSocketId).emit('ndi-control', ...)`

### Event Flow: NDI Toggle

```
Dashboard                Backend                  Bridge
   │                        │                       │
   │──set-ndi-control──────→│                       │
   │  { deviceId, enabled,  │                       │
   │    ndiName? }          │                       │
   │                        │──ndi-control─────────→│
   │                        │  { deviceId,          │
   │                        │    producerId,        │
   │                        │    enabled,           │
   │                        │    sourceName }       │
   │                        │                       │── create/destroy NdiSender
   │                        │                       │
   │                        │←──ack (emit_ack)──────│
   │                        │  { deviceId,          │
   │                        │    active,            │
   │                        │    sourceName }       │
   │                        │                       │
   │←──ndi-control-updated──│                       │
   │  { deviceId, enabled,  │                       │
   │    ndiSourceName }     │                       │
```

### Modal Component Tree

```
DashboardPage
  ├── StreamGrid
  │     └── StreamCard (modified: onClick → open modal)
  ├── StreamModal (new, conditionally rendered)
  │     ├── StreamPreview
  │     ├── StreamControls (reused)
  │     └── NDI Controls (new section)
  ├── StreamControls (sidebar — kept as-is for non-modal workflow)
  └── QRCodeModal
```

`StreamCard` click opens `StreamModal` instead of `window.open`. The "Open in popup" button moves inside the modal as an explicit action.

---

## Data Model

### Frontend Types (`dashboard.ts`)

```typescript
// New — NDI control state per device
export interface NdiDeviceState {
  deviceId: string;
  enabled: boolean;
  ndiSourceName: string | null;
  loading: boolean;  // true while bridge processes the toggle
}

// StreamInfo extension (used via `as any` like quality)
// deviceId is already present on StreamInfo via server response
```

### Backend (in-memory on `server.ts`)

```typescript
let bridgeSocketId: string | null = null;
// No additional state needed — stream metadata already has deviceId + producerId
```

### Bridge (in-memory on `stream_manager.py`)

```python
# New class for NDI control state
class NdiControlState:
    def __init__(self, device_id: str, producer_id: str, source_name: str):
        self.device_id = device_id
        self.producer_id = producer_id
        self.source_name = source_name
        self.active: bool = True  # auto-created by default

# In AsyncStreamManager
self.ndi_states: Dict[str, NdiControlState] = {}  # keyed by deviceId
```

No persistence — restart = clean slate (by design, per proposal).

---

## Component Design: StreamModal

### Props

```typescript
interface StreamModalProps {
  stream: StreamInfo;
  isOpen: boolean;
  onClose: () => void;
  onDisconnect: (streamId: string) => void;
  onRename: (streamId: string, name: string) => void;
  onNdiToggle: (deviceId: string, enabled: boolean, ndiName?: string) => void;
  ndiState: NdiDeviceState | null;
}
```

### State (local)

- `ndiEnabled: boolean` — local optimistic toggle state, synced from `ndiState` on open
- `ndiName: string` — editable NDI source name input
- `isDisconnecting: boolean` — confirmation state for disconnect action

### Layout

```
┌─────────────────────────────────────────────┐
│  Stream Name                     [✕] Close  │
├─────────────────────────────────────────────┤
│                                             │
│         StreamPreview (video)               │
│                                             │
├─────────────────────────────────────────────┤
│  Stream Controls (reuse StreamControls)      │
│    ├── Rename (inline edit)                 │
│    ├── Quality: [Low] [Medium] [High]       │
│    └── Disconnect                           │
├─────────────────────────────────────────────┤
│  NDI Output                                 │
│    ├── NDI Source: [MCR-a1b2c3d4]           │
│    ├── [🌐 ON / OFF] toggle                 │
│    └── [✏️ Edit name] (inline input)        │
├─────────────────────────────────────────────┤
│  [🔲 Open in Popup]  [📋 Copy URL]          │
└─────────────────────────────────────────────┘
```

### Open/Close Behavior

- **Open**: `StreamCard` click → `DashboardPage` sets `modalStreamId` → renders `StreamModal`
- **Close**: Escape key, backdrop click, close button → `onClose()`
- Follows `QRCodeModal` pattern: fixed overlay `z-50`, `bg-black bg-opacity-70`

### Integration with StreamControls

`StreamControls` is embedded inside `StreamModal`. The sidebar `StreamControls` on the dashboard page **remains** — it still works when a stream is selected by clicking the card's stats button or via keyboard nav. This gives two pathways to controls (modal + sidebar) without breaking existing behavior.

---

## Backend Changes (`server.ts`)

### New: Bridge Socket Tracking

```typescript
let bridgeSocketId: string | null = null;

// Inside io.on('connection'):
socket.on('register-bridge', () => {
  bridgeSocketId = socket.id;
  console.log('✅ NDI bridge registered:', socket.id);
});

socket.on('disconnect', () => {
  if (socket.id === bridgeSocketId) {
    bridgeSocketId = null;
    console.log('❌ NDI bridge disconnected');
  }
  // ... existing disconnect handler
});
```

### New: `set-ndi-control` Handler

```typescript
socket.on('set-ndi-control', (data: { deviceId: string; enabled: boolean; ndiName?: string }, callback) => {
  try {
    const { deviceId, enabled, ndiName } = data;
    if (!deviceId) {
      callback?.({ error: 'deviceId is required' });
      return;
    }

    // Find stream by deviceId
    const stream = mediasoupRouter.getActiveStreams().find(s => s.deviceId === deviceId);
    if (!stream) {
      callback?.({ error: 'No active stream for device' });
      return;
    }

    if (!bridgeSocketId) {
      callback?.({ error: 'NDI bridge not connected' });
      return;
    }

    const sourceName = ndiName || `MCR-${deviceId.slice(0, 8)}`;

    io.to(bridgeSocketId).emit('ndi-control', {
      deviceId,
      producerId: stream.producerId,
      enabled,
      sourceName,
    });

    callback?.({ success: true });
  } catch (error) {
    callback?.({ error: 'Failed to process NDI control' });
  }
});
```

### New: `ndi-control-result` Handler (bridge confirmation)

```typescript
socket.on('ndi-control-result', (data: { deviceId: string; active: boolean; sourceName?: string }) => {
  // Broadcast result to all dashboard clients
  io.emit('ndi-control-updated', {
    deviceId: data.deviceId,
    enabled: data.active,
    ndiSourceName: data.sourceName || null,
  });
});
```

---

## Bridge Changes

### `stream_manager.py` — NDI Naming

**Line 61 change:**
```python
# Before:
source_name = f"{self.source_prefix}{producer_id[:8]}"

# After — extract deviceId from stream-started payload
device_id = data.get("deviceId") or (data.get("stream", {}) or {}).get("deviceId", producer_id)
source_name = f"{self.source_prefix}{device_id[:8]}"
```

The `device_id` extraction needs the `data` dict passed through `on_stream_started` → `_setup`. Currently `_setup` only receives `producer_id`. We need to pass the deviceId as a second parameter or store it in the stream state.

**Changes:**
```python
# on_stream_started — extract deviceId and pass to _setup
def on_stream_started(self, data: dict):
    producer_id = data.get("producerId")
    stream_data = data.get("stream", {}) or {}
    if not producer_id:
        producer_id = stream_data.get("producerId") or stream_data.get("id")
    if not producer_id:
        return

    device_id = stream_data.get("deviceId", producer_id)
    # ... existing max_streams check ...
    if self._loop:
        asyncio.run_coroutine_threadsafe(self._setup(producer_id, device_id), self._loop)

# _setup signature change + NDI naming
async def _setup(self, producer_id: str, device_id: str):
    source_name = f"{self.source_prefix}{device_id[:8]}"
    # ... rest unchanged, NDI sender uses source_name from device_id ...
```

### `stream_manager.py` — NDI Control State

```python
class NdiControlState:
    def __init__(self, device_id: str, producer_id: str, source_name: str):
        self.device_id = device_id
        self.producer_id = producer_id
        self.source_name = source_name
        self.active = True

# In AsyncStreamManager.__init__:
self.ndi_controls: Dict[str, NdiControlState] = {}

# In _setup, after creating NDI sender:
self.ndi_controls[device_id] = NdiControlState(device_id, producer_id, source_name)

# In remove_stream, cleanup:
self.ndi_controls.pop(device_id, None)
```

### New `on_ndi_control` handler

```python
async def on_ndi_control(self, data: dict):
    device_id = data.get("deviceId")
    producer_id = data.get("producerId")
    enabled = data.get("enabled", True)
    source_name = data.get("sourceName", "")

    if not device_id or not producer_id:
        return {"error": "deviceId and producerId required"}

    if enabled:
        # Create NDI sender if not already active
        if device_id not in self.ndi_controls or not self.ndi_controls[device_id].active:
            source_name = source_name or f"{self.source_prefix}{device_id[:8]}"
            sender = NdiSender(source_name)
            try:
                sender.initialize()
                state = self.ndi_controls.get(device_id)
                if state:
                    state.active = True
                    state.source_name = source_name
                    if state.producer_id != producer_id:
                        state.producer_id = producer_id
                else:
                    self.ndi_controls[device_id] = NdiControlState(device_id, producer_id, source_name)
                # Attach sender to the stream state
                stream_state = self.streams.get(producer_id)
                if stream_state and not stream_state.sender:
                    stream_state.sender = sender
                return {"deviceId": device_id, "active": True, "sourceName": source_name}
            except Exception as e:
                return {"deviceId": device_id, "active": False, "error": str(e)}
    else:
        # Destroy NDI sender
        state = self.ndi_controls.pop(device_id, None)
        if state:
            # Also remove sender from stream state if present
            stream_state = self.streams.get(producer_id)
            if stream_state and stream_state.sender:
                stream_state.sender.destroy()
                stream_state.sender = None
        else:
            # Fallback: find stream state and destroy its sender
            stream_state = self.streams.get(producer_id)
            if stream_state and stream_state.sender:
                stream_state.sender.destroy()
                stream_state.sender = None
        return {"deviceId": device_id, "active": False, "sourceName": None}
```

Wait — this is getting complex. Let me simplify with ponytail. The `ndi_controls` dict is redundant with `streams` dict. We can just use the sender presence in `StreamState`:

**Simpler approach** — no separate `NdiControlState` dict:
- `StreamState` already has `sender: Optional[NdiSender]`
- `sender is None` = NDI disabled for that stream
- `sender is not None` = NDI enabled
- `deviceId` → `producerId` mapping is already in `streams` dict (producer_id → StreamState)
- We add a reverse mapping `device_id → producer_id` or just add `device_id` to `StreamState`

Let me add `device_id` to `StreamState`:

```python
class StreamState:
    def __init__(self, producer_id: str, source_name: str, device_id: str = ""):
        self.producer_id = producer_id
        self.source_name = source_name
        self.device_id = device_id
        self.sender: Optional[NdiSender] = None
        # ...
```

Then `on_ndi_control` becomes:

```python
async def on_ndi_control(self, data: dict):
    device_id = data.get("deviceId")
    producer_id = data.get("producerId")
    enabled = data.get("enabled", True)
    source_name = data.get("sourceName", "")

    # Find stream state by deviceId or producerId
    state = next(
        (s for s in self.streams.values()
         if s.device_id == device_id or s.producer_id == producer_id),
        None
    )
    if not state:
        return {"deviceId": device_id, "active": False, "error": "stream not found"}

    if enabled and not state.sender:
        name = source_name or state.source_name
        sender = NdiSender(name)
        try:
            sender.initialize()
            state.sender = sender
            state.source_name = name
            return {"deviceId": device_id, "active": True, "sourceName": name}
        except Exception as e:
            return {"deviceId": device_id, "active": False, "error": str(e)}
    elif not enabled and state.sender:
        state.sender.destroy()
        state.sender = None
        return {"deviceId": device_id, "active": False, "sourceName": None}
    return {"deviceId": device_id, "active": state.sender is not None, "sourceName": state.source_name}
```

Even simpler. This is the lazy version.

### `bridge.py` — Wire NDI Control

```python
# After existing signaling.on(...) lines:

async def on_ndi_control(data):
    result = await manager.on_ndi_control(data)
    await signaling.sio.emit("ndi-control-result", result)

signaling.on("ndi-control", on_ndi_control)
```

And add `register-bridge` on connect:

```python
signaling.on("connect", lambda: (
    print("[Bridge] Connected"),
    asyncio.create_task(signaling.sio.emit("register-bridge"))
))
```

---

## Frontend Changes

### `dashboard.ts` — New Types

```typescript
export interface NdiDeviceState {
  deviceId: string;
  enabled: boolean;
  ndiSourceName: string | null;
  loading: boolean;
}

export interface ControlModalProps {
  stream: StreamInfo;
  isOpen: boolean;
  onClose: () => void;
  onDisconnect: (streamId: string) => void;
  onRename: (streamId: string, name: string) => void;
  onNdiToggle: (deviceId: string, enabled: boolean, ndiName?: string) => void;
  ndiState: NdiDeviceState | null;
}
```

### `dashboard-store.ts` — NDI State + Actions

```typescript
// New state:
ndiStates: Map<string, NdiDeviceState>;  // deviceId → state

// New actions:
setNdiState: (deviceId: string, state: Partial<NdiDeviceState>) => void;
setNdiControl: (deviceId: string, enabled: boolean, ndiName?: string) => void;
```

### `dashboard-service.ts` — NDI Events

```typescript
// New callbacks:
public onNdiControlUpdated?: (data: { deviceId: string; enabled: boolean; ndiSourceName: string | null }) => void;

// New emit method:
setNdiControl(deviceId: string, enabled: boolean, ndiName?: string): void {
  if (this.socket) {
    this.socket.emit('set-ndi-control', { deviceId, enabled, ndiName });
  }
}

// Socket handler:
this.socket.on('ndi-control-updated', (data) => {
  this.onNdiControlUpdated?.(data);
});
```

### `StreamCard.tsx` — Modal Instead of Popup

```typescript
// Change: onClick opens modal instead of popup
// Before:
onClick={handleOpenPopup}

// After:
onClick={() => onSelect(stream.id)}  // just selects, modal opens via page.tsx
```

The `onSelect` prop is already wired to `setSelectedStream` in page.tsx. Page.tsx will watch `selectedStream` and render the modal when it's set.

Wait — currently `onSelect` does `setSelectedStream(streamId)` which opens the sidebar controls. If we make click open a modal instead, we need to distinguish between "click to select (sidebar)" and "click to open modal". 

Simplest approach: card click always opens modal. Sidebar selection is separate (click sidebar selects the stream there). The `onSelect` stays as is for sidebar compatibility.

### `StreamModal.tsx` (new)

Following `QRCodeModal` pattern:

```tsx
'use client';

export default function StreamModal({ stream, isOpen, onClose, onDisconnect, onRename, onNdiToggle, ndiState }: ControlModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
         onClick={onClose}>
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full mx-4 shadow-2xl border border-gray-700 max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {stream.customName || stream.deviceName}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        {/* Video Preview */}
        <div className="aspect-video bg-gray-900">
          <StreamPreview producerId={stream.producerId} mirrored={true} />
        </div>

        {/* StreamControls (reuse existing) */}
        <div className="p-4">
          <StreamControls stream={stream} onDisconnect={onDisconnect} onRename={onRename} />
        </div>

        {/* NDI Controls */}
        <div className="px-4 pb-4 border-t border-gray-700 pt-4">
          <h3 className="text-sm font-semibold text-white mb-3">NDI Output</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">NDI Source</span>
              <span className="text-sm text-white font-mono">
                {ndiState?.ndiSourceName || 'MCR-' + (stream as any).deviceId?.slice(0, 8) || 'N/A'}
              </span>
            </div>
            {/* Toggle */}
            <button onClick={() => onNdiToggle((stream as any).deviceId, !ndiState?.enabled)}
                    className={`w-full px-3 py-2 text-sm rounded transition-colors ${
                      ndiState?.enabled
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}>
              {ndiState?.enabled ? '🌐 NDI Active' : '🌐 NDI Off'}
            </button>
            {/* Open Popup */}
            <button onClick={() => {
              const w = Math.max(320, stream.resolution?.width || 1280);
              const h = Math.max(240, stream.resolution?.height || 720);
              window.open(`/viewer/${stream.producerId}`, `viewer-${stream.producerId}`,
                `popup=yes,width=${w},height=${h}`);
            }} className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
              🔲 Open in Popup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### `page.tsx` — Wire Modal

```typescript
// New state:
const [modalStreamId, setModalStreamId] = useState<string | null>(null);
// Or reuse selectedStream: when a card is clicked, set modalStreamId
// Keep selectedStream for sidebar controls as before

// handleStreamSelect opens modal instead of sidebar selection
const handleOpenModal = (streamId: string) => {
  setModalStreamId(streamId);
};

// Pass to StreamGrid/StreamList as onStreamSelect prop
// Change StreamCard's onSelect to trigger modal

// Render modal when a stream is selected for modal
{modalStreamId && (() => {
  const stream = streams.find(s => s.id === modalStreamId);
  if (!stream) return null;
  return (
    <StreamModal
      stream={stream}
      isOpen={true}
      onClose={() => setModalStreamId(null)}
      onDisconnect={handleStreamDisconnect}
      onRename={handleStreamRename}
      onNdiToggle={(deviceId, enabled, ndiName) => {
        useDashboardStore.getState().setNdiControl(deviceId, enabled, ndiName);
      }}
      ndiState={ndiStates.get((stream as any).deviceId) || null}
    />
  );
})()}
```

---

## Event Sequence

### 1. Normal Flow (Auto-Create ON)

```
Device connects → register-device → devices Map updated
Device produces → stream-started({ stream: { producerId, deviceId, ... } })
  → Bridge on_stream_started(data)
    → Extract deviceId from data.stream.deviceId
    → source_name = f"MCR-{deviceId[:8]}"
    → Create WebRTC consumer + NDI sender
    → Dashboard: new StreamCard appears
```

### 2. Manual Toggle OFF

```
User clicks NDI toggle OFF in StreamModal
  → onNdiToggle(deviceId, false)
  → dashboardService.setNdiControl(deviceId, false)
  → Socket emit "set-ndi-control" { deviceId, enabled: false }
  → Backend: find stream by deviceId, get producerId
  → Backend → Bridge: "ndi-control" { deviceId, producerId, enabled: false }
  → Bridge: NdiSender.destroy(), sender = None
  → Bridge → Backend: ack { deviceId, active: false }
  → Backend → all: "ndi-control-updated" { deviceId, enabled: false }
  → Dashboard: NdiDeviceState.enabled = false, UI shows "NDI Off"
```

### 3. Device Reconnect (Same deviceId)

```
Device reconnects → register-device with same deviceId
Device produces → stream-started with new producerId, same deviceId
  → Bridge on_stream_started(data)
    → deviceId same as before
    → source_name = f"MCR-{deviceId[:8]}"  ← IDENTICAL to previous
    → Old StreamState cleaned up (by stream-stopped from backend)
    → New StreamState created, NDI sender created with SAME name
  → OBS still references the same NDI source name → seamless
```

### 4. Bridge Restart

```
Bridge reconnects → register-bridge emitted
  → Bridge cleans up all streams (cleanup_all in disconnect handler)
  → Backend stream-started events re-sent for active streams
  → Bridge re-creates NDI senders (auto-creation ON by default)
  → Dashboard: NDI states reset (in-memory lost)
  → NdiDeviceState on dashboard: enabled defaults to true on next stream-started
```

---

## File Change Summary

| File | Change |
|------|--------|
| `ndi-bridge/src/stream_manager.py` | Use `deviceId` for NDI naming; add `on_ndi_control` handler; add `device_id` to `StreamState` |
| `ndi-bridge/src/bridge.py` | Wire `ndi-control` event; emit `register-bridge` on connect |
| `backend/src/server.ts` | Add `bridgeSocketId` tracking; add `set-ndi-control` handler; add `ndi-control-result` handler |
| `frontend/src/types/dashboard.ts` | Add `NdiDeviceState`, `ControlModalProps` |
| `frontend/src/store/dashboard-store.ts` | Add `ndiStates`, `setNdiState`, `setNdiControl` |
| `frontend/src/lib/dashboard-service.ts` | Add `setNdiControl` emit; add `onNdiControlUpdated` callback; add `ndi-control-updated` handler |
| `frontend/src/components/dashboard/StreamCard.tsx` | Change `onClick` from popup to modal trigger |
| `frontend/src/components/dashboard/StreamModal.tsx` | **NEW** — modal with preview + controls + NDI |
| `frontend/src/app/dashboard/page.tsx` | Wire modal state; pass NDI callbacks |

---

## Risks and Mitigations

### Risk: Two parallel NDI signaling paths
The `/ndi-bridge` namespace (`ndiSignaling.ts`) exists but is unused by the current bridge. The bridge uses main namespace + WebRTC consumers. This design stays on the main namespace exclusively.

**Mitigation**: No change — the `/ndi-bridge` path is dormant. If activated later, it must not conflict with main namespace control events.

### Risk: Bridge restart during active NDI port
Bridge disconnect triggers `cleanup_all()` → all NDI senders destroyed. On reconnect, `stream-started` re-creates them (auto-creation default). Dashboard NDI state resets (in-memory).

**Mitigation**: Acceptable per proposal. Dashboard shows NDI off initially, auto-creation restores it within seconds.

### Risk: Dashboard shows stale NDI state after bridge reconnect
Frontend `NdiDeviceState` is updated only by `ndi-control-updated` events. After bridge reconnect, no `ndi-control-updated` is emitted unless the user toggles.

**Mitigation**: Not needed for MVP. Future: backend could emit current NDI states on dashboard connect. For now, the modal shows "NDI Off" after bridge restart, toggle refreshes it.

### Risk: Race between auto-create and manual toggle
If user toggles NDI OFF while bridge is still setting up the auto-created sender.

**Mitigation**: `on_ndi_control` checks `state.sender` — if already present, destroy and mark inactive. Auto-create in `_setup` also checks a flag (`self.ndi_enabled` per device) before creating sender.

---

## Rollback

Per proposal — each change independently revertible:
1. **NDI naming**: revert `stream_manager.py` line 61 → `producer_id[:8]`
2. **Modal**: revert `StreamCard.tsx` onClick → `handleOpenPopup`; remove `StreamModal.tsx`
3. **NDI controls**: revert `set-ndi-control` in `server.ts`, remove `ndi-control` handler from bridge
