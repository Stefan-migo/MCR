# Tasks: NDI Dashboard Control

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~293 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Bridge — NDI Naming Stability

- [x] 1.1 `stream_manager.py`: Add `device_id` field to `StreamState.__init__`
- [x] 1.2 `stream_manager.py`: Refactor `on_stream_started` to extract `deviceId` from `data["stream"]["deviceId"]`, pass to `_setup`
- [x] 1.3 `stream_manager.py`: Update `_setup` signature — accept `device_id`, use `device_id[:8]` for `source_name`

## Phase 2: Backend — NDI Control Events

- [x] 2.1 `server.ts`: Add `bridgeSocketId` variable, `register-bridge` handler, disconnect cleanup for bridge
- [x] 2.2 `server.ts`: Add `set-ndi-control` handler with validation (deviceId exists, bridge connected), forward to bridge socket
- [x] 2.3 `server.ts`: Add `ndi-control-result` handler that broadcasts `ndi-control-updated` to all dashboard clients

## Phase 3: Bridge — NDI Control Listener

- [x] 3.1 `bridge.py`: Emit `register-bridge` on connect
- [x] 3.2 `bridge.py`: Wire `ndi-control` event → `manager.on_ndi_control()`, emit `ndi-control-result` ack
- [x] 3.3 `stream_manager.py`: Implement `on_ndi_control()` — find `StreamState` by deviceId/producerId, create/destroy NdiSender based on `enabled` flag

## Phase 4: Dashboard — Stream Modal

- [x] 4.1 `dashboard.ts`: Add `NdiDeviceState`, `ControlModalProps` types
- [x] 4.2 `dashboard-store.ts`: Add `selectedDeviceId`, `ndiControlState` state; `selectDevice`, `setNdiControl`, `updateNdiControlState` actions
- [x] 4.3 `dashboard-service.ts`: Add `setNdiControl()` emit, `onNdiControlUpdated` callback, `ndi-control-updated` socket handler
- [x] 4.4 `StreamModal.tsx` (NEW): Full modal with StreamPreview, StreamControls, NDI toggle/name input, Open in Popup button
- [x] 4.5 `StreamCard.tsx`: Change `onClick` from `handleOpenPopup` to `() => onSelect(stream.id)` (modal trigger)
- [x] 4.6 `page.tsx`: Add `modalStreamId` state, `handleOpenModal`, render StreamModal conditionally, pass NDI callbacks

## Phase 5: Verification

- [ ] 5.1 Verify NDI naming: device reconnect → identical NDI source name (no `-2` suffix)
- [ ] 5.2 Verify NDI control: dashboard toggle creates/destroys NDI sender within 3s
- [ ] 5.3 Verify modal: click opens, Escape/backdrop closes, controls functional
- [ ] 5.4 Verify error paths: unknown deviceId, bridge offline, NDI sender creation failure
