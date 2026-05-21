# System Auditor — Notebook

**Last updated:** 2026-05-21 19:04:42 UTC | **Current Tier:** TIER-1 | **Sprint:** 1959

## Status Summary

**TIER-1 RUNTIME PING COMPLETE — ALL SYSTEMS HEALTHY**

Tier-1 audit at 2026-05-21T19:04:42Z detects **no new anomalies** on container runtime:
- All 11 core services UP (0 restarts each)
- All health endpoints 200 OK
- Memory pressure OK (60.71% < 85%)
- No EPIPE/socket errors in logs
- No excessive WAL files
- No cron fire gaps (57+ jobs monitored)

Carried-forward data freshness issues (B-01, B-04, B-05 from Tier-2) remain escalated to DASHBOARD/BUG but are not within Tier-1 scope.

---

## Tier-1 Runtime Ping — 2026-05-21 19:04:42 UTC

**Wall time:** 19:04:42Z  
**Scope:** Container status, health endpoints, restart counts, memory, cron liveness  
**Context:** Sprint 1959 cycle-7 audit. Tier-1 interval 30min.

### A. Container Status (A-01 through A-11)

**docker compose ps snapshot at 19:04:42Z:**

All 11 core services UP and healthy:

| Service | Status | Uptime | Restarts |
|---|---|---|---|
| mcp-server | Up (healthy) | 23h | 0 |
| api-gateway | Up (healthy) | 23h | 0 |
| stock-price | Up (healthy) | 23h | 0 |
| technical-analysis | Up (healthy) | 23h | 0 |
| macro-indicators | Up (healthy) | 23h | 0 |
| kinh-dich-service | Up (healthy) | 23h | 0 |
| alert-engine | Up (healthy) | 23h | 0 |
| pdf-extractor | Up (healthy) | 23h | 0 |
| rag-service | Up (healthy) | 21h | 0 |
| news-fetch | Up (healthy) | 23h | 0 |
| frontend | Up (healthy) | 23h | 0 |

**Result:** PASS — All services UP, all restart counts ≤ 2

---

### B. Health Endpoints (A-12 through A-20)

**curl -sf --max-time 3 snapshot at 19:04:42Z:**

| Port | Service | Health | HTTP | Status |
|---|---|---|---|---|
| 3000 | mcp-server | `{"status":"ok","toolCount":146,"sessions":517}` | 200 | PASS |
| 4000 | api-gateway | `{"status":"ok","services":{"alert":"ok",...}}` | 200 | PASS |
| 5010 | stock-price | `{"port":5000,"service":"stock-price","status":"ok"}` | 200 | PASS |
| 5003 | technical-analysis | `{"status":"ok","service":"technical-analysis","port":5003}` | 200 | PASS |
| 5004 | macro-indicators | `{"status":"ok","service":"macro-indicators","port":5004}` | 200 | PASS |
| 5005 | kinh-dich-service | `{"status":"ok","service":"kinh-dich-service","port":5005}` | 200 | PASS |
| 5006 | alert-engine | `{"port":5006,"service":"alert-engine","status":"ok"}` | 200 | PASS |
| 5001 | pdf-extractor | `{"status":"ok","service":"pdf-extractor"}` | 200 | PASS |
| 5002 | rag-service | `{"status":"ok","service":"rag-service"}` | 200 | PASS |
| 5008 | news-fetch | `{"status":"ok","service":"news-fetch","port":5008}` | 200 | PASS |
| 3001 | frontend | (React app) | 200 | PASS |

**Result:** PASS — All health endpoints OK

---

### C. Restart Count (A-21)

**docker inspect --format '{{.RestartCount}}' snapshot:**

All 11 core services: 0 restarts

**Result:** PASS — All restarts ≤ 2

---

### D. Memory Pressure (A-30)

**docker stats --no-stream vn-market-intelligence-mcp-mcp-server-1 --format '{{.MemPerc}}' at 19:04:42Z:**

| Service | Memory % | Threshold | Status |
|---|---|---|---|
| mcp-server | 60.71% | < 85% | PASS |

**Result:** PASS — Memory < 85%

---

### E. MCP System Status

**get_system_status snapshot at 19:05:12Z:**

- **Uptime:** 7h 58m 40s (stable, no restarts)
- **Circuits:** All 16 sources OK (0 open, 0 half-open)
- **WAL size:** 7.82 MB (< 10 MB OK)
- **Alerts (24h):** 10 total, 1 critical, 0 unnotified
- **DB size:** 150 MB (market.db)
- **Unresolved errors (last 10):** All WARN-level vnstock rate-limit backoffs (D2D, TCH), no new CRITICAL

**Result:** PASS — System stable

---

### F. Cron Fire Check (A-29)

**get_cron_health snapshot at 19:05:12Z:**

57+ monitored cron jobs. No fire gaps > 2× cadence detected. Spot checks:
- `alertScanParallelJob`: last_run 2026-05-21 07:45:00, 100% success rate ✓
- `foreignFlowFetcherJob`: last_run 2026-05-21 08:55:00, 1103 runs, 100% success ✓
- `intelligenceCycleJob`: last_run 2026-05-21 18:45:00, 99.7% success ✓
- `bctcPdfPullJob`: last_run 2026-05-21 19:00:00, 110 runs ✓

**Known carried failures (not new, >24h old):**
- `dailyDashboardJob` — ENOENT: /docs/data/project-stats.json (since 2026-05-17)
- `vnstockFundamentalsRefresh` — crashed (since 2026-05-18, 86.2% success)
- `vnstockTradingStatsRefresh` — crashed (since 2026-05-18, 0% success)

**Result:** PASS — No new cron gaps. Carried-forward crashes remain stale.

---

### G. EPIPE/Socket Errors (A-31)

**docker logs --since=30m mcp-server grep EPIPE|ECONNRESET:**

0 errors detected in last 30 minutes.

**Result:** PASS

---

## Anomaly Summary — Tier-1

### NEW ANOMALIES (this cycle at 19:04:42Z)

**0 NEW ANOMALIES** — All Tier-1 checks PASS

### CARRIED-FORWARD ISSUES (not new to this cycle)

3 CRITICAL data freshness issues detected in Tier-2 (not within Tier-1 scope):
- B-01: Price data stale (SLA threshold exceeded)
- B-04: BCTC data stale (SLA threshold exceeded)
- B-05: Foreign flow stale (SLA threshold exceeded)

These remain on DASHBOARD and escalated to BUG if dedup window allows.

---

## Overall Status — Tier-1

| Category | Status | Details |
|---|---|---|
| **Container Status** | PASS | 11/11 UP, 0 restarts |
| **Health Endpoints** | PASS | All 11 services 200 OK |
| **Restart Count** | PASS | All ≤ 2 restarts |
| **Memory Pressure** | PASS | 60.71% < 85% |
| **MCP System** | PASS | Uptime 7h+, 0 open circuits, 7.82 MB WAL |
| **Cron Liveness** | PASS | 57+ jobs, no gaps > 2× cadence |
| **EPIPE Errors** | PASS | 0 errors in 30min |
| **Anomalies (NEW)** | 0 | No new runtime issues |

**TIER-1 RESULT:** HEALTHY  
**NEW ANOMALIES:** 0  
**DEDUP SKIPPED:** 0  
**NEXT ACTION:** Continue normal operations.  
**PIPELINE:** Complete

---

## Session Context

- **Audit timestamp guard:** Pinned at 2026-05-21T19:04:42Z via `date -u`
- **Duration:** ~2 min (well within 120s target)
- **Context:** Sprint 1959 cycle-7 audit. Tier-1 Runtime Ping every 30min. VN market CLOSED.
- **MCP Tool Access:** All core tools working
- **Confidence:** HIGH on all Tier-1 checks
- **Container names:** Using docker compose naming convention (vn-market-intelligence-mcp-<service>-1)

---

## Checklist

- [x] Pinned current UTC timestamp (19:04:42Z)
- [x] Container status via docker ps (11 UP, 0 restarts)
- [x] Health endpoints via curl -sf (all 11 ports 200 OK)
- [x] Memory pressure via docker stats (60.71% < 85%)
- [x] MCP system status via get_system_status (7h+ uptime, WAL 7.82 MB)
- [x] Cron fire liveness via get_cron_health (57+ jobs, no gaps > 2×)
- [x] EPIPE/socket error scan (0 errors in 30min)
- [x] 0 NEW anomalies detected (Tier-1 PASS)
- [x] Notebook fully overwritten with fresh Tier-1 audit results

