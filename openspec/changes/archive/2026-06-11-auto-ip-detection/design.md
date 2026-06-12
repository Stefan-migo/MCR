# Design: Auto IP Detection

## Technical Approach

Replace all hardcoded LAN IPs across backend, frontend, scripts, and Docker config with a single `os.networkInterfaces()`-based detection utility at backend startup. The detected IP feeds into Mediasoup's `announcedIp`, CORS origin lists, and the frontend's runtime backend URL (derived from `window.location.hostname`). Scripts gain IP-awareness for SSL cert regeneration without embedding IPs.

## Architecture Decisions

### Decision: Module-level cached detection

**Choice**: Singleton-style module export — `detectLanIp()` runs once, cached in module scope.
**Alternatives considered**: Config service with DI, runtime env file generation.
**Rationale**: Mediasoup config and server.ts both need the IP at import time. A module-level cache is the simplest way to share state without refactoring the existing monolithic architecture.

### Decision: Env var precedence over auto-detection

**Choice**: `MEDIASOUP_ANNOUNCED_IP > ANNOUNCED_IP > PUBLIC_IP > auto-detect`
**Alternatives considered**: Auto-detect always, override via separate flag.
**Rationale**: Docker containers cannot auto-detect their host LAN IP (they see container IP). Env var override is mandatory for containerized deployment. Keeping three levels maintains backward compat with existing configs.

### Decision: Frontend derives from `window.location`, not env

**Choice**: Use existing `window.location.hostname` in `url.ts`; remove SSR hardcoded fallback.
**Alternatives considered**: Fetch `/api/network-ip` from backend on mount.
**Rationale**: The browser already knows its own host — the backend URL is the same origin during LAN access. No extra round-trip needed. SSR fallback to `localhost` is safe because SSR runs on the same machine.

### Decision: SSL cert regeneration in scripts, not backend

**Choice**: Bash/PowerShell scripts check and regenerate certs before starting services.
**Alternatives considered**: Backend detects cert mismatch at startup and regenerates.
**Rationale**: Scripts already manage the startup lifecycle. Cert regeneration requires `openssl` CLI, not a Node dep. Keeping cert logic in scripts avoids coupling the backend to filesystem cert management.

## Data Flow

```
Backend startup (network.ts):
  getAnnouncedIp()
    │
    ├─ Env var set? ────── Use env value
    │
    └─ No env ── detectLanIp()
                   │
                   ├─ os.networkInterfaces()
                   │    filter: IPv4 + !internal + !docker/virtual
                   │    score: 192.168.x > 10.x.x > 172.16-31.x
                   │    cache result
                   │
                   └─ Nothing found ──→ '127.0.0.1'

  detected IP ──→ mediasoupConfig.webRtcTransport.listenIps[0].announcedIp
               ──→ CORS origin list builder
               ──→ GET /api/network-ip response

Script startup:
  start_servers.bat / start-all.sh
    │
    ├─ Detect LAN IP (PowerShell / ip route)
    ├─ Check SSL cert SAN matches IP
    │    ├─ Match? ──→ Skip
    │    └─ Mismatch? ──→ openssl req ... (new IP)
    ├─ Copy certs to backend/ and frontend/
    └─ Start services (no hardcoded IP env vars)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/src/utils/network.ts` | Create | `detectLanIp()`, `getAnnouncedIp()` with module-level cache |
| `backend/src/mediasoup/config.ts` | Modify | Replace hardcoded IP chain with `getAnnouncedIp()` call |
| `backend/src/server.ts` | Modify | Build CORS origins dynamically using detected IP; add `/api/network-ip` endpoint |
| `frontend/src/lib/url.ts` | Modify | SSR fallback `'192.168.0.138'` → `'localhost'` |
| `frontend/.env.local` | Modify | Remove/comment out Cloudflare URLs |
| `backend/.env.local` | Modify | Remove hardcoded IPs, keep structure |
| `start-backend.sh` | Modify | Remove `MEDIASOUP_ANNOUNCED_IP` and `CORS_ORIGIN` IP exports |
| `start-frontend.sh` | Modify | Remove `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` exports |
| `start_servers.bat` | Modify | Add PowerShell IP detection + cert regeneration |
| `start_servers.sh` | Modify | Add bash IP detection + cert regeneration |
| `start-all.sh` | Modify | Add IP detection + cert regeneration |
| `docker-compose.yml` | Modify | Replace `192.168.0.138` defaults with `${PUBLIC_IP:-}` |
| `setup-local-dev.sh` | Modify | Remove hardcoded IPs from `.env.local` generation |
| `scripts/switch-network.sh` | Delete | Superseded by auto-detection |

## Interfaces / Contracts

```typescript
// backend/src/utils/network.ts

/**
 * Detects the best LAN IPv4 address by scanning network interfaces.
 * Runs once — result cached at module level.
 * Never throws. Returns '127.0.0.1' on failure.
 */
export function detectLanIp(): string;

/**
 * Returns announced IP with env var precedence:
 *   MEDIASOUP_ANNOUNCED_IP > ANNOUNCED_IP > PUBLIC_IP > detectLanIp()
 * Never throws.
 */
export function getAnnouncedIp(): string;

// Internal types (not exported):
interface NetworkInterface {
  name: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
}
```

```
GET /api/network-ip
Response: { ip: "192.168.1.50" }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `detectLanIp()` filtering logic | Mock `os.networkInterfaces()` with known interfaces, assert correct IP preference and Docker exclusion |
| Unit | `getAnnouncedIp()` precedence | Mock env vars at each level, assert correct value returned |
| Integration | Backend `/api/network-ip` endpoint | Start server, GET the endpoint, assert IP is valid IPv4 |
| Integration | Mediasoup config loads with detected IP | Assert `mediasoupConfig.webRtcTransport.listenIps[0].announcedIp` matches detection |
| Manual | Script cert regeneration | Run `.bat`/`.sh` on different machines, verify cert SAN matches local IP |

## Migration / Rollout

No migration required. The detection falls back to the existing IP chain when env vars are set, so existing `.env.local` overrides continue to work. Old scripts with hardcoded IPs still function (they pass env vars that take precedence over auto-detection).

Sequence:
1. Create `network.ts` (no side effects)
2. Update `mediasoup/config.ts` to use `getAnnouncedIp()`
3. Update `server.ts` CORS + new endpoint
4. Update `frontend/src/lib/url.ts` fallback
5. Clean env files (`.env.local`, `frontend/.env.local`)
6. Update scripts + Docker
7. Delete `scripts/switch-network.sh`

## Open Questions

None.
