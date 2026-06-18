# Proposal: Stream Quality Control

## Intent

iOS Safari's adaptive bitrate constantly switches between 904x508 ↔ 640x360, making VJ with stable resolutions impossible. Solution: switch iPhone to 3-layer simulcast with power-of-2 scaling, then let the operator pick the layer per stream from the dashboard — server propagates the choice to ALL consumers (browser + NDI) at once.

## Scope

### In Scope
1. iPhone producer: single H.264 encoding → 3-layer simulcast (1080p/540p/270p)
2. Server `set-stream-quality` event: receives `{producerId, spatialLayer}`, iterates all consumers, calls `setPreferredLayers`
3. Dashboard UI: quality selector (Low/Medium/High) in StreamControls + quality badge on StreamCard
4. Browser consumer: immediate visual feedback via local `setPreferredLayers({ spatialLayer, temporalLayer })`
5. NDI bridge consumers: auto-updated server-side (no Python changes)

### Out of Scope
- Python NDI bridge changes — server handles layer switching
- ffmpeg/hardware encoding changes — pure mediasoup/WebRTC
- Persistent quality preferences across sessions — future work
- SVC encoding — simulcast only for this change

## Capabilities

### New Capabilities
- `stream-quality-control`: Multi-layer simulcast producer + per-stream operator quality selection

### Modified Capabilities
- `stream-pipeline`: Extends simulcast architecture from spatial layer fix to full multi-layer producer and dynamic quality switching

## Approach

### Architecture

```
┌─────────────────┐     ┌──────────────────────────────────┐     ┌────────────────┐
│  iPhone Safari  │     │      Mediasoup Router (SFU)       │     │   Dashboard    │
│  (Producer)     │     │                                  │     │   (Consumer)   │
│                 │     │  ┌──────────┐  ┌──────────────┐  │     │                │
│  3 encodings:   │────▶│  │ Producer │  │  Consumers[]  │  │◀───│  Quality       │
│  Layer 0: 270p  │     │  │  ID: P1  │  │  C1 (browser) │  │     │  Selector      │
│  Layer 1: 540p  │     │  │          │  │  C2 (browser) │  │     │  (Low/Med/High)│
│  Layer 2: 1080p │     │  └──────────┘  │  C3 (NDI)     │  │     │                │
│                 │     │                 └──────┬───────┘  │     └────────────────┘
└─────────────────┘     │                        │         │
                        │  set-stream-quality    │         │
                        │  ─────────────────────▶│         │
                        │  iterates ALL consumers│         │
                        │  for producerId and    │         │
                        │  calls setPreferredLayers         │
                        └────────────────────────┴─────────┘
```

### Layer Configuration
| Layer | Spatial | Scale | Resolution | Bitrate | UI Label |
|-------|---------|-------|------------|---------|----------|
| 0 | 0 | 4 | 480×270 | 200 Kbps | Low |
| 1 | 1 | 2 | 960×540 | 500 Kbps | Medium |
| 2 | 2 | 1 | 1920×1080 | 4 Mbps | High |

### Flow
1. iPhone starts 3 simulcast encodings with power-of-2 scaling
2. Operator clicks Low/Medium/High on StreamControls
3. Dashboard socket emits `set-stream-quality { producerId, spatialLayer }`
4. Server finds ALL consumers for that producerId, calls `consumer.setPreferredLayers({ spatialLayer, temporalLayer: 0 })` on each
5. Browser consumers react immediately; NDI bridge consumers get updated RTP without renegotiation

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/lib/webrtc-client.ts` | Modified | Single encoding → 3 simulcast encodings with `scaleResolutionDownBy: [4,2,1]` |
| `backend/src/server.ts` | Modified | Add `set-stream-quality` socket event handler |
| `backend/src/mediasoup/router.ts` | Modified | Add `getConsumersByProducerId()` method |
| `frontend/src/lib/dashboard-service.ts` | Modified | Add `setStreamQuality()` + `onStreamQualityChange` event |
| `frontend/src/store/dashboard-store.ts` | Modified | Add `setStreamQuality` action, quality state per stream |
| `frontend/src/types/dashboard.ts` | Modified | Add `StreamQuality` type, quality field to `StreamInfo` |
| `frontend/src/components/dashboard/StreamControls.tsx` | Modified | Quality selector dropdown/buttons (Low/Medium/High) |
| `frontend/src/components/dashboard/StreamCard.tsx` | Modified | Quality badge overlay showing current layer |
| `frontend/src/lib/webrtc-consumer.ts` | Modified | Expose `setQuality(spatialLayer)` public method |
| `shared/types.ts` (if exists) | Modified | Shared quality type |

## Implementation Order

1. **Producer**: iPhone simulcast layers in `webrtc-client.ts`
2. **Server handler**: `set-stream-quality` event + consumer iteration in `server.ts`
3. **Router**: `getConsumersByProducerId()` in `router.ts`
4. **Service**: Dashboard service quality event in `dashboard-service.ts`
5. **Store**: Quality state + actions in `dashboard-store.ts`
6. **Types**: `StreamQuality` type in `dashboard.ts`
7. **Consumer**: `setQuality()` method in `webrtc-consumer.ts`
8. **UI**: Quality selector in `StreamControls.tsx`
9. **UI**: Quality badge in `StreamCard.tsx`

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| iOS Safari simulcast not supported (current belief it isn't) | Medium | Fallback: single encoding with `degradationPreference: 'maintain-resolution'` |
| Existing connections interrupted by producer encoding change | Medium | New producers only — existing single-encoding streams unaffected |
| 4 Mbps layer exceeds device uplink | Low | Device encoder adapts; server still has 10 Mbps `maxIncomingBitrate` cap as ceiling |
| NDI bridge receiving unexpected simulcast layers | Low | Server always calls `setPreferredLayers` explicitly — no ambiguity |

## Rollback Plan

| Layer | Rollback |
|-------|----------|
| Producer | Revert to single encoding, `maintain-resolution` fallback |
| Server handler | Revert `set-stream-quality` event + consumer iteration |
| Dashboard UI | Revert quality selector and badge components |
| Consumer | Revert `setQuality()` method in consumer |

Each change is an independently revertible commit. No data migration needed.

## Dependencies

- **iOS Safari simulcast support** — need to verify. If iOS 17+ doesn't support simulcast on Safari, the entire approach fails and we fall back to `maintain-resolution`.
- **Ordering**: Producer (1) must be deployed BEFORE any UI/consumer changes work — consumers won't have layers to switch between without it.

## Success Criteria

- [ ] iPhone publishes 3 simulcast layers at configured bitrates/resolutions
- [ ] Dashboard shows quality selector per stream, defaulting to High
- [ ] Switching to Low shows immediate lower-resolution video on all consumers
- [ ] Switching to High shows immediate full-resolution video on all consumers
- [ ] NDI bridge output resolution matches the selected quality layer
- [ ] No regression on non-iOS browsers (desktop Chrome/Firefox)
- [ ] All changes independently revertible
