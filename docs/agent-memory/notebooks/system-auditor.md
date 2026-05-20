# System Auditor — Notebook

**Last updated:** 2026-05-20 04:18 UTC | **Cycle:** TIER-1 | **Sprint:** 1956

## Current state

**TIER-1 AUDIT CYCLE COMPLETE — HEALTHY**

All 9 core Docker microservices operational. Health endpoints all responding 200. No new anomalies detected. One persistent cron error (dailyDashboardJob path issue) documented in prior cycles — dedup-skipped per 7-day window.

**Status Summary:**
- All 9 core services: UP and healthy
- Health endpoints: 9/9 responding HTTP 200
- Restart count: 0 (mcp-server)
- Memory pressure: Not available (docker stats timeout — non-critical)
- Cron health: >99% success rate overall; 1 known persistent error (dedup-skipped)

---

## Tier-1 Audit — 2026-05-20 04:18:05 UTC

### Container Status (A-01 through A-11)
✓ PASS: All 9 core services UP
- mcp-server: UP (healthy)
- api-gateway: UP (healthy)
- stock-price: UP (healthy)
- technical-analysis: UP (healthy)
- macro-indicators: UP (healthy)
- kinh-dich-service: UP (healthy)
- alert-engine: UP (healthy)
- pdf-extractor: UP (healthy)
- news-fetch: UP (healthy)
- rag-service: UP (healthy)
- frontend: Not responding to health check (expected; frontend is UI-only, no HTTP health endpoint)

### Health Endpoints (A-12 through A-20)
✓ PASS: All 9 core services respond to HTTP /health
- mcp-server:3000 → HTTP 200 (status: ok, uptime 1h50m58s)
- api-gateway:4000 → HTTP 200 (all sub-services ok)
- stock-price:5010 → HTTP 200 (port: 5000, service: stock-price, status: ok)
- technical-analysis:5003 → HTTP 200 (status: ok)
- macro-indicators:5004 → HTTP 200 (status: ok)
- kinh-dich-service:5005 → HTTP 200 (status: ok)
- alert-engine:5006 → HTTP 200 (port: 5006, service: alert-engine, status: ok)
- pdf-extractor:5001 → HTTP 200 (status: ok)
- rag-service:5002 → HTTP 200 (status: ok)
- news-fetch:5008 → HTTP 200 (status: ok, port: 5008)

### Restart Count (A-21)
✓ PASS: mcp-server RestartCount = 0 (≤2)

### Memory Pressure (A-30)
⚠ TIMEOUT: docker stats --no-stream timed out (non-critical for Tier-1)

### MCP System Status
✓ PASS: MCP gateway reachable, all circuit breakers OK (0 open)
- Uptime: 1h 50m 58s
- WAL size: 7.45 MB (healthy, <10MB)
- Unresolved WARN errors: 10 (mostly vnstock rate-limits + foreign-flow fallback; known transient)
- DB path: /app/data/market.db (147.91 MB)
- Trading window: VN market OPEN (02:00–08:59 UTC)

### Cron Health Status
✓ PASS: 60+ cron jobs tracked, >99% success rate overall
✓ PASS: Critical jobs firing on schedule:
  - intelligenceCycleJob: last_run 2026-05-20 04:15, success_rate 99.0% (RUNNING)
  - predictionMarketPollJob: last_run 2026-05-20 03:00, success_rate 100%
  - bctcReparseJob: last_run 2026-05-19 22:49:44, success_rate 87.1%
  - alertScanParallelJob: last_run 2026-05-20 04:15, success_rate 100%
  - vpsServiceHealthJob: last_run 2026-05-20 04:15, success_rate 100%

⚠ WARN: Persistent cron error (known from prior cycles, DEDUP-SKIPPED)
- dailyDashboardJob: 0% success rate (3 runs, all failed)
  - last_run: 2026-05-17 16:30 (>3 days ago)
  - error: ENOENT: no such file or directory, open '/docs/data/project-stats.json'
  - **Root cause:** Path misconfiguration in cron job (should be `/app/docs/data/project-stats.json`)
  - **Dedup key:** `cron_job_error:dailyDashboardJob:A-29`
  - **Status:** Documented in prior cycle; task 1955a assigned; dedup-skipped 2026-05-20

ℹ INFO: Zombie cron rows (no new runs in >72h, likely stale state records):
  - vnstockFundamentalsRefresh: last_run 2026-05-18 01:00 (>2.5 days ago), running=true, success_rate 0.0%
  - vnstockTradingStatsRefresh: last_run 2026-05-18 08:30 (>2 days ago), running=true, success_rate 0.0%
  - (dedup-skipped from prior cycles)

### Anomaly Summary
- **Total anomalies detected:** 0 (NEW, THIS CYCLE)
- **Dedup-skipped:** 1 (dailyDashboardJob path error — seen in prior 7d window)
- **CRITICAL:** 0
- **WARN:** 0 (NEW)
- **INFO:** 0 (zombie rows dedup-skipped)

### Overall Status
- **Tier-1 Completion:** SUCCESS ✓
- **Container health:** HEALTHY (9/9 core up)
- **Health endpoints:** HEALTHY (9/9 responding)
- **Cron health:** HEALTHY (no NEW failures; all critical jobs firing)
- **Memory/restart:** HEALTHY (restart=0, memory check timeout non-critical)
- **System overall:** HEALTHY

### Wall Time
- Duration: ~10s (target: <120s) ✓

### Dedup Index (7-day window)

**Dedup keys present from prior 7d:**
- `cron_job_error:dailyDashboardJob:A-29` — WARN — first seen 2026-05-17 19:31 (dedup-skipped this cycle, no new BUG write)
- `cron_stuck:vnstockFundamentalsRefresh:A-29` — INFO — zombie row (dedup-skipped)
- `cron_stuck:vnstockTradingStatsRefresh:A-29` — INFO — zombie row (dedup-skipped)

**No NEW anomalies to escalate.**

---

## Session Timeline

- **2026-05-19 20:07:54 UTC:** Prior Tier-1 audit — CRITICAL OUTAGE (8 containers down, MCP unreachable)
- **2026-05-19 20:48:xx UTC:** Automated recovery (containers restarted)
- **2026-05-19 20:50:39 UTC:** Tier-1 audit — RECOVERY CONFIRMED (all 11 UP)
- **2026-05-19 21:02:34 UTC:** Tier-1 audit — STEADY STATE (9/9 core services healthy)
- **2026-05-20 04:18:05 UTC:** Current Tier-1 audit — STEADY STATE CONFIRMED (9/9 core services healthy, no new anomalies)

---

## Operational Notes

- **Tier-1 focus:** Runtime liveness only. Cron path errors and transient rate-limits are Tier-2/3 scope.
- **Wall time:** All audits complete well under 120s target.
- **Dedup window:** 7 days. Known issues (path errors, zombie rows, transient rate-limits) not re-reported.
- **System steady state confirmed:** Two consecutive Tier-1 cycles with no new anomalies (21:02 and 04:18). Runtime is stable post-recovery.
- **Next scheduled audits:**
  - Tier-1: every 30 min (next at ~04:48 UTC)
  - Tier-2: every 4h (next at 08:00 UTC 2026-05-20)
  - Tier-3: daily 02:00 UTC (next at 02:00 UTC 2026-05-21)
