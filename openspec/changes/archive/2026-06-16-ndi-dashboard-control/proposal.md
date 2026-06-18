# Proposal: NDI Dashboard Control

## Intent

Three interconnected problems: (1) device reconnects → new `producerId` → NDI source name changes → OBS/operators lose their reference; (2) clicking a StreamCard opens a bare popup instead of a management modal; (3) no way to control NDI output (create/destroy/rename) from the dashboard. Solve all three with stable `deviceId`-based NDI naming, a modal replacing the popup, and NDI lifecycle controls inside it.

## Scope

### In Scope
- **NDI Port Persistence**: Bridge NDI source names use `deviceId` (stable across reconnects) instead of `producerId` (ephemeral). ~2 line Python fix in `stream_manager.py` — `deviceId` is already in `stream-started` payload.
- **Dashboard Stream Modal**: Clicking `StreamCard` opens a modal with video preview, controls (rename, quality selector, disconnect, NDI toggle, NDI name edit, open popup). Modal is implemented as a new component; "Open in new window" moves from the card's `onClick` to an explicit button inside the modal.
- **NDI Control from Dashboard**: Backend Socket.io events (`set-ndi-control` / `ndi-control-updated`) to create/destroy NDI ports per stream. Bridge listens and responds. Frontend NDI toggle + name input in the modal. Mapping `deviceId` → NDI port state lives in-memory on the bridge.
- **Default ON**: Auto-creation of NDI ports stays enabled by default (transition approach). Toggle disables it per-stream.

### Out of Scope
- NDI bridge service (`ndi-bridge-service` change) — already being implemented; this change only modifies existing bridge code
- Audio NDI
- NDI tally feedback or PTZ
- File/memory persistence beyond in-memory maps — backend restart = clean slate
- `/ndi-bridge` namespace adoption — bridge keeps using the main namespace with WebRTC consumers (aiortc)

## Capabilities

### New Capabilities
- `ndi-port-control`: NDI port lifecycle management — create/destroy per-stream via dashboard toggle, NDI source naming for team recognition, in-memory mapping on bridge, default auto-creation ON
- `dashboard-stream-modal`: Modal stream management UI — replaces popup behavior on StreamCard click, contains stream controls (rename, quality, disconnect, open popup, NDI toggle + name)

### Modified Capabilities
- `stream-pipeline`: NDI port naming changes from producerId-based to deviceId-based (stable across reconnects); NDI lifecycle events (`stream-started`/`stream-stopped` extended with deviceId-aware naming); `stream-started` event payload already carries `deviceId` — only consumer code needs updating

## Approach

**NDI Naming**: Change one line in `ndi-bridge/src/stream_manager.py` — extract `deviceId` from `data["stream"]["deviceId"]` in `on_stream_started`, use it instead of `producerId[:8]` for `source_name`.

**NDI Control Events**: Backend `server.ts` adds `set-ndi-control` handler (`{ deviceId, enabled: bool, ndiName?: string }`). Bridge's signaling client receives the event and creates/destroys the NDI sender accordingly. Bridge maintains `Dict[str, NdiControlState]` in memory.

**Dashboard Modal**: New `StreamModal` component (following `QRCodeModal` pattern — fixed overlay, close on escape/backdrop). `StreamCard`'s `onClick` opens the modal instead of `window.open`. Modal renders `StreamPreview`, the controls from `StreamControls`, plus NDI toggle + name input. "Open in popup" button calls `window.open` explicitly.

| Area | Impact | Description |
|------|--------|-------------|
| `ndi-bridge/src/stream_manager.py` | Modified | Extract `deviceId`, use for NDI source naming; listen for NDI control events |
| `backend/src/server.ts` | Modified | Add `set-ndi-control` Socket.io event handler |
| `frontend/src/components/dashboard/StreamModal.tsx` | New | Modal overlay with stream controls + NDI controls |
| `frontend/src/components/dashboard/StreamCard.tsx` | Modified | Change `onClick` from popup to modal open |
| `frontend/src/app/dashboard/page.tsx` | Modified | Wire modal state, pass NDI control callbacks |
| `frontend/src/store/dashboard-store.ts` | Modified | Add NDI control state + actions |
| `frontend/src/types/dashboard.ts` | Modified | Add NDI-related types |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bridge misses `set-ndi-control` during reconnect | Low | Bridge reconnects → re-creates NDI from active stream state; toggle state is transient and resets |
| Backend restart loses NDI mapping | Low | By design (in-memory). Dashboard shows disconnected state; operator re-toggles after restart |
| Modal blocks dashboard workflow (e.g., can't see other streams) | Low | Modal is dismissable (escape/backdrop); stream continues in background |

## Rollback Plan

Each change is independently revertible:
1. **NDI naming**: revert `stream_manager.py` to use `producerId[:8]` — bridge rebuild and restart
2. **Modal**: revert `StreamCard.tsx` `onClick` and `page.tsx` — card goes back to popup
3. **NDI controls**: revert `set-ndi-control` handler in `server.ts` and bridge listener — no UI impact, NDI stays auto-created

## Dependencies

- `ndi-bridge-service` change must be deployed first (bridge must be running with current code)
- Existing `stream-started` event payload (already includes `deviceId`)

## Success Criteria

- [ ] Device disconnect → reconnect → NDI source name is IDENTICAL (no `-2`, `-3` suffixes)
- [ ] Clicking StreamCard opens a modal (not a popup)
- [ ] Modal contains: rename, Low/Med/High quality selector, disconnect, open popup, NDI toggle, NDI name input
- [ ] NDI toggle creates/destroys NDI port within 3 seconds
- [ ] Custom NDI name appears in OBS/Resolume within 5 seconds
- [ ] Bridge restart → NDI auto-creation ON for all active streams (default behavior preserved)
