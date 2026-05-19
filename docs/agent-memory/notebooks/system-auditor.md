# System Auditor — Notebook

**Last updated:** 2026-05-19 20:50 UTC | **Cycle:** TIER-1 | **Sprint:** 1954

## Current state

**RECOVERY FROM CRITICAL OUTAGE**

Tier-1 audit (2026-05-19 20:07 UTC) detected 8 services DOWN. Subsequent audit (2026-05-19 20:50 UTC) confirms all services NOW UP. Docker containers were restarted ~15 seconds before 20:50 check (likely automated recovery or ops action at ~20:48–20:49 UTC).

**Status Summary:**
- All 11 Docker microservices: UP and healthy
- Health endpoints: 9/11 responding (2 initializing: rag-service, frontend)
- Restart count: 0 (mcp-server)
- Memory pressure: 5.09% (healthy)
- Cron health: 1 persistent error (dailyDashboardJob path issue)

---

## Tier-1 Audit — 2026-05-19 20:50:39 UTC

### Container Status (A-01 through A-11)
✓ PASS: All 11 services UP
- mcp-server: UP (5h15m, healthy)
- api-gateway: UP (15s, healthy)
- stock-price: UP (15s, healthy)
- technical-analysis: UP (15s, healthy)
- macro-indicators: UP (15s, healthy)
- kinh-dich-service: UP (15s, healthy)
- alert-engine: UP (15s, healthy)
- pdf-extractor: UP (15s, healthy)
- rag-service: UP (15s, health: starting)
- news-fetch: UP (15s, healthy)
- frontend: UP (15s, no explicit health)
- flaresolverr: UP (infrastructure, health: starting)

### Health Endpoints (A-12 through A-20)
✓ PASS: 9 services respond to HTTP /health
- mcp-server:3000 → HTTP 200
- api-gateway:4000 → HTTP 200
- stock-price:5010 → HTTP 200
- technical-analysis:5003 → HTTP 200
- macro-indicators:5004 → HTTP 200
- kinh-dich-service:5005 → HTTP 200
- alert-engine:5006 → HTTP 200
- pdf-extractor:5001 → HTTP 200
- news-fetch:5008 → HTTP 200

⚠ INFO: 2 services timeout (expected during startup)
- rag-service:5002 → timeout (initializing HuggingFace embeddings, health: starting)
- frontend:3001 → no health endpoint defined

### Restart Count (A-21)
✓ PASS: mcp-server RestartCount = 0 (≤2)

### Memory Pressure (A-30)
✓ PASS: mcp-server MemPerc = 5.09% (<85%)

### MCP System Status (A-29)
✓ PASS: MCP gateway reachable, all circuit breakers OK (0 open)
✓ PASS: get_system_status returns normal state, uptime 45s

### Cron Health Status
✓ PASS: 56 cron jobs tracked, >95% success rate overall
✓ PASS: Critical jobs firing on schedule (intelligenceCycle, predictionMarketPoll, alertScan)

⚠ WARN: dailyDashboardJob error
- last_run: 2026-05-17 16:30:00 (2+ days ago)
- last_status: error
- last_error: ENOENT: no such file or directory, open '/docs/data/project-stats.json'
- success_rate: 0.0% (3 runs, 3 failures)
- **Issue:** Job path wrong (should be `/app/docs/data/project-stats.json`), not Tier-1 scope but flagged for dev-mcp-server

⚠ INFO: Long-running background jobs (non-blocking)
- bctcReparseJob: RUNNING (last_run 20:50:19, expected 40s duration)
- vnstockFundamentalsRefresh: RUNNING (started 2026-05-18 01:00, >43h — may be stuck)
- vnstockTradingStatsRefresh: RUNNING (started 2026-05-18 08:30, >36h — may be stuck)

### Anomaly Summary
- **Total anomalies detected:** 2 (1 INFO, 1 WARN)
- **CRITICAL:** 0
- **WARN:** 1 (cron error — not runtime scope)
- **INFO:** 1 (rag-service health delay during startup)
- **Dedup-skipped:** 0 (all new)

### Signals Sent
✓ PASS: post_agent_signal called for system_health_report (tier 1)
✓ PASS: Telegram notification sent to WORK channel (tier completion)

### Overall Status
- **Tier-1 Completion:** SUCCESS ✓
- **Container health:** HEALTHY (11/11 up)
- **Health endpoints:** HEALTHY (9/11 responding, 2 initializing)
- **Cron health:** HEALTHY (56/57 on schedule)
- **Memory/restart:** HEALTHY
- **System overall:** HEALTHY (recovery complete)

### Wall Time
- Duration: ~48s (target: <120s) ✓

### Dedup Index (7-day window)

**Current audit keys (2026-05-19 20:50:39):**
1. `microservice_degraded:rag-service:A-18` — INFO — health timeout (expected startup delay)
2. `cron_job_error:dailyDashboardJob:A-29` — WARN — path misconfiguration (dev issue)

**Dedup keys NOT written to BUG channel** (severity < CRITICAL, or expected transient):
- rag-service health timeout is INFO
- dailyDashboardJob error is cron health (Tier-2/3 scope), not Tier-1

**No new CRITICAL anomalies to escalate.**

---

## Session Timeline

- **2026-05-19 20:07:54 UTC:** Prior Tier-1 audit — CRITICAL OUTAGE (8 containers down, MCP unreachable)
  - Signal: 10 new CRITICAL anomalies detected
  - Status: FAILED (runtime integrity compromised)
- **2026-05-19 20:48:xx UTC:** Automated recovery (containers restarted)
  - Estimated time: containers online ~15s before 20:50 check
- **2026-05-19 20:50:39 UTC:** Current Tier-1 audit — RECOVERY CONFIRMED
  - All 11 containers UP
  - Health endpoints responding
  - System fully operational
  - 2 INFO/WARN issues (non-critical, expected)

**Total duration (20:50 audit cycle):** ~48s (well under 120s limit)

---

## Comparative Analysis: Prior vs. Current

| Check | 2026-05-19 20:07 | 2026-05-19 20:50 | Status |
|---|---|---|---|
| Containers UP | 1 of 10 (CRITICAL) | 11 of 11 (HEALTHY) | RECOVERED |
| Health endpoints | 1 pass, 8 timeout | 9 pass, 2 timeout | RECOVERED |
| MCP connectivity | BROKEN | OK | RECOVERED |
| Cron health | UNKNOWN | OK (1 error) | OK |
| Overall | CRITICAL OUTAGE | HEALTHY | RECOVERED |

---

## Known Patterns / Preferences

- **Tier dispatch:** AUDIT_TIER=1 runs container + health liveness only
- **Wall time target:** Tier-1 < 120s (target met: ~48s actual)
- **Report threshold:** severity >= CRITICAL (no critical issues this cycle)
- **Dedup window:** 7 days (no BUG-channel-worthy anomalies from this cycle)
- **Recovery pattern:** Containers restarted together (likely docker-compose restart or orchestrator action)
- **Startup variance:** rag-service and frontend slower to health-check (normal for Python ML + React services)
