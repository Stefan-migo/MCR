# Delta for Stream Pipeline — Stream Quality Control

> **Domain**: stream-pipeline (modified)
> **Change**: stream-quality-control (new)
> **Spoken language**: English

---

## ADDED Requirements

### R-SQC-001: Producer simulcast encodings [sdp-exchange]

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

### R-SQC-002: Server set-stream-quality event

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

### R-SQC-003: MediasoupRouter.getConsumersByProducerId()

The `MediasoupRouter` class MUST expose `getConsumersByProducerId(producerId: string): mediasoupTypes.Consumer[]` that returns ALL consumers consuming from the given producer, across all transports.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — multiple consumers | Producer P1 has 3 consumers (2 browser + 1 NDI) | Method is called | Returns array of all 3 Consumer objects |
| Edge — no consumers | Producer P1 has zero consumers | Method is called | Returns empty array `[]` |

### R-SQC-004: Stream quality types and store

The frontend MUST define a `StreamQuality` type: `{ spatialLayer: 0 | 1 | 2; label: 'Low' | 'Medium' | 'High' }`.

`StreamInfo` in both `types/dashboard.ts` and `dashboard-service.ts` MUST include an optional `quality?: StreamQuality` field, defaulting to `{ spatialLayer: 2, label: 'High' }`.

`dashboard-store` MUST expose a `setStreamQuality(producerId: string, spatialLayer: 0 | 1 | 2)` action that:
1. Updates the stream's `quality` field in the store
2. Emits `set-stream-quality` via `DashboardService.setStreamQuality()`

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — quality update | Operator clicks Medium | `setStreamQuality("P1", 1)` is called | Store updates P1's quality to `{ spatialLayer: 1, label: "Medium" }`; socket emits `set-stream-quality` |

### R-SQC-005: Dashboard quality selector

`StreamControls` MUST render quality selector buttons Low / Medium / High. The active button MUST be visually highlighted. Clicking a different quality MUST call `setStreamQuality`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — select Medium | Current quality is High | Operator clicks "Medium" | Medium button highlights; quality switches on ALL consumers |
| Edge — re-select current | Current quality is High | Operator clicks "High" | No socket emission; state unchanged |

### R-SQC-006: Dashboard quality badge

`StreamCard` MUST display a quality badge overlay showing the current quality (Low / Medium / High) on the video preview area.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — show badge | Stream is at High quality | Card renders | Badge shows "HD" / "High" on the preview |
| Happy — quality changes | Quality switches to Low | Store updates | Badge immediately reflects "SD" / "Low" |

### R-SQC-007: Browser consumer setQuality method

`BrowserRecvConsumer` MUST expose `setQuality(spatialLayer: number)` that checks consumer type and calls `this.consumer.setPreferredLayers({ spatialLayer, temporalLayer: 0 })`.

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — switch to Low | Consumer is consuming a simulcast stream | `setQuality(0)` is called | `setPreferredLayers({ spatialLayer: 0, temporalLayer: 0 })`; video resolution drops immediately |
| Edge — non-simulcast consumer | Consumer type is `simple` | `setQuality(0)` is called | Error caught silently; no crash, no resolution change |
| Edge — consumer closed | Consumer is closed mid-call | `setPreferredLayers` throws | Error caught; no unhandled rejection |

### R-SQC-008: DashboardService quality methods

`DashboardService` MUST expose:
- `setStreamQuality(producerId: string, spatialLayer: number)` — emits `set-stream-quality` via socket
- `onStreamQualityChanged?: (data: { producerId: string; spatialLayer: number }) => void` — fires when `stream-quality-changed` is received from server

| Scenario | GIVEN | WHEN | THEN |
|---|---|---|---|
| Happy — emit quality change | Service is connected | `setStreamQuality("P1", 1)` called | Socket emits `set-stream-quality { producerId: "P1", spatialLayer: 1 }` |
| Happy — receive quality change | Server broadcasts quality update | Socket receives `stream-quality-changed` | `onStreamQualityChanged` fires with producerId and spatialLayer |

---

## MODIFIED Requirements

### Non-Goals (from stream-pipeline spec)

The following item from the existing stream-pipeline spec's **Non-Goals** section is REMOVED:

> ~~**Simulcast architecture changes**: ... No change to sender encoding configuration.~~

(Reason: this change ADDS 3-layer simulcast to the iPhone producer. Sender encoding configuration IS modified.)

The remaining non-goals in the stream-pipeline spec are unchanged.

---

## Acceptance Criteria

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

## Non-Goals

The following are explicitly NOT in scope for this change:

- **Persistent quality preferences across sessions**: Quality resets to High on reconnect. Persistence is future work.
- **SVC encoding**: Simulcast only. SVC support and toggling between modes is deferred.
- **Python NDI bridge changes**: The NDI bridge receives whatever spatial layer the server sets. No Python changes needed.
- **ffmpeg/hardware encoder changes**: Pure mediasoup/WebRTC configuration.
- **Transcoding**: The SFU remains a pure forwarder. No server-side transcoding is introduced.

## Edge Cases & Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| iOS Safari simulcast not supported | Medium | Fallback: single encoding with `degradationPreference: 'maintain-resolution'`. Detected at produce time. |
| Existing connections use single encoding | Low | New producers only. Existing single-encoding producers are unaffected — they keep their current behavior. |
| 4 Mbps layer exceeds poor uplink | Low | Device encoder adapts; server `maxIncomingBitrate` of 10 Mbps is ceiling. |
| NDI bridge receives unexpected layers | Low | Server always calls `setPreferredLayers` explicitly — no ambiguity about which layer is active. |
| Consumer setPreferredLayers fails silently | Low | Handler catches errors per-consumer and continues. Dashboard still shows the intended quality selection. |
