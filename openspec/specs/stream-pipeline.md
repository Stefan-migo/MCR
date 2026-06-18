# Spec: Stream Pipeline Optimization

---

## 1. ndi-bridge-quality — NDI Bridge Consumer Spatial Layer

### Purpose

The NDI bridge consumer currently receives the lowest simulcast layer (`spatialLayer: 0`, ~180p/200kbps), producing poor-quality NDI output for OBS/Resolume. The fix makes it consume the highest layer (`spatialLayer: 2`, 720p/1Mbps), matching what the browser dashboard consumer already receives.

### Requirements

#### R-NBQ-001: NDI consumer spatial layer selection [sdp-exchange]

The system MUST request `spatialLayer: 2` (instead of `spatialLayer: 0`) when configuring preferred layers for NDI bridge simulcast/SVC consumers in the `resume-consumer` handler.

- The temporalLayer value MAY remain `0` unchanged.
- The change MUST only affect NDI bridge consumers — browser dashboard consumers (which already negotiate spatialLayer 2 via their own SDP) MUST NOT be affected.
- If the consumer type is neither `simulcast` nor `svc`, the server MUST NOT call `setPreferredLayers`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy path — simulcast | An NDI bridge consumer is created for a simulcast producer | The `resume-consumer` handler calls `consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 0 })` | The consumer receives the highest simulcast layer (720p) and RTP packets flow to the NDI bridge |
| Edge — producer has fewer layers | A producer publishes only 2 simulcast layers (no layer 2) | `setPreferredLayers` requests spatialLayer 2 | Mediasoup silently uses the highest available layer (layer 1) — no error thrown |
| Edge — SVC stream | The producer uses SVC encoding instead of simulcast | `setPreferredLayers` is called | Mediasoup applies the spatial layer preference — SVC adapts gracefully |
| Edge — non-simulcast | Consumer type is `simple` | The `resume-consumer` handler checks `ctype` | `setPreferredLayers` is NOT called; layer selection is irrelevant |

### Acceptance Criteria

- [ ] NDI bridge consumer receives and renders frames at 720p resolution
- [ ] No regression on browser dashboard consumer quality
- [ ] Producer without layer 2 does not cause errors

---

## 2. stream-encoding-config — Bitrate Cap & Codec Profile

### Purpose

Two backend configuration changes: (a) remove the artificial 1.5 Mbps bitrate cap that bottlenecks 1080p streams, and (b) add H.264 High Profile (`640c1f`) to mediasoup router codecs so iOS hardware encoders can negotiate a more efficient profile.

### Requirements

#### R-SEC-001: Producer bitrate cap

The WebRTC transport `maxIncomingBitrate` MUST be set to `10000000` (10 Mbps, up from `1500000` / 1.5 Mbps).

- The value SHOULD provide headroom for sustained 1080p H.264 (typical 2–4 Mbps, peaks up to 8 Mbps).
- The value MUST still prevent runaway bitrate on shared uplinks — 10 Mbps is a safe ceiling for consumer/prosumer mobile cameras.
- If a future config mechanism is introduced, the value MAY become environment-configurable.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy path | A producer sends 1080p video under normal lighting | Bitrate reaches 2–4 Mbps | Transport does not cap the bitrate; `maxIncomingBitrate` is not exceeded |
| Edge — extreme motion | Camera captures fast motion at 1080p | Bitrate peaks at 6–8 Mbps | Transport allows the peak — 10 Mbps ceiling provides headroom |
| Edge — producer connects via limited uplink | Device has only 2 Mbps upload | Producer's encoder adapts bandwidth internally | The mediasoup cap (10 Mbps) is not the bottleneck — device-side bandwidth limiting is independent |

#### R-SEC-002: H.264 High Profile codec support

The router `mediaCodecs` MUST include a second H.264 video codec entry with `profile-level-id: '640c1f'` (H.264 High Profile, level 4.1).

- The existing Constrained Baseline entry (`42e01f`) MUST remain as the first video codec entry to preserve backward compatibility.
- The High Profile entry SHOULD be placed immediately after the Baseline entry in the codecs array.
- The High Profile entry MUST use the same `packetization-mode: 1`, `level-asymmetry-allowed: 1`, and RTCP feedback settings as the Baseline entry.
- The `x-google-start-bitrate` parameter MAY differ from the Baseline entry if tuning is needed.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy path — iOS | An iOS device with H.264 High Profile hardware encoder connects | The device's SDP offer includes High Profile (`640c1f`) among its supported profiles | Mediasoup negotiates High Profile; the stream uses High Profile encoding for better quality-per-bit |
| Happy path — backward compat | A desktop browser that only supports Constrained Baseline connects | The device's SDP offer only lists Baseline (`42e01f`) | Mediasoup matches the Baseline codec entry — no regression, stream works as before |
| Edge — codec selection order | Both entries match the device's capabilities | The SDP negotiation process matches codecs in order | Baseline (first entry) is preferred unless the client explicitly requests High Profile |

### Acceptance Criteria

- [ ] Producer bitrate reaches 2–4 Mbps under normal lighting (no artificial cap at 1.5 Mbps)
- [ ] iOS devices negotiate H.264 High Profile when available
- [ ] Desktop browsers still use Constrained Baseline — no regression
- [ ] `maxIncomingBitrate` is 10,000,000 in `webRtcTransport` config

---

## 3. camera-defaults — Default Camera Quality Preset

### Purpose

New users currently default to Medium quality (720p@24fps, 500kbps). Changing the default to High (1080p@30fps, 1Mbps) means every new stream starts at professional-grade HD without manual intervention.

### Requirements

#### R-CD-001: Default quality preset

The default value of `selectedQualityPreset` in `useStreamStore` MUST be `CameraService.QUALITY_PRESETS[2]` (High preset) instead of `QUALITY_PRESETS[1]` (Medium preset).

- The High preset resolution MUST be 1920×1080 @30fps with a bitrate target of 1,000,000 bps.
- The user MUST still be able to change quality presets (Medium, Ultra, etc.) via the existing `changeQuality` action.
- If user preferences are persisted in a future iteration, this default only applies on first launch — existing preferences SHOULD override.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy path — fresh start | A new user opens the camera page | The store initializes and `startStreaming` is called | `getUserMedia` requests 1920×1080 @30fps; the stream is HD quality |
| Edge — device cannot support 1080p | The device's rear camera maxes out at 720p | `getUserMedia` is called with the High preset constraints | The browser's `getUserMedia` falls back to the nearest supported resolution (typically 1280×720) — no error |
| Edge — user downgrades | After streaming starts, the user selects Medium quality | `changeQuality(QUALITY_PRESETS[1])` is called | The stream restarts at Medium quality; the store updates `selectedQualityPreset` to Medium |
| Edge — user upgrades to Ultra | After streaming starts, the user selects Ultra quality | `changeQuality(QUALITY_PRESETS[3])` is called | The stream restarts at Ultra quality per existing behavior |

### Acceptance Criteria

- [ ] New device streams default to 1080p@30fps without user intervention
- [ ] `QUALITY_PRESETS[2]` is the default in `stream-store.ts`
- [ ] Quality switching still works for all preset levels
- [ ] Devices unable to support 1080p gracefully fall back

---

## 4. stream-stats — Real Mediasoup Producer Stats

### Purpose

Dashboard stream stats are currently fake mock data (`Math.random()`). Replacing them with real `producer.getStats()` data turns the dashboard into a genuine diagnostic tool for debugging quality issues (bitrate, packetsLost, frameRate, jitter).

### Requirements

#### R-SS-001: Real producer stats broadcasting

The `startStatsBroadcasting` interval MUST replace randomly generated mock values with data from mediasoup's `producer.getStats()` for each active stream.

- The broadcast interval MUST remain 2 seconds.
- The emitted event MUST remain `'stream-stats-update'` and the payload structure MUST remain backward-compatible with the frontend `StreamStats` interface.
- The server MUST maintain a mapping between active streams and their producer instances (via `mediasoupRouter.getActiveStreams()` and producer lookups).
- The `stream.stats` object MUST include: `bitrate`, `packetsLost`, `frameRate`, `jitter`.
- `rtt` MAY be included when available from the Producer stats.
- The frontend MUST NOT require changes — only the data source changes.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy path — active producer | A video producer is active with RTP flowing | The 2-second interval fires and `producer.getStats()` returns stats | The dashboard receives `stream-stats-update` with real bitrate (~1–4 Mbps), packetsLost (0–few), frameRate (~30), jitter (<50ms) |
| Happy path — multiple producers | 2 active streams are producing | The interval fires | Both streams receive real stats in the same `stream-stats-update` payload |
| Edge — producer paused | The producer is paused (no RTP) | `getStats()` returns zero-bitrate stats | Stats reflect 0 bitrate; frontend displays "paused" or 0 values gracefully |
| Edge — producer closed mid-interval | A producer is closed between the last `getActiveStreams()` call and the `getStats()` call | `getStats()` throws or returns empty | The handler catches the error and continues; the producer is skipped in this cycle |
| Edge — `getStats()` returns empty array | Producer exists but no data yet (transitional state) | Stats array is empty | The handler emits the last known stats or zeros — MUST NOT crash |
| Edge — first frame not yet received | Producer just created, no RTP yet | `getStats()` returns 0 packets sent | Stats show bitrate=0, frameRate=0; frontend handles gracefully |

### Acceptance Criteria

- [ ] Dashboard displays real (non-random) bitrate, packetsLost, frameRate, jitter
- [ ] Values update every 2 seconds
- [ ] No crash if a producer is closed mid-cycle
- [ ] Frontend shows stable/accurate readings under normal streaming
- [ ] Frontend shows 0/paused state during producer pause

---

## 5. stream-quality-control — Multi-Layer Simulcast & Quality Selection

### Purpose

The iPhone producer currently uses a single adaptive-bitrate encoding that bounces between resolutions (904×508 ↔ 640×360), making stable VJ operation impossible. This change replaces it with 3-layer simulcast (1080p/540p/270p), then lets the operator pick the active spatial layer per stream from the dashboard. The server propagates the choice to ALL consumers (browser + NDI) at once — no renegotiation needed.

### Requirements

#### R-SQC-001: Producer simulcast encodings [sdp-exchange]

The iPhone producer (`webrtc-client.ts`) MUST publish 3 simulcast encoding layers when the device supports it:

| Layer | spatialLayer | scaleResolutionDownBy | maxBitrate | UI Label |
|-------|-------------|----------------------|------------|----------|
| 0 | 0 | 4.0 | 200 Kbps | Low |
| 1 | 1 | 2.0 | 500 Kbps | Medium |
| 2 | 2 | 1.0 | 4 Mbps | High |

If iOS Safari does not support simulcast (only spatial layer 0 is active), the system MUST fall back to a single encoding with `degradationPreference: 'maintain-resolution'` and `maxBitrate: 10000000`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — iPhone producer | An iOS device starts streaming | `sendTransport.produce()` is called with 3 encodings | Mediasoup receives all 3 simulcast layers |
| Edge — iOS no simulcast | iOS Safari only activates layer 0 | Producer detects incomplete simulcast | Falls back to single encoding, `degradationPreference: 'maintain-resolution'` |
| Edge — desktop browser | Chrome/Firefox starts a stream | 3 encodings are published | All 3 layers work normally — no regression |

#### R-SQC-002: Server set-stream-quality event

The server MUST accept a `set-stream-quality` Socket.io event with payload `{ producerId: string, spatialLayer: 0 | 1 | 2 }`.

The handler MUST:
1. Call `mediasoupRouter.getConsumersByProducerId(producerId)` to find ALL consumers for that producer
2. Iterate consumers and call `consumer.setPreferredLayers({ spatialLayer, temporalLayer: 0 })` on each
3. Broadcast `stream-quality-changed { producerId, spatialLayer }` to all dashboard clients
4. Return `{ success: true }` to the caller

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — switch quality | Operator selects Medium for stream P1 | Server receives `set-stream-quality { producerId: "P1", spatialLayer: 1 }` | ALL consumers for P1 get spatialLayer 1; `stream-quality-changed` broadcast to dashboard |
| Edge — consumer not simulcast | A consumer type is `simple` | `setPreferredLayers` throws on simple consumer | Handler catches the error; remaining consumers are still updated |
| Edge — unknown producerId | No producer matches the given ID | Handler runs | Returns `{ error: "Producer not found" }` |
| Edge — zero consumers | Producer exists but has no consumers | Consumers list is empty | Returns `{ success: true, consumersUpdated: 0 }` — no-op, not an error |

#### R-SQC-003: MediasoupRouter.getConsumersByProducerId()

The `MediasoupRouter` class MUST expose `getConsumersByProducerId(producerId: string): mediasoupTypes.Consumer[]` that returns ALL consumers consuming from the given producer, across all transports.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — multiple consumers | Producer P1 has 3 consumers (2 browser + 1 NDI) | Method is called | Returns array of all 3 Consumer objects |
| Edge — no consumers | Producer P1 has zero consumers | Method is called | Returns empty array `[]` |

#### R-SQC-004: Stream quality types and store

The frontend MUST define a `StreamQuality` type: `{ spatialLayer: 0 | 1 | 2; label: 'Low' | 'Medium' | 'High' }`.

`StreamInfo` in both `types/dashboard.ts` and `dashboard-service.ts` MUST include an optional `quality?: StreamQuality` field, defaulting to `{ spatialLayer: 2, label: 'High' }`.

`dashboard-store` MUST expose a `setStreamQuality(producerId: string, spatialLayer: 0 | 1 | 2)` action that:
1. Updates the stream's `quality` field in the store
2. Emits `set-stream-quality` via `DashboardService.setStreamQuality()`

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — quality update | Operator clicks Medium | `setStreamQuality("P1", 1)` is called | Store updates P1's quality to `{ spatialLayer: 1, label: "Medium" }`; socket emits `set-stream-quality` |

#### R-SQC-005: Dashboard quality selector

`StreamControls` MUST render quality selector buttons Low / Medium / High. The active button MUST be visually highlighted. Clicking a different quality MUST call `setStreamQuality`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — select Medium | Current quality is High | Operator clicks "Medium" | Medium button highlights; quality switches on ALL consumers |
| Edge — re-select current | Current quality is High | Operator clicks "High" | No socket emission; state unchanged |

#### R-SQC-006: Dashboard quality badge

`StreamCard` MUST display a quality badge overlay showing the current quality (Low / Medium / High) on the video preview area.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — show badge | Stream is at High quality | Card renders | Badge shows "HD" / "High" on the preview |
| Happy — quality changes | Quality switches to Low | Store updates | Badge immediately reflects "SD" / "Low" |

#### R-SQC-007: Browser consumer setSpatialLayer method

`BrowserRecvConsumer` MUST expose `setSpatialLayer(layer: number)` that checks consumer type and calls `this.consumer.setPreferredLayers({ spatialLayer: layer, temporalLayer: 0 })`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — switch to Low | Consumer is consuming a simulcast stream | `setSpatialLayer(0)` is called | `setPreferredLayers({ spatialLayer: 0, temporalLayer: 0 })`; video resolution drops immediately |
| Edge — non-simulcast consumer | Consumer type is `simple` | `setSpatialLayer(0)` is called | Error caught silently; no crash, no resolution change |
| Edge — consumer closed | Consumer is closed mid-call | `setPreferredLayers` throws | Error caught; no unhandled rejection |

#### R-SQC-008: DashboardService quality methods

`DashboardService` MUST expose:
- `setStreamQuality(producerId: string, spatialLayer: number)` — emits `set-stream-quality` via socket
- `onStreamQualityChanged?: (data: { producerId: string; spatialLayer: number }) => void` — fires when `stream-quality-changed` is received from server

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — emit quality change | Service is connected | `setStreamQuality("P1", 1)` called | Socket emits `set-stream-quality { producerId: "P1", spatialLayer: 1 }` |
| Happy — receive quality change | Server broadcasts quality update | Socket receives `stream-quality-changed` | `onStreamQualityChanged` fires with producerId and spatialLayer |

### Acceptance Criteria

- [ ] iPhone publishes 3 simulcast layers with the configured scaleResolutionDownBy and maxBitrate values
- [ ] `set-stream-quality` event handler iterates ALL consumers for a producerId and calls setPreferredLayers on each
- [ ] Non-simulcast consumers are skipped without errors
- [ ] Dashboard shows quality selector (Low/Medium/High) per stream
- [ ] Switching to Low shows immediate lower-resolution video on browser consumer
- [ ] Switching to High shows immediate full-resolution video on browser consumer
- [ ] NDI bridge output resolution matches the selected spatial layer
- [ ] iOS fallback to single maintain-resolution encoding works when simulcast unsupported
- [ ] No regression on non-iOS browsers (desktop Chrome/Firefox)
- [ ] All changes independently revertible

### Non-Goals (stream-quality-control specific)

The following are explicitly NOT in scope for this change:

- **Persistent quality preferences across sessions**: Quality resets to High on reconnect. Persistence is future work.
- **SVC encoding**: Simulcast only. SVC support and toggling between modes is deferred.
- **Python NDI bridge changes**: The NDI bridge receives whatever spatial layer the server sets. No Python changes needed.
- **ffmpeg/hardware encoder changes**: Pure mediasoup/WebRTC configuration.
- **Transcoding**: The SFU remains a pure forwarder. No server-side transcoding is introduced.

### Edge Cases & Risks (stream-quality-control specific)

| Risk | Likelihood | Mitigation |
|---|---|---|
| iOS Safari simulcast not supported | Medium | Fallback: single encoding with `degradationPreference: 'maintain-resolution'`. Detected at produce time via UA sniffing. |
| Existing connections use single encoding | Low | New producers only. Existing single-encoding producers are unaffected — they keep their current behavior. |
| 4 Mbps layer exceeds poor uplink | Low | Device encoder adapts; server `maxIncomingBitrate` of 10 Mbps is ceiling. |
| NDI bridge receives unexpected layers | Low | Server always calls `setPreferredLayers` explicitly — no ambiguity about which layer is active. |
| Consumer setPreferredLayers fails silently | Low | Handler catches errors per-consumer and continues. Dashboard still shows the intended quality selection. |

---

---

## 6. ndi-naming-stability — NDI Source Naming via deviceId

### Purpose

Bridge NDI source names use `deviceId` (stable across reconnects) instead of `producerId` (ephemeral), so OBS/Resolume references survive device reboots without `-2`, `-3` suffixes.

### Requirements

#### R-SPD-001: NDI source naming stability via deviceId

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

## 7. ndi-lifecycle-control — NDI Lifecycle Control Events

### Purpose

Dashboard operators control NDI output per-stream via Socket.io events — create/destroy senders, assign custom names, with default auto-creation on.

### Requirements

#### R-SPD-002: NDI lifecycle control events

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

#### R-SPD-003: Default auto-creation on stream start

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

### Impact on Existing Requirements

| Existing Requirement | Impact |
|---|---|
| R-005 (ndi-bridge-service spec): NDI source naming | Source name MUST use `deviceId` instead of `producerId` or `deviceName`. The `<deviceName>` fallback in R-005 is superseded by `deviceId`-based naming. |
| R-002 (ndi-bridge-service spec): Bridge lifecycle | No change to the lifecycle itself; `on_stream_started` handler uses `deviceId` for naming instead of `producerId`. |
| R-SQC-002 (stream-pipeline quality control) | Independent — `set-stream-quality` and `set-ndi-control` are separate events. No overlap. |

### Non-Goals (ndi-lifecycle-control specific)

- Audio NDI control
- NDI port persistence to disk
- `/ndi-bridge` namespace changes — NDI control events use the default namespace

### Edge Cases & Risks (ndi-lifecycle-control specific)

| Risk | Likelihood | Mitigation |
|---|---|---|
| `deviceId` not present in `stream-started` payload | Low | Fallback to `producerId[:8]` preserves backward compatibility |
| Dashboard sends `set-ndi-control` before bridge is ready | Low | Bridge processes events after connection; best-effort queuing |
| Custom ndiName conflicts with existing NDI source name on the network | Low | NDI SDK appends ` (2)` suffix automatically — no crash |

---

## Non-Goals

The following are explicitly NOT addressed by this change:

- **NDI bridge Python code changes**: `webrtc_consumer.py` already receives correct `rtpParams` and adapts to whatever spatial layer the server sends. No code changes needed.
- **Sender-controlled single-stream approach** (Approach C from exploration): Deferred — not needed given the spatialLayer fix resolves the quality gap.
- **AV1 or VP9 codec tuning**: Current H.264 focus is sufficient. No encoder config changes for VP8/VP9.
- **Prometheus/Grafana integration**: Stats stay in Socket.io events for the dashboard only. External monitoring is future work.
- **Persistent user preferences**: The default preset change applies to all users; no per-device preference storage is implemented.
- **Transcoding**: The SFU remains a pure forwarder. No server-side transcoding is introduced.

## Edge Cases & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Higher NDI bridge bandwidth (200 Kbps → ~1–2 Mbps per stream on LAN) | High | LAN networks handle this trivially. If bridge is remote/WAN, monitor and consider reverting. Each change is independently revertible. |
| iOS thermal throttling at 1080p@30fps | Medium | Keep Medium/Ultra presets available. Default is conservative (1080p@30fps, not 4K). User can downgrade. |
| H.264 High Profile incompatibility with some browser decoders | Low | Baseline profile remains first codec entry. Client negotiates its preferred profile. Fully backward compatible. |
| `maxIncomingBitrate` increase could cause congestion on shared uplinks | Low | Applies to producer→SFU direction (device→server). Device's own encoder rate control is the primary limiter, not the mediasoup ceiling. |
| No existing automated tests | Medium | Manual E2E verification: check NDI output resolution, dashboard stats, stream stability before merging each commit. |
| Producer `getStats()` call timing — producer may be gone between `getActiveStreams()` and `getStats()` | Medium | Try/catch around each `getStats()` call; skip gracefully on error; emit last known values on failure. |
| Frontend `StreamStats` type mismatch — real stats structure may differ from mocked structure | Medium | Keep backward-compatible payload. Add any new fields as optional (`rtt?`). Verify frontend renders correctly. |
