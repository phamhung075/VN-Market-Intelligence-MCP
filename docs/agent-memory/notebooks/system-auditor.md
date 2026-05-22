# System Auditor — Notebook

**Last updated:** 2026-05-22T18:03:25Z | **Current Tier:** TIER-1 | **Sprint:** 1970+ | **A-21c Verdict:** FAIL-VERDICT RE-FIRE

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (18:03–18:04 UTC 2026-05-22)

**Tier:** 1 (Runtime Ping)
**Duration:** < 1 min | **Containers checked:** 12/12 | **Health endpoints:** 10/11 (1 no endpoint) | **Restart counts:** mcp-server=0 | **EPIPE/ECONNRESET in 30m logs:** 0
**Anomalies detected:** 1 NEW anomaly (A-21c FAIL-VERDICT) | **Dedup context applied:** 7-day window, 10 items skipped

### Findings

**Container Status (A-01 through A-11):**
- mcp-server: Up 11m (restarted since prior audit, healthy) ✓
- api-gateway: Up 46h (healthy) ✓
- stock-price: Up 13h (healthy) ✓
- technical-analysis: Up 46h (healthy) ✓
- macro-indicators: Up 46h (healthy) ✓
- kinh-dich-service: Up 46h (healthy) ✓
- alert-engine: Up 46h (healthy) ✓
- pdf-extractor: Up 46h (healthy) ✓
- rag-service: Up 44h (healthy) ✓
- news-fetch: Up 46h (healthy) ✓
- frontend: Up 46h (healthy) ✓
- flaresolverr: Up 45h (healthy) ✓
- mcp-gateway: Up 5d (healthy) ✓
- Status: PASS (12/12 UP)

**Health Endpoints (A-12 through A-20):**
- mcp-server:3000 → 200 OK ✓
- api-gateway:4000 → 200 OK (9-service latency <5ms each) ✓
- stock-price:5010 → 200 OK ✓
- technical-analysis:5003 → 200 OK ✓
- macro-indicators:5004 → 200 OK ✓
- kinh-dich-service:5005 → 200 OK ✓
- alert-engine:5006 → 200 OK ✓
- pdf-extractor:5001 → 200 OK ✓
- rag-service:5002 → 200 OK ✓
- news-fetch:5008 → 200 OK ✓
- frontend:3001 → no endpoint (running, container healthy, INFO only)
- Status: PASS (10/10 explicit endpoints responding)

**Memory Pressure (A-30):**
- mcp-server: 43.98% ✓
- Status: PASS (well below 85% threshold)

**Circuit Breaker Status (via get_system_status):**
- 16/16 sources reporting OK
- Status: PASS

**Cron Health (A-29):**
- 65+ jobs tracked, 99%+ success for major jobs
- Key finding: **dailyDashboardJob** status=error, last_run=2026-05-17T16:30Z (5 days ago), total_runs=1
- Error: "ENOENT: no such file or directory, open '/docs/data/project-stats.json'"
- Job scheduled: 23:30 GMT+7 = 16:30 UTC daily
- Expected fire: 2026-05-22T16:30Z (today, ~1h ago)
- Actual fire: NONE recorded since 2026-05-17T16:30Z
- Root cause: docker-compose.yml mounts only daily-dashboard.json, missing project-stats.json mount
- **Verdict: FAIL — gate window expired 2026-05-22T16:30Z, NEW ANOMALY detected, BUG alert emitted (msg_id=2570)**

**Dedup Context (7-day window, SUPPRESS these items):**
- A-11: FALSE-POSITIVE (resolved 2026-05-22T12:33Z, host-port override needed)
- A-21: vnstockFundamentalsRefresh crashed (gate 2026-05-22T21:00Z)
- A-21b: vnstockTradingStatsRefresh 50% (gate 2026-05-22T21:00Z)
- A-29: bctcReparseJob 85.4% (canonical NFR-3 defer-freeze)
- A-30: frontend no /health (INFO only)
- A-31: Reuters + Trading-Econ RSS circuits OPEN (fallback OK)
- B-01: ssc-iboard stale (OBSERVE-MARKET-HOURS)
- B-02: foreign-flow stale (market-hours gate, currently outside window)
- B-08: BCTC VPS push stale (DEFER-FREEZE 1953-G-FAIL/1954c)
- C-06: news_articles false-positive (legacy table)
- C-07: agent_signals false-positive (legacy table)

**EPIPE/ECONNRESET Check (A-31):**
- Last 30m: 0 occurrences
- Status: PASS

### Anomalies Summary

| Check ID | Severity | Type | Detail | Action |
|---|---|---|---|---|
| A-21c | CRITICAL | NEW | dailyDashboardJob ENOENT /docs/data/project-stats.json (no fire 2026-05-17→22, gate expired 16:30Z today) | BUG emitted (msg_id=2570), DASHBOARD row updated, recommend dev-mcp-server dispatch |

### System Health at 18:03Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Containers (12 total) | Health | 12/12 UP | HEALTHY |
| Health endpoints (10 monitored) | Response | 10/10 OK | HEALTHY |
| Memory pressure | Util | 43.98% mcp-server | HEALTHY |
| Circuit breakers (16 total) | Status | 16/16 green | HEALTHY |
| Cron jobs (65+ active) | Success rate | 99%+ major jobs | MOSTLY-HEALTHY (A-21c=1 anomaly) |
| EPIPE/ECONNRESET | 30m window | 0 occurrences | HEALTHY |
| Overall | State | MOSTLY-HEALTHY | 1 NEW anomaly (A-21c) |

---

## Tier-1 Runtime Ping Summary

**Cycle: 2026-05-22T18:03:25Z**

Tier-1 audit scope: container liveness, health endpoints, memory pressure, cron fire gaps, system status rollup.

**Result: MOSTLY-HEALTHY (1 NEW anomaly, 10 dedup-skipped)**

All 12 core services UP and operational. Health endpoints responding normally (10/10 explicit endpoints, frontend no /health, expected). All circuit breakers 16/16 green. Cron jobs 99%+ success for major jobs. No EPIPE/ECONNRESET in past 30m.

**NEW ANOMALY DETECTED:** A-21c FAIL-VERDICT (dailyDashboardJob not firing since 2026-05-17, gate window expired, docker-compose volume mount missing).

**Signals emitted:** 1 new (0 CRITICAL formal signal, 1 Telegram BUG alert msg_id=2570)

**BUG channel:** 1 alert sent (A-21c FAIL-VERDICT)

**DASHBOARD.md:** 1 row updated (A-21c status=FAIL-VERDICT-RE-FIRE)

**Dedup status:** 10 items suppressed (within 7-day window or market-hours gates)

---

## Session Notes

- 18:03Z: Tier-1 runtime ping invoked with AUDIT_TIER=1
- 18:03–18:04Z: Docker ps, health endpoint checks, MCP tool calls (get_system_status, get_cron_health)
- 18:04Z: Key finding: dailyDashboardJob.last_run=2026-05-17T16:30Z (5d ago), status=error ENOENT, no subsequent fire logged
- 18:04Z: Carry-over dedup context check: A-21c gate expired at 2026-05-22T16:30Z UTC (today, 1.5h prior to audit), new verdict = FAIL
- 18:04Z: Root cause analysis: docker-compose.yml declares only daily-dashboard.json mount in /app/docs/data/, missing project-stats.json; job cannot write, fails silently
- 18:04Z: BUG Telegram alert emitted (msg_id=2570), DASHBOARD.md row A-21c updated to FAIL-VERDICT-RE-FIRE status
- 18:04Z: Recommend dev-mcp-server dispatch to add missing volume mount + re-deploy before next 23:30Z fire
- All other container/health/cron checks PASS. Dedup rules honored. No other new anomalies.
