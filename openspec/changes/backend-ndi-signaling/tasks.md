# Tasks: Backend PlainTransport Signaling for NDI

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 470-520 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation) → PR 2 (core + tests) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Router events + Config foundation | PR 1 | Base: `feature/auto-ip-ndi-integration`. ~35 lines, independently reviewable. |
| 2 | NdiSignaling + Integration + Tests | PR 2 | Base: PR 1 branch. ~435-485 lines. Contains all new logic. |

## Phase 1: Foundation — Router Events & Config

- [x] 1.1 `config.ts`: Add `plainTransport` section with `listenIp` (from `getAnnouncedIp()`), `portRange { min, max }` defaulting to 20000-21000, overridable via `PLAIN_TRANSPORT_PORT_RANGE_START` / `PLAIN_TRANSPORT_PORT_RANGE_END`
- [x] 1.2 `config.ts`: Expand worker `rtcMinPort` to 20000, `rtcMaxPort` to 21000
- [x] 1.3 `router.ts`: `MediasoupRouter extends EventEmitter` — emit `new-producer` after `this.producers.set()` in `createProducer()`
- [x] 1.4 `router.ts`: Emit `producer-closed` before `this.producers.delete()` in `handleProducerClosed()`
- [x] 1.5 `router.ts`: Add `getVideoProducers()` — returns producers filtered by `kind === 'video'`

## Phase 2: Core — NdiSignaling Class

- [x] 2.1 `ndiSignaling.ts`: Define `BridgeSession`, `RtpStreamInfo` interfaces; class skeleton with `io`, `router`, `bridgeSessions: Map<string, BridgeSession>`
- [x] 2.2 `ndiSignaling.ts`: `init()` — register `/ndi-bridge` namespace, subscribe to router `new-producer`/`producer-closed`
- [x] 2.3 `ndiSignaling.ts`: `handleBridgeConnect()` — call `getVideoProducers()`, create PlainTransport per producer via `createBridgePlainTransport()`, emit `active-streams`
- [x] 2.4 `ndiSignaling.ts`: `handleBridgeDisconnect()` — close each session PlainTransport, delete from map
- [x] 2.5 `ndiSignaling.ts`: `onNewProducer()` — create PlainTransport (video only), pipe producer, emit `stream-started`
- [x] 2.6 `ndiSignaling.ts`: `onProducerClosed()` — find matching transport per session, close, emit `stream-stopped`
- [x] 2.7 `ndiSignaling.ts`: `createBridgePlainTransport()` — `createPlainTransport(comedia, rtcpMux=false)`, `connect()`, `produce()`, extract codec; catch port exhaustion, emit `error` with `PORT_EXHAUSTION`

## Phase 3: Integration

- [x] 3.1 `server.ts`: Import `NdiSignaling`, instantiate in `startServer()` after router init, guard behind `mediasoupConfig.plainTransport.enabled`
- [x] 3.2 `docker-compose.yml`: Expand UDP range to `20000-21000`, add `ndi-bridge` placeholder service with `depends_on: backend`
- [x] 3.3 `.env.example`: Create with `MEDIASOUP_PLAIN_TRANSPORT_PORT_RANGE=20000-21000`

## Phase 4: Testing

- [x] 4.1 `mediasoup/__tests__/ndiSignaling.test.ts`: Mock `io.of('/ndi-bridge')` + router events; test connect emits `active-streams` (R-002)
- [x] 4.2 `ndiSignaling.test.ts`: Test `stream-started` on new video producer, skipped audio (R-003)
- [x] 4.3 `ndiSignaling.test.ts`: Test `stream-stopped` on producer close, transport cleanup (R-004)
- [x] 4.4 `ndiSignaling.test.ts`: Test disconnect cleanup closes all bridge transports (R-005)
- [x] 4.5 `ndiSignaling.test.ts`: Test multiple concurrent bridges with independent transport sets (R-006)
- [x] 4.6 `ndiSignaling.test.ts`: Test port exhaustion — catch error, emit to bridge, continue (R-008)
- [x] 4.7 `config.test.ts`: Add test for `plainTransport` section defaults and env var override (R-009)
