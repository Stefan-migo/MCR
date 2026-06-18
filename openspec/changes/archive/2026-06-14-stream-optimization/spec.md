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

## Non-Goals

The following are explicitly NOT addressed by this change:

- **NDI bridge Python code changes**: `webrtc_consumer.py` already receives correct `rtpParams` and adapts to whatever spatial layer the server sends. No code changes needed.
- **Simulcast architecture changes**: The 3-layer simulcast structure is preserved. Browser consumers still adapt independently. No change to sender encoding configuration.
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
