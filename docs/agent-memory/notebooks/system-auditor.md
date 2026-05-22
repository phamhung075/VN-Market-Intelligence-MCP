# System Auditor — Notebook

**Last updated:** 2026-05-22T01:35:09Z | **Current Tier:** TIER-1 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Audit Run Tier-1 (01:04–01:05 UTC 2026-05-22)

- Tier: 1
- Services checked: 12 (all UP, 27–29h uptime)
- Health endpoints checked: 11 (all 200 OK)
- Restart count: mcp-server=0 (threshold ≤ 2) ✓
- Memory pressure: mcp-server=72.27% (threshold < 85%) ✓
- EPIPE/ECONNRESET: 1 (threshold ≤ 2) ✓
- Anomalies: 4 NEW (3 CRITICAL, 1 WARN)
- Dedup-skipped: 0
- Status: DEGRADED (runtime + cron health issues)

---

## Container & Health Status

All 12 Docker services UP:
- mcp-server: 29h healthy, 0 restarts ✓
- api-gateway: 29h healthy ✓
- stock-price: 29h healthy ✓
- technical-analysis: 29h healthy ✓
- macro-indicators: 29h healthy ✓
- kinh-dich-service: 29h healthy ✓
- alert-engine: 29h healthy ✓
- pdf-extractor: 29h healthy ✓
- rag-service: 27h healthy ✓
- news-fetch: 29h healthy ✓
- frontend: 29h healthy ✓
- flaresolverr (infrastructure): 29h healthy ✓

### Health Endpoints

All 11 service health endpoints returning HTTP 200:
- Port 3000 (mcp-server): OK ✓
- Port 4000 (api-gateway): OK ✓
- Port 5010 (stock-price): OK ✓
- Port 5003 (technical-analysis): OK ✓
- Port 5004 (macro-indicators): OK ✓
- Port 5005 (kinh-dich-service): OK ✓
- Port 5006 (alert-engine): OK ✓
- Port 5001 (pdf-extractor): OK ✓
- Port 5002 (rag-service): OK ✓
- Port 5008 (news-fetch): OK ✓
- Port 3001 (frontend): OK ✓

### Restart Count

mcp-server: 0 (threshold ≤ 2) ✓

### Memory Pressure

mcp-server: 72.27% (threshold < 85%) ✓

### EPIPE/ECONNRESET

Last 30 minutes: 1 error (threshold ≤ 2) ✓

---

## MCP System Status

**Circuit Breakers**: All 16 sources OK, no open/half-open states ✓

**Recent System Errors**: 10 warnings (vnstock:* RATE_LIMITED, backing off/max retries) — transient, not blocking ✓

**Cron Health**: 108 total jobs defined. CRITICAL ANOMALIES DETECTED:

1. **A-21: vnstockFundamentalsRefresh CRASHED**
   - Last run: 2026-05-18 01:00:00 (4 days old)
   - Status: crashed
   - Avg duration: 240s+ (hangs indefinitely)
   - Success rate: 0%
   - Impact: Stock fundamental data missing, pipeline blocked
   - Severity: **CRITICAL**

2. **A-21b: vnstockTradingStatsRefresh CRASHED**
   - Last run: 2026-05-18 08:30:00 (4 days old)
   - Status: crashed
   - Avg duration: 212s+ (hangs indefinitely)
   - Success rate: 0%
   - Impact: Trading stats missing, watchlist coverage degraded
   - Severity: **CRITICAL**

3. **A-21c: dailyDashboardJob ERROR**
   - Last run: 2026-05-17 16:30:00 (5 days old)
   - Last error: ENOENT: no such file or directory, open '/docs/data/project-stats.json'
   - Status: error
   - Success rate: 0%
   - Impact: Daily dashboard generation broken
   - Severity: **CRITICAL**

4. **A-29: bctcReparseJob LOW SUCCESS RATE**
   - Last run: 2026-05-20 19:40:18 (successful)
   - Success rate: 84.2% (expected 100%)
   - Total runs: 76
   - Avg duration: 19s
   - Impact: Sporadic BCTC PDF re-parse failures
   - Severity: **WARN**

---

## Prior Tier-3 Findings (Still Active)

From 2026-05-22T00:30–00:31 UTC audit:

| check_id | severity | source | status |
|---|---|---|---|
| B-04 | CRITICAL | ssc-iboard prices 16h stale (10m SLA) | OPEN |
| B-08 | CRITICAL | bctc-push 65h stale (6h SLA in Q1/Q2) | OPEN |
| B-12 | CRITICAL | foreign-flow 24h stale (10m SLA) | OPEN |

---

## Alerts Sent

Tier-1 complete. Sent to BUG channel:
- Message 2550: A-21 vnstockFundamentalsRefresh CRASHED
- Message 2551: A-21b vnstockTradingStatsRefresh CRASHED
- Message 2552: A-21c dailyDashboardJob ERROR
- Message 2553: A-29 bctcReparseJob success_rate 84.2%

Appended to DASHBOARD.md (ops section):
- Row: 1960-A-21-VNSTOCK
- Row: 1960-A-21b-VNSTOCK
- Row: 1960-A-21c-DAILYDASH
- Row: 1960-A-29-BCTC-REPARSE

---

## Summary

**Tier-1 STATUS: DEGRADED**
- All 12 containers UP (runtime layer PASS)
- All 11 health endpoints returning 200 (API layer PASS)
- mcp-server: 0 restarts, 72.27% memory (resource layer PASS)
- All circuit breakers OK
- **4 NEW anomalies detected (3 CRITICAL cron jobs hung/errored, 1 WARN)**

**System Runtime Layer**: PASS ✓
**System Cron Layer**: DEGRADED (3 critical hung jobs, 1 warn sporadic)
**Data Freshness Layer**: DEGRADED (see prior Tier-3 findings)
**DB Integrity Layer**: PENDING next Tier-3 cycle (02:00 UTC)

**Zone owner assignments:**
- A-21, A-21b, A-21c, A-29 → dev-mcp-server
- B-04, B-08, B-12 → ops (VPS routes), dev-stock-price (B-04), dev-pdf-extractor (B-08)

---

## Telegram Notification

Sent to WORK channel at 01:05 UTC:
> [system-auditor] Tier-1 complete 01:05 UTC — 12/12 services UP, 11/11 health OK, 4 NEW anomalies detected (3 CRITICAL cron, 1 WARN) | Status: DEGRADED

---

## Audit Run Tier-1 (01:35–01:35 UTC 2026-05-22)

- Tier: 1
- Services checked: 11 (all UP, 28–30h uptime)
- Health endpoints checked: 5 core services (all 200 OK)
- Restart count: mcp-server=0 (threshold ≤ 2) ✓
- Memory pressure: mcp-server=77.15% (threshold < 85%) ✓
- MCP system status: 16/16 circuit breakers OK, 10 vnstock warnings (rate-limited, transient)
- Cron health review:
  - bctcReparseJob: 84.2% success_rate (WARN threshold <90%)
  - vnstockFundamentalsRefresh: still CRASHED (4d old, no new fire)
  - vnstockTradingStatsRefresh: still CRASHED (4d old, no new fire)
  - dailyDashboardJob: ENOENT confirmed — path bug `/docs/data/` vs `/app/data/`
- Anomalies: 1 NEW critical (path bug confirmed + BUG alert sent)
- Dedup-skipped: 3 (A-21, A-21b already gated; A-29 under BCTC freeze)
- Status: DEGRADED (same 3 critical crons + 1 warn as prior cycle; new BUG alert on path bug)

### Finding: dailyDashboardJob Container Path Bug

**Check:** A-29 (Cron job success rate)
**Severity:** CRITICAL
**Root cause:** dailyDashboardJob.ts uses local projectRoot() helper that resolves to `/docs/data/` instead of canonical `/app/data/` (mcp-server volume mount point). File exists on host and is mounted correctly; job fails at startup with ENOENT.
**Impact:** Daily dashboard generation disabled since 2026-05-17 (5d)
**Fix:** Replace local helper with canonical getProjectRoot() import (same as bctcReparseJob + other jobs in same service)
**Zone:** dev-mcp-server (XS fix)
**Signal:** Message 2554 sent to BUG channel at 01:35 UTC
**Dashboard:** Appended row 1960-A-29-CRON-REPEAT to ops section

### Summary

**Tier-1 STATUS: DEGRADED (no change)**
- All 11 containers UP (runtime layer PASS) ✓
- All 5 health endpoints 200 (api layer sample PASS) ✓
- mcp-server: 0 restarts, 77.15% memory (resource layer PASS) ✓
- Cron health: 3 critical hung jobs + 1 warn (same as previous cycle 01:04Z)
- New activity: confirmed path bug root cause, sent BUG alert, appended DASHBOARD row
- No self-recovery observed in the 31-minute gap (01:04–01:35)

**Next steps:** (1) Monitor for Tier-2 freshness sweep (03:30Z+); (2) dev-mcp-server ships XS fix for dailyDashboardJob path bug within sprint 1960; (3) vnstock crashes remain gated per OBSERVE-1955e / TASK 1967-06 (unlock 2026-05-22T21:00Z)
