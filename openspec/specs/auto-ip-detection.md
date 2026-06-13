# Auto IP Detection

## Purpose

Auto-detect the local LAN IPv4 address at server startup for dynamic Mediasoup ICE candidate IP and CORS origin configuration, with env-var override support. Eliminate hardcoded IPs from scripts, env files, and configs.

## Requirements

### Requirement: LAN IP Auto-Detection

The backend MUST detect the local LAN IPv4 on startup by scanning network interfaces. It MUST prefer the first non-loopback private-range IP (192.168.x.x > 10.x.x.x > 172.16-31.x.x), excluding Docker/bridge/virtual adapters. Fallback to 127.0.0.1 if no LAN IP found. Detection runs once at startup, MUST NOT be reactive.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Fresh LAN | Machine on 192.168.1.x, no env overrides | Backend starts | Detected IP is 192.168.1.x, used for announcedIp and CORS |
| Offline | Only loopback active | Backend starts | Falls back to 127.0.0.1 |
| Multiple nets | Ethernet (192.168.0.x) + VPN (10.x.x.x) | Backend starts | Prefers 192.168.0.x over 10.x.x.x |

### Requirement: Env Var Override

Precedence: MEDIASOUP_ANNOUNCED_IP > ANNOUNCED_IP > PUBLIC_IP > auto-detected. If any override is set, the system MUST skip auto-detection entirely.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Env override | MEDIASOUP_ANNOUNCED_IP=10.0.0.5 is set | Backend starts | Uses 10.0.0.5, no auto-detection runs |

### Requirement: Dynamic Mediasoup announcedIp

The mediasoup webRtcTransport listenIps MUST use the resolved IP (detected or env override) as `announcedIp` for the IPv4 listener. The current fallback chain in `backend/src/mediasoup/config.ts` MUST be replaced with a call to the detection utility.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Detection result used | Backend detects 192.168.1.50 | Transport is created | announcedIp is 192.168.1.50 |

### Requirement: Dynamic CORS Origins

Socket.io CORS origin list MUST include the resolved IP, localhost (127.0.0.1, 0.0.0.0), and any origins from the CORS_ORIGIN env var. The `.trycloudflare.com` wildcard MUST be preserved. All hardcoded IP entries in `backend/src/server.ts` MUST be replaced.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| CORS includes detected IP | Detected IP is 192.168.1.50 | Frontend connects from 192.168.1.50:3000 | CORS allows the origin |
| CORS allows cloudflare | Any cloudflare tunnel URL | Frontend connects | trycloudflare.com origin is allowed |

### Requirement: Frontend Auto-Detect

Frontend MUST derive backend host from `window.location.hostname` at runtime. During SSR, default to localhost. Hardcoded Cloudflare URLs in `frontend/.env.local` MUST be removed or cleared. The existing `src/lib/url.ts` logic is sufficient — no new detection needed.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Client-side connect | Frontend loaded on 192.168.1.50:3000 | Backend URL is resolved | Uses window.location.hostname: 192.168.1.50:3001 |
| SSR fallback | No window object (SSR) | Backend URL is resolved | Falls back to localhost |

### Requirement: Scripts Use Detection

All startup scripts (start-backend.sh, start-frontend.sh, start_servers.bat, start_servers.sh, start-all.sh, setup-local-dev.sh) MUST NOT contain hardcoded IPs in env exports or config generation. Backend scripts SHALL let the backend auto-detect. Frontend scripts SHALL let the frontend derive from window.location or env vars. setup-local-dev.sh SHALL generate configs without IP hardcoding.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Script starts backend | User runs start-backend.sh | Script exports env vars | No MEDIASOUP_ANNOUNCED_IP or CORS_ORIGIN with hardcoded IP |
| Script starts frontend | User runs start-frontend.sh | Script exports env vars | No NEXT_PUBLIC_API_URL or NEXT_PUBLIC_WS_URL with hardcoded IP |

### Requirement: SSL Cert Auto-Regeneration

start_servers.bat and start-all.sh MUST check if existing SSL certs match the current machine IP. If mismatch, MUST regenerate certs via openssl before starting services. If openssl is unavailable, MUST warn and continue (HTTPS cert warning expected).

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Certs match current IP | Certs valid for 192.168.1.50, current IP is 192.168.1.50 | Script runs | Services start without regeneration |
| Certs mismatch | Certs for 192.168.0.138, current IP is 192.168.1.50 | Script runs | Certs regenerated for 192.168.1.50, then services start |
| No openssl | openssl not installed | Script runs | Warning printed, services start with mismatched certs |

### Requirement: Docker Compose Dynamic IP

docker-compose.yml MUST use `${PUBLIC_IP}` env var substitution with a safe default (empty or auto). The hardcoded IP `192.168.0.138` MUST be removed from all service environment and build args.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Env supplied | PUBLIC_IP=10.0.0.5 is set | docker compose up runs | Services configure with 10.0.0.5 |
| No env | PUBLIC_IP is not set | docker compose up runs | Services default to empty/auto-detect |

### Requirement: Remove Obsolete Script

`scripts/switch-network.sh` MUST be deleted. It is superseded by auto-detection.

## Non-Goals

- Reactive IP changes (runtime network switching)
- NDI bridge or virtual device IP detection
- IPv6 support (IPv4 only)
- Changes to generate-certs.sh signature or behavior
