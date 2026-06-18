# Design: Stream Quality Control

## Technical Approach

Replace iPhone's single-encoding video producer with 3-layer simulcast (1080p/540p/270p), then expose quality selection in the dashboard. When the operator picks Low/Medium/High, the server iterates ALL consumers for that producer (browser + NDI) and calls `setPreferredLayers` on each. No transcoding — the SFU stays a pure forwarder.

---

## Architecture Decisions

### Decision: Simulcast fallback strategy
| Option | Tradeoff | Decision |
|--------|----------|----------|
| UA detection pre-flight | Reliable, simple; misses future iOS versions that add simulcast | **Chosen for v1** — detect iOS Safari via `navigator.userAgent`; fall back to single encoding with `degradationPreference: 'maintain-resolution'` |
| Try produce + detect layers | Dynamic, no UA sniffing; requires producer `layerschange` event + re-produce complexity | Deferred — revisit when iOS adds simulcast support |

### Decision: Access consumers by producerId
| Option | Tradeoff | Decision |
|--------|----------|----------|
| Expose consumers map as public | Breaks encapsulation; callers could mutate | Rejected |
| `getConsumersByProducerId()` | Clean API; caller gets a snapshot | **Chosen** — iterates private `consumers` map and filters by `consumer.producerId` |

### Decision: Error isolation per consumer
| Option | Tradeoff | Decision |
|--------|----------|----------|
| `Promise.allSettled` | Clean parallel, but consumer iteration is sync | Rejected — `setPreferredLayers` is async but each is independent |
| `for...of` with try/catch per consumer | Simple, explicit error logging per consumer | **Chosen** — logs failed consumer ID without blocking others |

### Decision: Quality type mapping
| UI Label | spatialLayer | scaleResolutionDownBy | maxBitrate |
|----------|-------------|----------------------|------------|
| Low | 0 | 4.0 | 200 Kbps |
| Medium | 1 | 2.0 | 500 Kbps |
| High | 2 | 1.0 | 4 Mbps |

---

## Data Flow

```
Dashboard Operator
       │
       ▼
StreamControls (click Medium)
       │
       ▼
useDashboardStore.setStreamQuality("P1", 1)
       │
       ├──► Store: stream.quality = { spatialLayer: 1, label: "Medium" }
       │
       ▼
DashboardService.setStreamQuality("P1", 1)
       │
       ▼
socket.emit("set-stream-quality", { producerId: "P1", spatialLayer: 1 })
       │
       ▼
server.ts io.on("set-stream-quality")
       │
       ▼
mediasoupRouter.getConsumersByProducerId("P1")
       │
       ▼
for each consumer:
  try {
    consumer.setPreferredLayers({ spatialLayer: 1 })
  } catch (e) {
    log("Consumer ${id} failed: ${e}")
  }
       │
       ▼
io.emit("stream-quality-changed", { producerId: "P1", spatialLayer: 1 })
       │
       ▼
DashboardService.onStreamQualityChanged
       │
       ▼
useDashboardStore → update stream quality in store
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/lib/webrtc-client.ts` | Modify | Replace 1 encoding with 3-layer simulcast; add iOS UA fallback |
| `backend/src/mediasoup/router.ts` | Modify | Add `getConsumersByProducerId()` method |
| `backend/src/server.ts` | Modify | Add `set-stream-quality` socket handler with broadcast |
| `frontend/src/types/dashboard.ts` | Modify | Add `StreamQuality` type, `quality` field to `StreamInfo` |
| `frontend/src/lib/dashboard-service.ts` | Modify | Add `setStreamQuality()` and `onStreamQualityChanged` |
| `frontend/src/store/dashboard-store.ts` | Modify | Add quality state per stream + `setStreamQuality` action |
| `frontend/src/components/dashboard/StreamControls.tsx` | Modify | Add quality selector (3 segmented buttons) |
| `frontend/src/components/dashboard/StreamCard.tsx` | Modify | Add quality badge overlay |
| `frontend/src/lib/webrtc-consumer.ts` | Modify | Add `setSpatialLayer(layer)` method |
| `backend/src/mediasoup/ndiSignaling.ts` | Verify | Existing `setPreferredLayers` call works with new layer values — no change needed |

---

## Interfaces / Contracts

```typescript
// types/dashboard.ts — NEW types
export type SpatialLayer = 0 | 1 | 2;
export type QualityLabel = 'Low' | 'Medium' | 'High';
export interface StreamQuality {
  spatialLayer: SpatialLayer;
  label: QualityLabel;
}

// StreamInfo — ADDED field
export interface StreamInfo {
  // ...existing fields
  quality?: StreamQuality;  // NEW — defaults to { spatialLayer: 2, label: 'High' }
}

// dashboard-store.ts — NEW action
interface DashboardStore {
  // ...existing state
  setStreamQuality: (producerId: string, spatialLayer: SpatialLayer) => void;
}

// dashboard-service.ts — NEW methods
export class DashboardService {
  setStreamQuality(producerId: string, spatialLayer: number): void;
  onStreamQualityChanged?: (data: { producerId: string; spatialLayer: number }) => void;
}

// webrtc-consumer.ts — NEW method
export class BrowserRecvConsumer {
  setSpatialLayer(layer: number): Promise<void>;  // wraps consumer.setPreferredLayers
}

// MediasoupRouter — NEW method
export class MediasoupRouter {
  getConsumersByProducerId(producerId: string): mediasoupTypes.Consumer[];
}

// webrtc-client.ts — NEW simulcast encodings
encodings: [
  { scaleResolutionDownBy: 4, maxBitrate: 200000, degradationPreference: 'maintain-resolution' },
  { scaleResolutionDownBy: 2, maxBitrate: 500000, degradationPreference: 'maintain-resolution' },
  { scaleResolutionDownBy: 1, maxBitrate: 4000000, degradationPreference: 'maintain-resolution' },
]

// Socket event contracts
// Client → Server: set-stream-quality { producerId: string, spatialLayer: 0|1|2 }
// Server → Client: stream-quality-changed { producerId: string, spatialLayer: 0|1|2 }
```

---

## Implementation Order

### Phase 1: Core (backend + producer)
1. `router.ts` — add `getConsumersByProducerId()`
2. `webrtc-client.ts` — switch to 3 simulcast encodings + iOS fallback
3. `server.ts` — add `set-stream-quality` handler

### Phase 2: Frontend plumbing
4. `types/dashboard.ts` — add `StreamQuality` and fields
5. `dashboard-service.ts` — add quality methods + callback
6. `dashboard-store.ts` — add quality state + action

### Phase 3: UI
7. `StreamCard.tsx` — add quality badge
8. `StreamControls.tsx` — add quality selector

### Phase 4: Consumer
9. `webrtc-consumer.ts` — add `setSpatialLayer()` method
10. Verify `ndiSignaling.ts` — no changes needed

---

## iOS Fallback

If iOS Safari cannot activate multiple simulcast layers, the code detects it via `navigator.userAgent` matching iOS Safari pattern and falls back to a single encoding:

```typescript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && 
              !(window as any).MSStream;

const encodings = isIOS
  ? [{ maxBitrate: 10000000, scaleResolutionDownBy: 1, degradationPreference: 'maintain-resolution' }]
  : [/* 3 simulcast layers */];
```

**Revert plan**: Revert to a single `maintain-resolution` encoding:
1. Remove the 2 additional encodings from the array
2. Revert to the current single-encoding config
3. No server, store, or UI changes needed — the quality selector remains but only High has effect

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| E2E | iPhone publishes 3 layers visible in mediasoup | Observe producer stats via `/api/streams` — 3 simulcast layers should appear |
| E2E | Quality switch changes consumer resolution | Open dashboard, switch Low/Medium/High, observe video resolution change on all browser consumers |
| E2E | NDI output matches selected layer | Verify NDI bridge output resolution changes when quality is switched |
| E2E | iOS fallback | Run on iOS Safari, verify single encoding with `maintain-resolution` |
| E2E | Desktop regression | Chrome/Firefox produces 3 layers, switching works normally |
| Manual | Error isolation | Stop a consumer mid-switch, verify other consumers still update |
| Manual | Non-simulcast consumer | Verify simple-type consumers don't crash when `setPreferredLayers` is called |

---

## Migration / Rollout

No migration required. Existing streams continue with their current single encoding — only new producers use 3-layer simulcast. The `set-stream-quality` handler works on any producer regardless of encoding type (simulcast layers are simply ignored for single-encoding producers).

Each file change is independently revertible with no cascade.

---

## Open Questions

- [ ] Verify iOS Safari's actual simulcast behavior with live test — accuracy of UA detection as proxy for capability
- [ ] Confirm NDI bridge Python side doesn't need any consumer-side notification of quality changes (the consumer layer update happens server-side)
