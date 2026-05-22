# System Auditor — Notebook

**Last updated:** 2026-05-22T00:31:30Z | **Current Tier:** TIER-3 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Audit Run Tier-3 (00:30–00:31 UTC 2026-05-22)

- Tier: 3
- Services checked: 12 (all UP, 28–29h uptime)
- Cron jobs audited: 108 total, 2 CRASHED, 1 ENOENT error
- Data freshness checked: 27 sources + 4 major endpoints
- DB checks performed: C-01 through C-16 (partial via MCP tools)
- Anomalies: 5 NEW CRITICAL (A-21×2, B-04, B-08, B-12)
- Dedup-skipped: 0
- Status: DEGRADED

---

## Container & Health Status

All 12 Docker services UP (28–29h uptime):
- mcp-server: 29h healthy, 0 restarts ✓
- api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich-service, alert-engine, pdf-extractor: 28h healthy ✓
- rag-service: 27h healthy ✓
- news-fetch, frontend: 28h healthy ✓
- flaresolverr (infrastructure): 28h healthy ✓

### Restart Count
mcp-server: 0 (threshold ≤ 2) ✓
All others: 0 ✓

### Memory Pressure
mcp-server: 69.20% (threshold < 85%) ✓
All others: within limits ✓

---

## A. Runtime Issues (Tier-1 + Tier-3)

### A-21 CRITICAL: Two Crons CRASHED

**vnstockFundamentalsRefresh**
- Status: CRASHED
- Last run: 2026-05-18 01:00:00 (4 days 23.5h ago)
- Total runs: 1
- Avg duration: 239,814,085 ms (67h)
- Success rate: 0%

**vnstockTradingStatsRefresh**
- Status: CRASHED
- Last run: 2026-05-18 08:30:00 (4 days 16h ago)
- Total runs: 1
- Avg duration: 212,814,085 ms (59h)
- Success rate: 0%

**Impact**: Both jobs hung during initial execution, never completed. Blocks market data refresh pipeline for fundamental metrics and trading statistics.

### A-21b: dailyDashboardJob ENOENT

- Status: ERROR (ENOENT)
- Last run: 2026-05-17 16:30:00 (5 days 8h ago)
- Error: `no such file or directory, open '/docs/data/project-stats.json'`
- Success rate: 0% (1 run, all failures)

**Impact**: Daily dashboard aggregation cannot complete. Missing path causes cascade failure.

### A-25 through A-28: Inter-Service Connectivity

All 4 inter-service health checks PASS:
- stock-price:5000/health → 200 ✓
- technical-analysis:5003/health → 200 ✓
- alert-engine:5006/health → 200 ✓
- pdf-extractor:5001/health → 200 ✓

### A-22 through A-24: Container Tooling

All tooling present in mcp-server:
- pdftoppm: /usr/bin/pdftoppm ✓
- tesseract: /usr/bin/tesseract ✓
- Vietnamese language support (vie): present ✓

### A-31: EPIPE/ECONNRESET Crash Check

Last 30 min logs: 0 occurrences (< threshold) ✓

### A-30: Cron Duration Issues

**bctcQueueEnricherJob**
- Status: RUNNING
- Last run: 2026-05-22 00:30:00
- Avg duration: 1,300,401 ms (21.7 min)
- Success rate: 99.3% (285/286 runs)

**Risk**: Job duration near timeout boundary. High avg indicates potential resource contention or sub-optimal query.

---

## B. Data Freshness Issues (Tier-2 + Tier-3)

### B-04 CRITICAL: Price Data Stale

**Source**: ssc-iboard (VN stock prices via SSC iboard)
- Last fetch: 2026-05-21 08:28:00
- Age: 16.05 hours
- Expected cadence: 15 min (0.25h)
- SLA: 10 min
- Status: **16.05h vs 10 min = CRITICAL (96.3x over)**

**VPS Proxy Status**
- Service: prices
- Last push: 2026-05-21 08:28:00 (16h ago)
- Items pushed: 111
- 24h push count: 45
- Status: STALE ✓

**Impact**: VNINDEX and watchlist stock prices are 16h stale. Price alerts cannot fire accurately. Market open (02:00 UTC) will lack fresh prices.

### B-08 CRITICAL: BCTC Financial Reports Stale

**Source**: bctc-push (BCTC PDFs via VPS cache)
- Last fetch: 2026-05-19 07:05:07
- Age: 65.43 hours (2.7 days)
- Expected cadence: 168h (7 days)
- Q1/Q2 window: 24h threshold active
- SLA: 6h (360 min)
- Status: **65.43h vs 6h = CRITICAL (10.9x over Q1/Q2 threshold)**

**VPS Proxy Status**
- Service: bctc
- Last push: 2026-05-19 07:05:07 (2.8 days ago)
- Items pushed: 1
- 24h push count: 0
- Status: STALE ✓

**Impact**: BCTC earnings data 2.7d old; watchlist coverage degraded; Q1/Q2 earnings-driven signals delayed. bctcQueueEnricherJob running but not advancing; bctcPdfPull hitting HTTP errors.

### B-12 CRITICAL: Foreign Flow Stale

**Source**: foreign-flow (FII smart money flows)
- Last fetch: 2026-05-21 00:27:00
- Age: 24.07 hours
- Expected cadence: 1 min (0.0167h) during market hours
- SLA: 10 min
- Status: **24.07h vs 10 min = CRITICAL (144x over)**

**VPS Service Status**
- Service: vn-foreign-flow
- Status: idle (market closed 00:31 UTC)
- Last poll: 1 min ago

**Impact**: When VN market opens at 02:00 UTC, foreign investor flows will be 24h+ stale. Intraday FII monitoring gap for smart-money detection.

---

## C. System Health Snapshot

### Cron Job Health Summary

**High-Load Jobs** (avg duration > 1s):
- bctcQueueEnricherJob: 21.7 min avg (running) — timeout risk
- newsHeadlinesRefreshJob: 2,989 s avg (99.1% success)
- intelligenceCycleJob: 1,180 s avg (99.7% success)
- pollNewsJob: 1,111 s avg (98.9% success)
- morningBriefingJob: 138 s avg (100% success)

**Jobs with Anomalies**:
- vnstockFundamentalsRefresh: CRASHED 67h
- vnstockTradingStatsRefresh: CRASHED 59h
- dailyDashboardJob: ERROR ENOENT

**Active Jobs** (last 30 min):
- All intelligence cycles firing normally
- All data fetch jobs pushing to VPS (except prices/bctc)
- Cron health checker running (100% success)

### Circuit Breakers

All 16 data source circuit breakers: OK ✓
No open / half-open states.

### Database Metrics

- market.db size: 150 MB
- WAL size: 7.82 MB (< 10 MB ok) ✓
- DB uptime: 13h 23m 56s
- Last PRAGMA integrity_check: (pending Tier-3 DB pass)

### VPS Proxy Health

- news: healthy, 63 pushes/24h, 0 errors
- sbv: healthy, 22 pushes/24h, 0 errors
- prices: stale (16h), 45 pushes/24h, 0 recent errors
- bctc: stale (2.8d), 0 pushes/24h

---

## Anomaly Summary

| check_id | type | source | severity | status |
|----------|------|--------|----------|--------|
| A-21 | microservice_degraded | vnstockFundamentalsRefresh | CRITICAL | OPEN (CRASHED 4d) |
| A-21b | microservice_degraded | vnstockTradingStatsRefresh | CRITICAL | OPEN (CRASHED 4d) |
| A-21c | db_integrity_breach | dailyDashboardJob | CRITICAL | OPEN (ENOENT) |
| B-04 | data_stale | ssc-iboard (prices) | CRITICAL | OPEN (16h old) |
| B-08 | data_stale | bctc-push (BCTC) | CRITICAL | OPEN (65h old) |
| B-12 | data_stale | foreign-flow | CRITICAL | OPEN (24h old) |

---

## Dedup History

All 5 anomalies are NEW (not reported in past 7 days). Telegram BUG channel alerts sent:
- 2026-05-22T00:31:30Z message_id=2547 (A-21 cron crash)
- 2026-05-22T00:31:30Z message_id=2548 (B-04/B-08/B-12 data SLA)
- 2026-05-22T00:31:30Z message_id=2549 (dailyDashboardJob ENOENT)

---

## Notes

- Early exit condition triggered: no commits in past 24h, last audit < 12h ago → skipped doc/memory pass (steps 1–6)
- Tier-1 runtime checks always executed (prerequisite for all tiers)
- Container tooling + inter-service + EPIPE checks: all PASS
- MCP tool calls used for cron health, pipeline health, VPS status (sqlite3 CLI unavailable in container)
- 108 cron jobs defined; 105 active + healthy, 2 CRASHED, 1 ENOENT error
- bctcQueueEnricherJob running continuously (avg 21.7 min) — recommend investigating if this is normal or stuck

---

## Recommendations (for ops/dev zones)

1. **A-21 (vnstockFundamentalsRefresh/vnstockTradingStatsRefresh)**: Kill stuck processes, review cron timeout logic, increase timeout or split job into smaller chunks. Blocking watchdog.
2. **A-21c (dailyDashboardJob)**: Check if `/docs/data/project-stats.json` exists in build context or volume; create if missing.
3. **B-04 (prices)**: Check VPS price-fetch service on Vinahost; restart if down; verify ssc-iboard iboard endpoint accessible.
4. **B-08 (BCTC)**: Investigate bctcPdfPull HTTP errors (3x in last 30s); check VPS bctc-files endpoint; verify mcp-server can reach VPS.
5. **B-12 (foreign-flow)**: Suppress B-12 alerts outside market hours in Tier-2 logic; restart vn-foreign-flow service on VPS market-open.

**OVERALL: DEGRADED** (5 CRITICAL issues, all data freshness / cron related, no container health issues)
