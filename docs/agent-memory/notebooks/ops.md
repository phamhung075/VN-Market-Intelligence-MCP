# Ops — Notebook

**Last updated:** 2026-05-12 13:35 UTC | **Sprint:** 1894a-cloudflare-tunnel-routing diagnosis

---

## Task: 1894a-cloudflare-tunnel-routing — Diagnosis COMPLETE, Escalation Sent

**Status:** AC FAIL — External route not working; escalated to architect

**Issue Summary:**
- User reported: `POST https://zenmidi.com/api/push-news` returns HTTP 404
- Locally confirmed: `POST http://localhost:3000/api/push-news` returns HTTP 401 (auth required, endpoint exists)
- Public route broken: Cloudflare tunnel not configured with `/api/*` ingress rule

**Root Cause Identified:**
1. Cloudflare tunnel (`zenmidi.com`) is dashboard-managed (not file-based)
2. Dashboard configuration only includes 2 routes:
   - `/vn-market/*` → `http://localhost:3000` ✓
   - `/gateway/*` → `http://localhost:4040` (wrong port—should be 4000)
3. **Missing:** `/api/*` → `http://localhost:3000` rule needed for VPS push endpoints

**Diagnosis Evidence:**
```
Test 1: localhost routing (works)
  curl -X POST http://localhost:3000/api/push-news \
    -H "Content-Type: application/json" -d '[]'
  → HTTP 401 Unauthorized (endpoint exists)

Test 2: public routing (broken)
  curl -X POST https://zenmidi.com/api/push-news \
    -H "Content-Type: application/json" -d '[]'
  → HTTP 404 Not Found (route missing)

Test 3: Cloudflare tunnel status (works for /vn-market)
  curl https://zenmidi.com/vn-market/health
  → HTTP 200 OK ✓

Test 4: cloudflared logs show dashboard config
  "Updated to new configuration config=\"{\\\"ingress\\\":[
    {\\\"path\\\":\\\"^/vn-market\\\",\\\"service\\\":\\\"http://localhost:3000\\\"},
    {\\\"path\\\":\\\"^/gateway\\\",\\\"service\\\":\\\"http://localhost:4040\\\"}
  ]\" version=9"
```

**Escalation Signal:**
- File: `/docs/signals/1894a-cloudflare-routing-escalation.json`
- Required action: Update Cloudflare dashboard tunnel config (outside ops permissions)
- AC after fix: `POST https://zenmidi.com/api/push-news` should return HTTP 401 (auth required), not 404

---

## Prior Context (from earlier notebook entries)

### Task 1: 1892a-ops AC-3 RE-VERIFY ✓ PASS

**Status:** AC-3 PASS — `/api/push-news` returns HTTP 200 OK locally; gateway code deployed; public tunnel routing blocked (outside ops scope)

**Summary:**
- Code change (commit f4141f63) deployed and tested locally: working ✓
- Public routing issue deferred to architect: escalation sent

---

## Monitoring Checklist

- [x] Local MCP server `/api/push-news` endpoint verified (exists, returns 401 for auth check)
- [x] Cloudflare tunnel connectivity verified (`/vn-market/*` routes work)
- [x] Dashboard-managed tunnel configuration identified (not file-based)
- [x] Escalation signal created with remediation steps
- [ ] Await architect response: Cloudflare dashboard config update


---

## Task: 1879b-fed-liquidity-spread — Docker Rebuild & Container Restart COMPLETE

**Status:** PASS — Feature code deployed, tool registered, smoke test successful

**Rebuild Details:**
- Feature commit: `a6d4b555` (2026-05-12 15:42 UTC)
  - feat(macro): get_fed_liquidity_spread MCP tool — EFFR/IORB spread + OLS trend (#130)
  - Files added: computeFedLiquiditySpread.ts, fredQueries.ts, getFedLiquiditySpreadTool.ts
- Running container was built 2026-05-10 (2 days stale)
- Rebuild command: `docker-compose build mcp-server`
  - Result: SUCCESS ✓
  - Image: vn-market-intelligence-mcp-mcp-server:latest
  - New SHA256: 30e695b950bea0596e71a57e154c59edc9f66f9263abb8ad20718c45b1fec282

**Container Restart:**
- Command: `docker-compose up -d mcp-server`
- Result: SUCCESS ✓
- Startup time: ~1 minute
- Status: Up 1 minute (healthy) ✓
- Port: 0.0.0.0:3000->3000/tcp

**Feature Verification:**
1. computeFedLiquiditySpread.ts → Present in /app/src/domain/services/macro/ ✓
2. fredQueries.ts → Present in /app/src/infrastructure/db/ ✓
3. getFedLiquiditySpreadTool.ts → Present in /app/src/interface/mcp/tools/macro/ ✓

**Tool Count:**
- Before rebuild: 132 tools
- After rebuild: 137 tools (net +5)
  - includes new get_fed_liquidity_spread tool

**Smoke Test:**
```
Tool: get_fed_liquidity_spread (via claude.ai gateway)
Arguments: {}
Response: {
  "error": "no_data",
  "message": "fred_series_daily has no paired EFFR+IORB rows. Run macroIndicatorRefreshJob to populate."
}
Status: PASS ✓
Note: Error is expected (no data synced yet); tool is registered and callable
```

**Recommended Next Step:**
QA can re-verify feature code. If macro refresh job runs and populates FRED data, full integration test will pass (tool will return effr, iorb, spread, asOf, trend30d, samples fields).


---

## Task: 1896a-c40-restart-rca — Evidence Collection COMPLETE, Inconclusive Verdict

**Status:** INCONCLUSIVE — docker events log expired; root cause undeterminable

**Investigation Date:** 2026-05-12 15:35 UTC  
**Target Event:** Unplanned container restart ~02:40 UTC (TNB c40 audit finding)

**Evidence Collection (per architect brief § 3):**

| Step | Command | Result | Finding |
|------|---------|--------|---------|
| E1 | docker events (02:00-03:00 UTC) | NO OUTPUT | Events log expired; window beyond retention |
| E2 | inspect ExitCode/OOMKilled | ExitCode: 0, RestartCount: 0, OOMKilled: false | Current container (started 14:35 UTC) has never restarted; dead instance unavailable |
| E3 | docker logs (02:30-02:50 UTC) | NO OUTPUT | Logs rotated; no historical coverage of c40 window |
| E4 | volume mount type | Type: volume (named volume confirmed) | ✓ Sprint 1336 fix intact; no bind-mount regression |
| E5 | Docker Desktop version | 28.1.1 | Stable; no known regression in named-volume isolation |
| Cross-ref | ops notebook entry for 02:40 UTC | No entry found | Confirms c40 is unplanned (distinct from deliberate c41 at 14:35 UTC) |

**Verdict:** `inconclusive-events-expired`

**Classification:**
- Restart WAS REAL (TNB uptime reading accurate)
- Restart WAS UNPLANNED (no ops activity logged)
- Root cause UNKNOWN (insufficient log coverage)
- Current system health: ALL SERVICES HEALTHY (no ongoing impact)

**Hypothesis Ruling:**
- H1 (bind-mount regression): RULED OUT — named volume confirmed in place
- H2 (Docker Desktop regression): LOW PROBABILITY — version 28.1.1 stable
- H3 (OOM from 1879b): N/A — predates 1879b deploy by 12h
- H4 (intentional c41 deploy): CONFIRMED for c41 only; c40 is separate unplanned event

**Recommendation per brief § 4:**
1. Close 1896a as `false-alarm-h4 + inconclusive-c40`
2. No follow-up sprint needed (cannot justify 1896b without definitive cause)
3. Implementation: Enable persistent docker events logging (future cycles) to avoid evidence loss on next incident

**Session artifact:** Handoff file created at `docs/handoffs/ops-c40-restart-evidence.md` with full evidence transcript.

---
