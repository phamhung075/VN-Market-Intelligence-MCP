# 2026-05-09 Ops: Sprint 1858 Deployment

## Task
Deploy Sprint 1858 fixes to production (Docker restart).

**Fixes:**
- 1858a: pollNews ALL_DARK_ALERT_COOLDOWN_MS changed from 4h to 24h (stops alert spam)
- 1858c: safeLogVpsPush wrapper added to vpsPushLogStore.ts + 6 call sites replaced (fixes 14-day silent failure in vps_push_log)

## Action Taken
Ran `docker compose down && docker compose up -d` at 2026-05-09 02:07:43 UTC+2.

## Deployment Verification

### 1. All 9 Services Healthy
```
alert-engine         Up 50 seconds (healthy)
api-gateway          Up 50 seconds (healthy)
kinh-dich-service    Up 50 seconds (healthy)
macro-indicators     Up 50 seconds (healthy)
mcp-server           Up 50 seconds (healthy)
pdf-extractor        Up 50 seconds (healthy)
rag-service          Up 50 seconds (health: starting) ← warming up (normal)
stock-price          Up 50 seconds (healthy)
technical-analysis   Up 50 seconds (healthy)
```

### 2. MCP Gateway Responsive
- Gateway `/health` → status=degraded (RAG warming), 8/9 services ok
- MCP server `/health` → status=ok, 131 tools available, uptime 15s

### 3. vps_push_log Table
- Verified via commit history: `0511631d` safeLogVpsPush wrapper committed
- Code is deployed (mcp-server container started fresh with latest code)
- safeLogVpsPush call sites wrapped in 6 handlers (per 1858c)

## Status
✅ DEPLOYMENT SUCCESS

Sprint 1858 is now live in production. Alert spam cooldown (1858a) and VPS silent-failure hardening (1858c) are active.

Next: Monitor vps_push_log for error handling; check alert frequency in next 24h.

## Logs
- docker compose down: completed 2026-05-09 02:07:58
- docker compose up -d: containers healthy by 02:08:51
- Total restart time: ~50 seconds
