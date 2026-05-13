# Architecture Brief — VPS Data Flow Restoration
**Date:** 2026-05-13
**Author:** architect
**Trigger:** ops-vps-fetch bootstrap audit 2026-05-13T04:49Z revealed 3 broken VPS→main-server paths.

---

## 1. Push Contract SSOT

### Confirmed Contract (from code)

| Endpoint | Method | Auth header | Handler | Status |
|----------|--------|-------------|---------|--------|
| `/api/push-prices` | POST | `X-API-Key: $VPS_PUSH_API_KEY` | `pushPricesHandler.ts` | route registered in `server.ts:317` |
| `/api/push-news` | POST | `X-API-Key: $VPS_PUSH_API_KEY` | `pushNewsHandler.ts` | route registered in `server.ts:387` |
| `/api/push-foreign-flow` | POST | `X-API-Key: $VPS_PUSH_API_KEY` | `pushForeignFlowHandler.ts` | route registered in `server.ts:323` |
| `/api/watchlist` | GET | `X-API-Key: $VPS_PUSH_API_KEY` | inline in `server.ts:345` | healthy (sbv-rates push confirmed working) |

Both handlers accept either `X-API-Key: <value>` or `Authorization: Bearer <value>`. The VPS scripts send `X-API-Key`. No drift in header name.

### Root Cause — Problem A (prices, 38 failures)

The log message `FAIL: cannot reach MCP server` comes from `fetch-prices.sh` **line 39**, which is the **WATCHLIST pre-fetch** (`GET /api/watchlist`), not the push step. The script aborts at Step 1 before any push. This means either:
- The `__MCP_BASE__` token was not substituted correctly when the script was last deployed (i.e., the script on the VPS still contains the literal string `__MCP_BASE__`), OR
- `https://zenmidi.com` is unreachable from the VPS at that moment (network/DNS/Cloudflare tunnel down), OR
- `VPS_PUSH_API_KEY` rotated on main server but VPS was not redeployed.

The push endpoint itself (`/api/push-prices`) is correctly registered and functional. The news push (Problem B) is a different failure mode.

### Root Cause — Problem B (news, 404)

`fetch-vn-news.sh` reaches the push step (it does not do a watchlist pre-fetch). The HTTP 404 indicates the request is reaching the server but no route matches. Two candidate causes:
1. `__MCP_BASE__` resolves to `https://zenmidi.com` but the Cloudflare tunnel routes `/api/*` path differently than expected — specifically, the api-gateway reverse proxy at `/api/*` uses `noProbe: true` (verbatim path forwarding) per `apps/api-gateway/src/interface/handlers.ts:62`. If the `api` service alias is not registered or its `baseUrl` is wrong, gateway returns 404.
2. The script on the VPS contains the un-substituted literal `__MCP_BASE__/api/push-news` and hits a DNS failure (empty response) not a 404 — but the log says `http=404`, confirming the request DID reach a server. This points to a routing layer issue, not a connectivity issue.

**Key distinction:** prices fail BEFORE push (watchlist 404/empty). News fail AT push (push 404). Two different layers.

### Canonical Push Contract Going Forward

```
VPS scripts push to:  https://zenmidi.com/api/<endpoint>
Auth:                 X-API-Key: <VPS_PUSH_API_KEY>
Payload:              Content-Type: application/json, raw array body
Substitute via:       deploy-vinahost.sh sed tokens __MCP_BASE__ / __API_KEY__
```

Handler files:
- `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/pushNewsHandler.ts`
- `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts`
- Route registration: `apps/mcp-server/src/interface/mcp/server.ts` lines 317, 323, 387
- Deploy token substitution: `apps/mcp-server/deploy-vinahost.sh` (MCP_BASE hardcoded to `https://zenmidi.com`)

---

## 2. BCTC Fix Strategy

### HNX/UPCOM path — NOT broken

Per triage at `docs/vps-sources/hsx-bctc/triage.md`: the `NextPageTinCPNY_CBTCPH` endpoint is working correctly when called with `pAction=1` + `pNhomTin="'FIN_REPORT'"`. The `discover-bctc-urls-browser.py` function `_discover_hnx_upcom()` already has the correct parameters. The "returns homepage" symptom was caused by a minimal-params probe in the recon script, not in the actual discovery function.

**Action:** ops verifies the HNX path by running `python3 /root/discover-bctc-urls-browser.py NVB 2026 Q1` on VPS. If it returns Q1/2026 URLs, no code change is needed for HNX.

### HOSE/SSC path — two-track fix

**Track 1 (immediate, ops, ~30 min):** Raise `TasksMax=512` and `MemoryMax=512M` in `/etc/systemd/system/vn-bctc-fetch.service` on the VPS. This unblocks existing Playwright for HOSE tickers immediately. Risk: ~1 GB VPS RAM is tight — monitor OOM. This is temporary.

**Track 2 (durable, ~4–8 h dev):** Reverse-engineer `hsx.vn` StockDocuments SPA XHR API via browser DevTools / mitmproxy. If the underlying JSON API is callable without a browser, implement a `requests`-based scraper. This eliminates Playwright from the VPS permanently. Owner: `dev-vps-crawls`.

**SSC Oracle ADF path** (optional, medium risk): Research `congbothongtin.ssc.gov.vn` ADF PPR endpoint. ADF state tokens (`_afrLoop`, `_adf.ctrl-state`) are session-bound and fragile. Attempt only if `hsx.vn` XHR path covers all HOSE tickers in the watchlist.

**Playwright migration to main server is NOT recommended** at this time. The `dev-mainserver-crawls` agent permits headless browsers but the HOSE PDF domain (`hsx.vn`) is accessible from the VPS without geo-block concerns. Migrating adds Docker memory budget overhead on main server. Revisit only if Track 2 fails.

---

## 3. Task Split

| Task | Agent | Layer | Description |
|------|-------|-------|-------------|
| TASK-PUSH-1 | `dev-mcp-server` | infra / interface | Diagnose why VPS watchlist GET fails (connectivity vs key rotation vs un-substituted token). Check live VPS script for literal `__MCP_BASE__`. If key drifted, rotate + redeploy. |
| TASK-PUSH-2 | `dev-mcp-server` | interface | Diagnose push-news 404: check api-gateway `api` service registry (`noProbe`, `baseUrl`). Confirm Cloudflare tunnel routes `/api/push-news` to mcp-server correctly. Add integration smoke test. |
| TASK-BCTC-1 | `ops` | infra (VPS systemd) | Raise `TasksMax=512` + `MemoryMax=512M` in `vn-bctc-fetch.service`. Reload systemd. Monitor RAM. |
| TASK-BCTC-2 | `dev-vps-crawls` | infra (VPS scraper) | Verify HNX path: run `discover-bctc-urls-browser.py NVB 2026 Q1` on VPS — confirm Q1/2026 returns. Fix calling convention if needed. |
| TASK-BCTC-3 | `dev-vps-crawls` | infra (VPS scraper) | Reverse-engineer `hsx.vn` SPA XHR API. Implement no-browser HOSE BCTC scraper in `vps-scripts/`. Replace Playwright for HOSE path. |
| TASK-BCTC-4 (optional) | `dev-vps-crawls` | infra (VPS scraper) | Research SSC Oracle ADF PPR no-browser path. File separate task if feasible after TASK-BCTC-3. |

**`dev-mainserver-crawls` has no tasks here.** HOSE BCTC stays on VPS (geo-accessible). Playwright migration to main server is deferred unless Track 2 fails after validation.

---

## 4. Risk Flags

| Risk | Severity | Mitigation |
|------|----------|------------|
| VPS_PUSH_API_KEY may have rotated without VPS redeploy — all 9 services broken, not just prices | HIGH | TASK-PUSH-1 must check live `/root/fetch-prices.sh` on VPS for literal `__MCP_BASE__` and verify key matches `Bun.env.VPS_PUSH_API_KEY` on main server |
| News push 404 may be Cloudflare/api-gateway routing regression, not an mcp-server code bug | HIGH | TASK-PUSH-2 must test `curl -X POST https://zenmidi.com/api/push-news` from VPS with valid key before touching code |
| TasksMax=512 on ~1 GB VPS may OOM other services | MEDIUM | Monitor `/var/log/syslog` for OOM kills after TASK-BCTC-1. Revert if any service OOM-kills |
| HNX path may appear fixed by triage but `fetch-bctc.sh` may call `discover-bctc-urls-browser.py` with wrong args | MEDIUM | TASK-BCTC-2 validates the exact invocation used by the systemd service, not just the function |
| Foreign flow data (embedded in prices payload) is also blocked by Problem A | MEDIUM | Resolved automatically when TASK-PUSH-1 restores prices push |
| sbv-rates push is confirmed working — use it as a reference for validating auth header format when debugging TASK-PUSH-1 | INFO | Compare `/root/fetch-sbv.sh` auth header against prices/news scripts |

---

## 5. Files Index

```
VPS-side scripts (template originals, substituted on deploy):
  vps-scripts/fetch-prices.sh           — prices + foreign-flow + global indices
  vps-scripts/fetch-vn-news.sh          — 14 RSS feeds
  vps-scripts/fetch-bctc.sh             — BCTC PDF queue
  vps-scripts/discover-bctc-urls-browser.py — HNX AJAX + SSC Playwright discovery

Deploy:
  apps/mcp-server/deploy-vinahost.sh    — token substitution + SSH deploy

Main server handlers:
  apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts
  apps/mcp-server/src/interface/mcp/routes/pushNewsHandler.ts
  apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts
  apps/mcp-server/src/interface/mcp/server.ts  (route registration lines 317, 323, 387)

Diagnostic:
  docs/vps-sources/vps-prices/recon.md
  docs/vps-sources/vn-news-rss/recon.md
  docs/vps-sources/hsx-bctc/recon.md
  docs/vps-sources/hsx-bctc/triage.md
  docs/agent-memory/notebooks/ops-vps-fetch.md
  docs/agent-memory/notebooks/dev-vps-crawls.md
```
