# Tasks: Stream Quality Control

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~170-200 across 9 files |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full implementation (9 files) | PR 1 | Single PR — under 200 lines, no split needed |

## Phase 1: Core Infrastructure (Backend + Producer)

- [x] 1.1 `backend/src/mediasoup/router.ts` — Add `getConsumersByProducerId(producerId: string)` that iterates private `consumers` Map and filters by `consumer.producerId`; returns empty array when none found
- [x] 1.2 `frontend/src/lib/webrtc-client.ts` — Replace single encoding in `startStream()` with 3-layer simulcast array (`scaleResolutionDownBy: [4, 2, 1]`, `maxBitrate: [200000, 500000, 4000000]`); add iOS Safari UA detection fallback to single `maintain-resolution` encoding
- [x] 1.3 `backend/src/server.ts` — Add `set-stream-quality` socket handler (after `disconnect-stream` ~L525): receives `{ producerId, spatialLayer }`, calls `mediasoupRouter.getConsumersByProducerId()`, iterates with try/catch per consumer calling `setPreferredLayers({ spatialLayer })`, returns `{ success: true, consumersUpdated: N }`; handle missing params error and zero-consumers gracefully

## Phase 2: Frontend Plumbing (Types/Service/Store)

- [x] 2.1 `frontend/src/types/dashboard.ts` — Add `SpatialLayer`, `QualityLabel`, `StreamQuality` types and optional `quality?: StreamQuality` field to `StreamInfo`
- [x] 2.2 `frontend/src/lib/dashboard-service.ts` — Add `setStreamQuality(producerId, spatialLayer)` that emits `set-stream-quality` via socket; add `onStreamQualityChanged` callback; register `stream-quality-changed` socket listener in `setupSocketHandlers()`
- [x] 2.3 `frontend/src/store/dashboard-store.ts` — Add `setStreamQuality(producerId, spatialLayer)` action that updates stream's quality field in store and calls `DashboardService.setStreamQuality()`; wire `onStreamQualityChanged` callback in `initializeService()`

## Phase 3: Dashboard UI Components

- [x] 3.1 `frontend/src/components/dashboard/StreamControls.tsx` — Add 3 quality selector segmented buttons (Low/Medium/High) below stream info; highlight active quality; call `useDashboardStore.setStreamQuality` on click; skip if re-selecting current quality; import `SpatialLayer` from types
- [x] 3.2 `frontend/src/components/dashboard/StreamCard.tsx` — Add quality badge overlay (top-right of preview area, above duration) showing current quality label from `stream.quality`; default to "High" if undefined

## Phase 4: Browser Consumer Method

- [x] 4.1 `frontend/src/lib/webrtc-consumer.ts` — Add `setSpatialLayer(layer: number): Promise<void>` method that checks `this.consumer.type !== 'simulcast'` as early return (silent no-op), then calls `this.consumer.setPreferredLayers({ spatialLayer: layer, temporalLayer: 0 })` with try/catch; log errors without throwing
