# Tasks: Auto IP Detection

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~430 (additions + deletions) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All changes | PR 1 | Single atomic PR. Slightly over budget — maintainer may accept size:exception. |

## Phase 1: Foundation

- [x] 1.1 Create `backend/src/utils/network.ts` — `detectLanIp()`, `getAnnouncedIp()` with module-level cache
- [x] 1.2 Update `backend/src/mediasoup/config.ts` — replace hardcoded IP chain with `getAnnouncedIp()` call

## Phase 2: Backend Wiring

- [x] 2.1 Update `backend/src/server.ts` — dynamic CORS origins from detected IP + GET /api/network-ip endpoint

## Phase 3: Frontend

- [x] 3.1 Update `frontend/src/lib/url.ts` — SSR fallback `'192.168.0.138'` → `'localhost'`
- [x] 3.2 Clean `frontend/.env.local` — remove/comment Cloudflare tunnel URLs

## Phase 4: Environment & Scripts

- [x] 4.1 Clean `backend/.env.local` — remove hardcoded IPs, keep structure as sample
- [x] 4.2 Update `start-backend.sh` — remove MEDIASOUP_ANNOUNCED_IP and CORS_ORIGIN exports
- [x] 4.3 Update `start-frontend.sh` — remove NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL exports
- [x] 4.4 Update `start_servers.bat` — add PowerShell IP detection + SSL cert regeneration + copy
- [x] 4.5 Update `start_servers.sh` — add bash IP detection + SSL cert regeneration + copy
- [x] 4.6 Update `start-all.sh` — add IP detection for certs, remove hardcoded IPs from echo
- [x] 4.7 Update `docker-compose.yml` — replace hardcoded `192.168.0.138` with `${PUBLIC_IP:-}`

## Phase 5: Setup & Cleanup

- [x] 5.1 Update `setup-local-dev.sh` — remove hardcoded IPs from generated .env.local and cert SAN
- [x] 5.2 Delete `scripts/switch-network.sh` — superseded by auto-detection

## Phase 6: Testing

- [x] 6.1 Write unit tests for `network.ts` — mock `os.networkInterfaces()`, assert IP preference + env precedence
- [x] 6.2 Write integration test for GET /api/network-ip — start server, assert valid IPv4 response
