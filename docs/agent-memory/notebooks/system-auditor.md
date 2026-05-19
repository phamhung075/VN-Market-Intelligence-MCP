# System Auditor — Notebook

**Last updated:** 2026-05-19 21:02 UTC | **Cycle:** TIER-1 | **Sprint:** 1954

## Current state

**TIER-1 AUDIT CYCLE COMPLETE — HEALTHY**

All 9 core Docker microservices operational. Health endpoints all responding 200. One persistent cron failure (dailyDashboardJob path issue) documented in prior cycles. Transient BCTC warnings (not runtime scope).

**Status Summary:**
- All 9 core services: UP and healthy
- Health endpoints: 9/9 responding HTTP 200
- Restart count: 0 (mcp-server)
- Memory pressure: 17.65% (healthy, <85%)
- Cron health: 1 persistent error (dailyDashboardJob path issue) — acknowledged in prior cycle

---

## Tier-1 Audit — 2026-05-19 21:02:34 UTC

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
- frontend: UP (healthy)

### Health Endpoints (A-12 through A-20)
✓ PASS: All 9 core services respond to HTTP /health
- mcp-server:3000 → HTTP 200 (status: ok, uptime 13m20s)
- api-gateway:4000 → HTTP 200 (all sub-services ok)
- stock-price:5010 → HTTP 200
- technical-analysis:5003 → HTTP 200
- macro-indicators:5004 → HTTP 200
- kinh-dich-service:5005 → HTTP 200
- alert-engine:5006 → HTTP 200
- pdf-extractor:5001 → HTTP 200
- news-fetch:5008 → HTTP 200

### Restart Count (A-21)
✓ PASS: mcp-server RestartCount = 0 (≤2)

### Memory Pressure (A-30)
✓ PASS: mcp-server MemPerc = 17.65% (<85%)

### MCP System Status
✓ PASS: MCP gateway reachable, all circuit breakers OK (0 open)
- Uptime: 13m20s
- WAL size: 1.47 MB (healthy, <10MB normal)
- 10 unresolved WARN errors (mostly bctcQueueEnricher, known issue from prior cycles)

### Cron Health Status
✓ PASS: 56+ cron jobs tracked, >95% success rate overall
✓ PASS: Critical jobs firing on schedule:
  - intelligenceCycleJob: last_run 21:00, success_rate 99.3%
  - predictionMarketPollJob: last_run 21:00, success_rate 100%
  - bctcReparseJob: RUNNING (last_run 20:50:19, success_rate 85.9%)

⚠ WARN: Persistent cron error (known from prior cycles)
- dailyDashboardJob: 0% success rate (3 runs, all failed)
  - last_run: 2026-05-17 16:30 (>3 days ago)
  - error: ENOENT: no such file or directory, open '/docs/data/project-stats.json'
  - **Root cause:** Path misconfiguration in cron job (should be `/app/docs/data/project-stats.json`)
  - **Status:** Documented in prior cycle; dev-mcp-server to address in task 1955a

### Anomaly Summary
- **Total anomalies detected:** 0 (NEW, THIS CYCLE)
- **Dedup-skipped:** 1 (dailyDashboardJob path error — seen in prior 7d window)
- **CRITICAL:** 0
- **WARN:** 0 (NEW)
- **INFO:** 0

### Overall Status
- **Tier-1 Completion:** SUCCESS ✓
- **Container health:** HEALTHY (9/9 up)
- **Health endpoints:** HEALTHY (9/9 responding)
- **Cron health:** HEALTHY (no NEW failures)
- **Memory/restart:** HEALTHY
- **System overall:** HEALTHY

### Wall Time
- Duration: ~30s (target: <120s) ✓

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
- **2026-05-19 21:02:34 UTC:** Current Tier-1 audit — STEADY STATE (9/9 core services healthy, no new anomalies)

---

## Operational Notes

- **Tier-1 focus:** Runtime liveness only. Cron path errors and BCTC warnings are Tier-2/3 scope.
- **Wall time:** All audits complete well under 120s target.
- **Dedup window:** 7 days. Known issues (path errors, zombie rows) not re-reported.
- **Next scheduled audits:**
  - Tier-1: every 30 min (next at ~21:32 UTC)
  - Tier-2: every 4h (next at 02:00 UTC 2026-05-20)
  - Tier-3: daily 02:00 UTC (next at 02:00 UTC 2026-05-20)
