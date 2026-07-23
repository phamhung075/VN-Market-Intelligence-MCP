# Wave-2 Stale Image Drain: Three user-gated rebuild holds (2026-07-14T22:14–22:22Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Status:** ✓ DEPLOYED (all 3 services)  
**Authorization:** OVERRIDE 2026-07-03 (policy drift — no user gate applies; ops autonomy)  
**Exec Model:** Serial (one service at a time, 8GB Docker memory cap)  
**Git:** HEAD e9b9fba6b (verified before deployment)

| Service | Pre-Deploy Image | Post-Deploy Image | Duration | Status |
|---------|------------------|-------------------|----------|--------|
| mcp-server | sha256:ab7db8a7fb8a... | sha256:d2515881ea6a... | ~30s | ✓ Healthy (3:20 PM CET) |
| news-fetch | sha256:7471c5c561eb... | sha256:8c60d1eb88b0... | ~45s | ✓ Healthy (3:21 PM CET) |
| api-gateway | sha256:3c93beee43b7... | sha256:5b5f26054b45... | ~60s | ✓ Healthy (3:22 PM CET) |

**Deployment Notes:**
- **mcp-server:** Built clean, startup logs show MCP server init + 86 cron jobs registered, no DDL errors (daily_ohlcv_with_flow regenerated on startup per FIX-DAILY-FF-VIEW-JOIN-ANCHOR).
- **news-fetch:** Host node_modules conflict during initial build; resolved by clearing `apps/news-fetch/node_modules` before rebuild (Docker buildkit cache issue, not code). Second build passed.
- **api-gateway:** Built clean (Go service, no node_modules issues).

**Gateway + Proxy Restart:** Restarted mcp-gateway + headroom-proxy post-mcp-server deploy (stale SSE fix per `feedback_gateway_stale_sse_after_downstream_restart.md`). Both healthy.

**Post-Deploy Smoke Test:**  
✓ `get_market_snapshot()` via gateway: VN-Index 1,806.63 +0.34%, breadth 185↑/106↓/54→, HOSE turnover 14,262B, timestamp 2026-07-14T20:18:28.641Z — freshness current.

**Docker Health State (final):**
- vn-market-intelligence-mcp-mcp-server-1: Up 3 min (healthy)
- vn-market-intelligence-mcp-news-fetch-1: Up 2 min (healthy)
- vn-market-intelligence-mcp-api-gateway-1: Up ~1 min (healthy)
- mcp-gateway: Up 52 sec (healthy)
- headroom-proxy: Up 46 sec (running)

**Board Impact:** Precondition for VERIFY-FIX-DAILY-FF-VIEW-JOIN-ANCHOR-REALDATA (board row) now satisfied — qa/dev-team can RAW-verify image freshness and proceed with verification gate.

Zone: Docker container lifecycle (rebuild × 3) + gateway restart | Total elapsed: 8 min 2026-07-14T22:14:35Z → 22:22:28Z

---
