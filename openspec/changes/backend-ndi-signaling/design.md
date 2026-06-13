# Design: Backend PlainTransport Signaling for NDI

## Technical Approach

A self-contained `NdiSignaling` class registers the `/ndi-bridge` Socket.io namespace, subscribes to `MediasoupRouter` producer lifecycle events, and manages PlainTransport creation/teardown per bridge session. The namespace is fully isolated — zero overlap with the default `/` WebRTC signaling.

## Architecture Decisions

### Decision: Producer lifecycle events via EventEmitter

| Option | Tradeoff |
|--------|----------|
| **Extend MediasoupRouter with EventEmitter** ✅ | Minimal diff: 2 emit calls, 0 new deps |
| Global event bus | Overengineered for 2 events; no other consumer |
| Monkey-patch socket handlers | Brittle, couples ndiSignaling to server.ts internals |

**Choice**: `MediasoupRouter` extends `EventEmitter`, emits `new-producer(producer)` and `producer-closed(producerId)`.

### Decision: PlainTransport port range

| Option | Tradeoff |
|--------|----------|
| **Expand worker RTC range to 20000-21000** ✅ | One number change; mediasoup handles actual allocation |
| Separate worker | Resource waste, architectural complexity |
| No expansion | Port exhaustion with 2000 available (10000-12000) for 200 WebRTC transports (~200 ports) |

**Choice**: Worker `rtcMinPort: 10000` → `20000`, `rtcMaxPort: 12000` → `21000`. Add `plainTransport` config section with same range for documentation and env-var override.

### Decision: Port exhaustion — catch & report

| Option | Tradeoff |
|--------|----------|
| **Catch mediasoup error, emit to bridge, log** ✅ | Simplest; mediasoup throws on exhaustion |
| Pre-allocate PortPool tracking | Adds state, doesn't prevent exhaustion |

**Choice**: Try/catch around `createPlainTransport()`, emit `error` event with `PORT_EXHAUSTION` code, log. No PortPool — mediasoup is the authority.

### Decision: Multiple bridge isolation

| Option | Tradeoff |
|--------|----------|
| **Map<socketId, BridgeSession>** ✅ | Clean ownership, disconnect = delete |
| Shared pool + refcounts | Leak-prone, overcomplicated for 2+ bridges |

**Choice**: `Map<string, BridgeSession>` keyed by socket ID.

## Data Flow

### Bridge Connect — Stream Discovery
```
Bridge                    NdiSignaling                    MediasoupRouter
  |                           |                                |
  |-- connect /ndi-bridge --> |                                |
  |                           |-- router.getProducers() ------>|
  |                           |<-- Producer[] -----------------|
  |                           |                                |
  |                           |-- createPlainTransport() x N ->|
  |                           |<-- PlainTransport[] -----------|
  |                           |-- connect + produce() x N ---->|
  |<-- active-streams[] ------|                                |
```

### New Video Producer — Real-time
```
Device    Server.ts    MediasoupRouter    NdiSignaling    Bridge
  |           |               |                |            |
  |--produce->|               |                |            |
  |           |--createProd-->|                |            |
  |           |<--Producer ---|                |            |
  |           |               |--emit--------->|            |
  |           |               | 'new-producer' |            |
  |           |               |                |--createPT->|
  |           |               |                |--connect-->|
  |           |               |                |--produce-->|
  |           |               |                |            |
  |           |               |                |--stream--->|
  |           |               |                |  -started  |
```

### Producer Closed — Real-time
```
MediasoupRouter    NdiSignaling    Bridge
      |                 |            |
      |--emit---------->|            |
      | 'prod-closed'   |            |
      |                 |--closePT-->|
      |                 |--stream--->|
      |                 |  -stopped  |
```

### Bridge Disconnect — Cleanup
```
Bridge    NdiSignaling            MediasoupRouter
  |           |                        |
  |--disc---->|                        |
  |           |--closePT() x N ------->|
  |           |--Map.delete(socketId)->|
```

## Socket.io Event Protocol

### Server → Client (bridge push)

| Event | Payload | When |
|-------|---------|------|
| `active-streams` | `{ streams: RtpStreamInfo[] }` | On connect |
| `stream-started` | `RtpStreamInfo` | New video Producer |
| `stream-stopped` | `{ producerId: string }` | Producer closed |
| `error` | `{ message: string, code: string }` | Any server error |

```typescript
interface RtpStreamInfo {
  producerId: string;
  mimeType: string;          // "video/VP8" | "video/H264"
  clockRate: number;         // always 90000 for video
  payloadType: number;       // from producer.rtpParameters.codecs[0].payloadType
  rtpPort: number;           // transport.tuple.localPort
  rtcpPort?: number;         // transport.rtcpTuple?.localPort (null when comedia)
  ip: string;                // "127.0.0.1"
}
```

### Client → Server (bridge → backend)

None for this change. The bridge is receive-only — it connects, receives events, and consumes RTP.

## Data Structures

```typescript
interface BridgeSession {
  socketId: string;
  plainTransports: Map<string, {    // producerId → transport info
    transport: mediasoupTypes.PlainTransport;
    producerId: string;
    rtpPort: number;
    codec: {
      mimeType: string;
      clockRate: number;
      payloadType: number;
    };
  }>;
  createdAt: Date;
}
```

## Module: `backend/src/mediasoup/ndiSignaling.ts`

```typescript
class NdiSignaling {
  private io: Server;
  private router: MediasoupRouter;
  private bridgeSessions: Map<string, BridgeSession>;

  constructor(io: Server, router: MediasoupRouter);

  // Register /ndi-bridge namespace, subscribe to router events
  init(): void;
  // --- Private ---
  private handleBridgeConnect(socket: Socket): Promise<void>;
  private handleBridgeDisconnect(socket: Socket): Promise<void>;
  private onNewProducer(producer: mediasoupTypes.Producer): Promise<void>;
  private onProducerClosed(producerId: string): Promise<void>;
  private createBridgePlainTransport(
    producer: mediasoupTypes.Producer
  ): Promise<{ transport: PlainTransport; rtpPort: number; rtcpPort?: number }>;
}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/mediasoup/ndiSignaling.ts` | **Create** | `/ndi-bridge` namespace + PlainTransport lifecycle |
| `backend/src/mediasoup/router.ts` | Modify | Extend EventEmitter, emit producer events |
| `backend/src/mediasoup/config.ts` | Modify | Expand worker range to 20000-21000, add `plainTransport` section |
| `backend/src/server.ts` | Modify | Import and init NdiSignaling |
| `docker-compose.yml` | Modify | Add `ndi-bridge` service placeholder |
| `.env.example` | Create | Document `MEDIASOUP_PLAIN_TRANSPORT_PORT_RANGE` |

## MediasoupRouter Changes (router.ts)

1. `class MediasoupRouter extends EventEmitter`
2. After `this.producers.set(id, producer)` in `createProducer()`: `this.emit('new-producer', producer)`
3. In `handleProducerClosed()`, before delete: `this.emit('producer-closed', producerId)`
4. Add `getVideoProducers(): mediasoupTypes.Producer[]` — filters `.producers` by `kind === 'video'`

## PlainTransport Lifecycle

**Creation**:
```
const transport = await router.createPlainTransport({
  listenIp: { ip: '127.0.0.1' },
  rtcpMux: false,
  comedia: true
});

// Connect (comedia handles DTLS implicitly)
await transport.connect({ ip: '127.0.0.1', port: transport.tuple.localPort });
// Pipe producer into PlainTransport
await transport.produce({ producerId: producer.id });
```

**Codec extraction**: `producer.rtpParameters.codecs[0]` → `{ mimeType, clockRate, payloadType }`

**Cleanup on stream end**: Iterate all sessions, close each session's PlainTransport for that producerId.

**Cleanup on bridge disconnect**: `session.plainTransports.forEach(pt => pt.transport.close())`, then delete session.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Port exhaustion | Catch error, emit `{ code: "PORT_EXHAUSTION", message }` to bridge, log error |
| Transport creation fails | Emit `error` to bridge, skip that producer, continue with others |
| Producer gone before PlainTransport created | Check `router.getProducer(id)` still exists; skip if null |
| Producer closes before PT connect | `transport.produce()` throws → close transport, no event |
| Bridge reconnects with stale session | Old session cleaned on disconnect, new session starts fresh |

## Testing Strategy

| Test | What | Approach |
|------|------|----------|
| Unit: NdiSignaling | Bridge connect/disconnect, stream started/stopped, producer events | Mock `io` + `router`, verify event emission + transport calls |
| Unit: config | Port range env var parsing | Direct config tests |
| Integration | Namespace isolation, full lifecycle against real router | Socket.io client + MediasoupRouter (mock worker) |
| E2E | Bridge connects, receives streams, producer lifecycle | In Docker with test NDI bridge |

## Migration / Rollout

No migration. Feature-flagged via the `/ndi-bridge` namespace existence — no bridge connects until Change B deploys the actual NDI service.

## Open Questions

None.
