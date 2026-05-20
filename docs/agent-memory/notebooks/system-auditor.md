# System Auditor — Notebook

**Last updated:** 2026-05-20 19:59:48 UTC | **Current Tier:** TIER-1 | **Sprint:** 1958

## Status Summary

**TIER-1 RUNTIME PING COMPLETE — CRITICAL**

Docker-compose stack degraded: 10 of 11 microservices NOT RUNNING. Only mcp-server container active. Critical dependencies missing for inter-service health checks and data pipeline. Chef-morning verification fire (scheduled 2026-05-20T05:15Z) will fail.

---

## Tier-1 Audit — 2026-05-20 19:59:48 UTC (Duration: ~90s)

**Scope:** Container liveness + health endpoint checks + restart count + memory pressure + MCP system status + cron dispatcher health.

### A. Container Status (A-01 through A-11)

**CRITICAL FINDING: Microservice stack degradation**

| Service | Container Status | Expected | Actual | Health | Check ID |
|---|---|---|---|---|---|
| mcp-server | RUNNING ✓ | Up 20+ min | Up 20 min | 200 OK | A-01 |
| api-gateway | MISSING | Up | DOWN | N/A | A-02 |
| stock-price | MISSING | Up | DOWN | N/A | A-03 |
| technical-analysis | MISSING | Up | DOWN | N/A | A-04 |
| macro-indicators | MISSING | Up | DOWN | N/A | A-05 |
| kinh-dich-service | MISSING | Up | DOWN | N/A | A-06 |
| alert-engine | MISSING | Up | DOWN | N/A | A-07 |
| pdf-extractor | MISSING | Up | DOWN | N/A | A-08 |
| rag-service | MISSING | Up | DOWN | N/A | A-09 |
| news-fetch | MISSING | Up | DOWN | N/A | A-10 |
| frontend | MISSING | Up | DOWN | N/A | A-11 |

**Result:** ✗ CRITICAL FAIL — Only 1 of 11 services running. Docker-compose stack is DEGRADED.

Impact:
- Inter-service health checks (A-25 through A-28) cannot execute
- Data pipeline operations blocked (BCTC fetch, stock-price fetch, news fetch all require services)
- MCP server isolated — no downstream service connectivity
- Chef-morning verification fire at 2026-05-20T05:15Z will fail on missing dependencies

### B. Health Endpoints (A-12 through A-20)

**Only testing mcp-server since other containers are offline.**

| Port | Service | Status | Response | Check ID |
|---|---|---|---|---|
| 3000 | mcp-server | ✓ PASS | {"status":"ok","toolCount":146,"sessions":28,"uptime":1115.2s} | A-12 |
| 4000 | api-gateway | ✗ FAIL | N/A (container down) | A-13 |
| 5010 | stock-price | ✗ FAIL | N/A (container down) | A-14 |
| 5003 | technical-analysis | ✗ FAIL | N/A (container down) | A-15 |
| 5004 | macro-indicators | ✗ FAIL | N/A (container down) | A-16 |
| 5005 | kinh-dich-service | ✗ FAIL | N/A (container down) | A-17 |
| 5006 | alert-engine | ✗ FAIL | N/A (container down) | A-18 |
| 5001 | pdf-extractor | ✗ FAIL | N/A (container down) | A-19 |
| 5002 | rag-service | ✗ FAIL | N/A (container down) | A-20 |

**Result:** ✗ CRITICAL FAIL — 8 of 9 backend services unreachable. Health endpoint checks blocked.

### C. Container Metrics (A-21, A-30)

| Check | Target | Value | Threshold | Status |
|---|---|---|---|---|
| A-21 | mcp-server restart count | 0 | ≤2 | ✓ PASS |
| A-30 | mcp-server memory pressure | 40.39% | <85% | ✓ PASS |

**Result:** ✓ PASS — mcp-server container metrics nominal (the only running service).

### D. MCP System Status (via get_system_status)

**VN Trading Window:** CLOSED (outside 02:00–08:59 UTC) — market hours ended.

**Circuit Breaker Summary:**
- All 16 sources: [OK] state, 0 failures

**Database Health:**
- Path: /app/data/market.db
- Size: 150.00 MB
- WAL: 4.93 MB (well under 50MB threshold)

**Recent System Errors (last 10):**
- 10 WARN entries (BCTC low/zero-confidence extractions, pdf-extractor unavailable, bootstrap fallback messages)
- No CRITICAL errors
- No SQL corruption
- No orphaned state

**Alert Stats (24h):**
- Total alerts: 22
- HIGH/CRITICAL: 2
- Unnotified: 0
- Last alert→Telegram: 2026-05-20T15:15:02.758Z

**Telegram Env:** All 3 channel env vars SET (MARKET, WORK, BUG).

**Result:** ✓ PASS — MCP server database and circuits intact despite missing downstream services.

### E. Cron Health Status (via get_cron_health)

**Overall Cron Dispatcher:** RUNNING and responsive.

**Key Job Status (last 7 days):**
- intelligenceCycleJob: success (368 runs, 99.2% success, avg 4023s)
- alertScanParallelJob: success (74 runs, 100% success, avg 689ms)
- bctcQueueEnricherJob: success (338 runs, 99.7% success, avg 1092s)
- bctcReparseJob: 87.6% success (97 runs, avg 14953s — known issue gated)
- dailyDashboardJob: ✗ error (2 runs, 0% success, ENOENT /docs/data/project-stats.json, task 1955a in progress)
- vnstockFundamentalsRefresh: ✗ crashed (1 run, 0% success, zombie row, 1955b cleanup pending)
- vnstockTradingStatsRefresh: ✗ crashed (1 run, 0% success, zombie row, 1955b cleanup pending)
- walCheckpointJob: success (160 runs, 100% success, avg 398ms)
- news sources: mostly success >99% (newsHeadlinesRefreshJob: 99.2%, pollNewsJob: 99.0%)
- vpsServiceHealthJob: success (1212 runs, 100% success, avg 23ms)

**Result:** ✓ PASS — Cron dispatcher healthy and responsive. Known failures dedup'd and tracked. Note: Heavy jobs (BCTC reparse, intelligence cycle, news headlines) have multi-thousand ms durations; normal for complex operations.

### F. Inter-Service Connectivity (A-25 through A-28) — BLOCKED

Cannot execute inter-service connectivity checks because 10 downstream services are not running:
- A-25: stock-price health (BLOCKED)
- A-26: technical-analysis health (BLOCKED)
- A-27: alert-engine health (BLOCKED)
- A-28: pdf-extractor health (BLOCKED)

**Result:** ✗ BLOCKED — Inter-service tests cannot proceed until docker-compose stack is brought up.

---

## Anomaly Summary — Tier-1

**NEW ANOMALIES THIS CYCLE:** 1

- **A-01 CRITICAL:** Docker-compose stack degraded — 10 of 11 microservices NOT RUNNING (dedup_key: `microservice_degraded:docker-compose-stack:A-01`). Blocks inter-service checks, data pipeline, and chef-morning fire scheduled 2026-05-20T05:15Z.

**DEDUP-SKIPPED (7-day window):** 3

- dailyDashboardJob ENOENT (first seen 2026-05-17, task 1955a in progress)
- vnstockFundamentalsRefresh zombie (first seen 2026-05-18, task 1955b pending)
- vnstockTradingStatsRefresh zombie (first seen 2026-05-18, task 1955b pending)

---

## Overall Status

| Category | Status | Details |
|---|---|---|
| **Services** | ✗ CRITICAL | 1/11 running (mcp-server only), 10 MISSING |
| **Health Endpoints** | ✗ CRITICAL | 1/9 responding (mcp-server only), 8 unreachable |
| **Database** | ✓ HEALTHY | WAL 4.93 MB, PRAGMA ok, no orphans, no corruption |
| **Cron Dispatcher** | ✓ HEALTHY | Running, >95% avg success rate, 3 known issues dedup'd |
| **Memory/Restarts** | ✓ HEALTHY | mcp-server: 0 restarts, 40.39% memory |
| **Anomalies (new)** | 1 | A-01 CRITICAL: Docker-compose stack degraded |
| **Inter-Service Checks** | ✗ BLOCKED | Cannot proceed without downstream services |
| **Dedup-skipped** | 3 | Known issues from prior 7d |

**QUALITY:** Partial (inter-service checks blocked) | **TIER NEXT:** Tier-2 in 4h (expected 23:59 UTC) | **URGENT ACTION REQUIRED:** Restart docker-compose stack

---

## Immediate Actions Needed (Pre-Chef-Morning Fire @ 05:15 UTC)

1. **Investigate docker-compose state:** Why are 10 services not running?
2. **Restart stack:** `docker-compose up -d` or similar recovery procedure
3. **Verify all 11 services online:** Rerun Tier-1 to confirm recovery
4. **Alert ops:** Chef-morning fire has <9.3h to recover (currently 2026-05-20T19:59 UTC)

---

## Checklist

- [x] All 11 services running (docker ps filter) — **FAIL: 10/11 missing**
- [x] Health endpoints 200 OK — **FAIL: 8/9 unreachable**
- [x] mcp-server restart count ≤2 — **PASS**
- [x] mcp-server memory <85% — **PASS**
- [x] MCP get_system_status success — **PASS**
- [x] Cron dispatcher get_cron_health success — **PASS**
- [x] New CRITICAL/WARN anomalies identified — **1 CRITICAL (A-01)**
- [x] Notebook updated (full overwrite) — **YES**
- [x] BUG channel alert sent — **YES** (message_id: 2531)
- [x] DASHBOARD.md updated — **YES** (row 1958-A-01)
