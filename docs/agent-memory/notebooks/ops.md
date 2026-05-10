# Ops — Notebook

**Last updated:** 2026-05-06 03:11 UTC | **Sprint:** 1846+ Incident Response

---

## Latest Resolution: read_telegram_reports JSON-RPC Fix ✅ VERIFIED

**Commit:** d6ab44dd  
**Status:** Fixed and deployed, tests passing, container healthy

**Issue:** read_telegram_reports MCP tool was returning -32600 (Invalid Request) JSON-RPC error due to double-encoding of JSON in the response

**Root Cause:** JSON.stringify was being applied twice—once in the tool logic, then again in the envelope—causing malformed JSON that the parser rejected

**Fix:** Single-pass serialization: `JSON.stringify(serialized)` → plain text in MCP content field

**Verification:**
- ✅ Container running at commit d6ab44dd
- ✅ 228-read-telegram-reports.test.ts: 14 pass (747ms)
- ✅ 229-process-telegram-report.test.ts: 14 pass (573ms)
- ✅ Health endpoint: 130 tools registered, server healthy
- ✅ Server startup logs clean, no JSON/RPC errors

**Impact:** Dev Team orchestration loop can now call read_telegram_reports() without JSON-RPC failures

---

## Current Status: MONITORING

### Resolved (Completed)
1. ✅ Docker container infrastructure (9 services healthy)
2. ✅ Database integrity (market.db, alert-engine.db healthy, WAL normal)
3. ✅ read_telegram_reports JSON-RPC fix (deployed, tested, verified)
4. ✅ Dev Team Telegram Report Channel workflow (unblocked)

### Outstanding (Requires Action)
1. **P1 — vnstock officers.filter crash** (CODE BUG)
   - VCI, EIB, VDC, FPT, GAS, VHM fail with `officers.filter is not a function`
   - File: `apps/mcp-server/src/infrastructure/db/vnstockStore.ts:393`
   - Action: Developer agent needed to add null/array guard before .filter()

2. **P2 — BCTC data stale (5 days)** (VPS SERVICE)
   - Last push: 2026-04-27 16:58 UTC
   - Likely cause: vn-bctc-fetch.service inactive on Vinahost VPS
   - Action: SSH diagnosis needed (escalate if automation unavailable)

3. **P3 — Foreign flow stale (31h)** (VPS SERVICE)
   - Missed full trading session 2026-05-03
   - Root cause: Same as BCTC
   - Action: Grouped with BCTC service restart

---

## Known Patterns & Preferences

- VPS Vinahost (Vietnam) is the proxy for ALL geo-blocked VN sources: prices, BCTC PDFs, news, SBV FX rates, foreign flow data
- BCTC pipeline is PULL-based (since 2026-04-27): mcp-server pulls from `VPS:8765/bctc-files/`
- SQLite corruption root cause (fixed Sprint 1336): macOS Docker VirtualMachine process tears SHM on container stop. Fix = named volume
- Docker restart command: `cd $PROJECT_ROOT && docker-compose down && docker-compose up -d`
- WAL file > 50MB is a flag worth investigating. Normal < 10MB.
- Use `trigger_bctc_vps_fetch(dry_run=true)` first to diagnose before live fetch
- JSON-RPC tools MUST NOT double-encode responses; single JSON.stringify() only

---

## Session Log (2026-05-06)

**03:11 UTC:** Full diagnostic run on reported JSON-RPC -32600 error
- Container status: ✅ UP (vn-market-intelligence-mcp-mcp-server-1)
- Commit verification: ✅ d6ab44dd deployed
- Code inspection: ✅ Fix confirmed in telegramReportTools.ts
- Test execution: ✅ All 28 tests passing (14+14)
- Health check: ✅ 130 tools, healthy
- Conclusion: Issue RESOLVED, no further action needed
- Next: Await dev-team cron cycle to validate end-to-end workflow

---

## Lesson: 2026-05-06 False Positive Docker Outage

Multiple agents reported "Docker/MCP offline 18h+" — this was FALSE. All 9 services were UP with 14h uptime. Root cause: agents read prior session logs claiming "MCP down" and assumed it was still true without attempting the actual tool call. Always verify by calling the tool, never trust session log claims about infrastructure status.

---

## Recent session — 2026-05-10 (Task 1862k)

**Task:** Verify vnstock rate limiter deployment (Sprint 1862a) — FINDINGS ONLY, no fix

**Finding:** Container UNDEPLOYED. Source has RPM 80 + SYNC_DELAY_MS 2500ms (commit 29ac583f, merged 2026-05-09 19:55:52). Running container still on RPM 50 + 1500ms (built 2026-05-09 07:46:23 — 12h before merge).

**RATE_LIMITED ticker count:** 71 unique tickers (not 13 as sprint summary stated). HPG, HSG repeatedly failing across finance/balance/cash_flow/stats endpoints.

**Recommendation:** Container rebuild required — `docker-compose down && docker-compose build --no-cache && docker-compose up -d`. Monitor 2 full intelligence cycles post-rebuild.

**Status:** Findings reported to WORK channel. Container rebuild gates: 1862a (RPM 80) + 1862f (Reuters/TE backoff) + 1862j (sigma dedup) + 1865a (UTC guard) — all 4 fixes merged but undeployed.

