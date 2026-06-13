# Proposal: Backend PlainTransport Signaling for NDI

## Intent

Mediasoup's `createPlainTransport()` exists but is unwired from Socket.io — no external process can request RTP output. The NDI bridge needs PlainTransport RTP/UDP streams for each active Producer. This change exposes that through a dedicated `/ndi-bridge` Socket.io namespace.

## Scope

### In Scope
- New `/ndi-bridge` Socket.io namespace with isolated handler module `ndiSignaling.ts`
- Events: `active-streams` (on connect), `stream-started`, `stream-stopped`
- Auto-create PlainTransport per Producer on bridge connect
- Mediasoup config: PlainTransport `listenIp: 127.0.0.1`, UDP port range
- RTP output format documented (IP, port, codec, payload type)
- Docker Compose `ndi-bridge` service shell (placeholder for Change B)
- Cleanup: bridge disconnect → close all its PlainTransports

### Out of Scope
- NDI bridge service itself (RTP consumption, decoding, NDI SDK) — Change B
- Frontend UI for NDI status
- Authentication beyond namespace isolation

## Capabilities

### New Capabilities
- `ndi-signaling`: Socket.io `/ndi-bridge` namespace covering stream discovery and PlainTransport lifecycle

### Modified Capabilities
- None

## Approach

1. **`backend/src/mediasoup/ndiSignaling.ts`** — registers `/ndi-bridge` namespace. On bridge connect: iterates Producers, creates PlainTransport (comedia mode, rtcpMux=false), pipes Producer → PlainTransport, emits `active-streams` with `{ producerId, rtpPort, ip: '127.0.0.1', codec, payloadType }`.
2. **Real-time push**: `stream-started` on new Producer (auto PlainTransport), `stream-stopped` on Producer close (auto cleanup).
3. **Config**: add `plainTransport: { listenIp: '127.0.0.1', portRange: { min: 20000, max: 21000 } }` to `mediasoup/config.ts`.
4. **Router**: expose `createPlainTransport()` publicly if currently private.
5. **Docker**: add `ndi-bridge` service to `docker-compose.yml` with `depends_on: backend`, placeholder image/command.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/mediasoup/router.ts` | Modified | Expose `createPlainTransport()` |
| `backend/src/mediasoup/ndiSignaling.ts` | **New** | `/ndi-bridge` namespace handlers |
| `backend/src/mediasoup/config.ts` | Modified | Add plainTransport port range + listenIp |
| `backend/src/server.ts` | Modified | Wire ndiSignaling module |
| `docker-compose.yml` | Modified | Add ndi-bridge service |
| `.env.example` | Modified | Add `MEDIASOUP_PLAIN_TRANSPORT_PORT_RANGE` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Port exhaustion (bridge + many Producers) | Low | Configurable range, 1024 ports default |
| Leaked transports on bridge crash | Low | Disconnect handler tears down all bridge transports |
| Reconnect duplicates | Low | Track by producerId; replace on reconnect |

## Rollback Plan

Revert `server.ts` registration, delete `ndiSignaling.ts`, revert `config.ts` and `docker-compose.yml`. Verify main namespace WebRTC signaling unaffected.

## Dependencies

None. Works with current Mediasoup 3.x, Socket.io.

## Success Criteria

- [ ] Bridge connects → receives `active-streams` with all Producers + PlainTransport RTP info
- [ ] New Producer → `stream-started` with new PlainTransport emitted
- [ ] Producer closes → `stream-stopped` emitted, PlainTransport freed
- [ ] Bridge disconnects → all associated PlainTransports closed
- [ ] Main `/` namespace signaling unchanged (no regressions)
