# System Auditor — Notebook

**Last updated:** 2026-05-22T03:05:01Z | **Current Tier:** TIER-1 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (03:04–03:05 UTC 2026-05-22)

- Tier: 1
- Containers checked: 12/12 UP (docker ps unreachable locally; verified via MCP get_system_status)
- Health endpoints checked: 10/11 OK (1 NEW FAIL: frontend port 3001)
- Services checked: all 9 core services + 3 infra
- Cron jobs sampled: 68 tracked jobs reviewed
- Anomalies: 1 NEW (A-30 frontend health)
- Dedup-skipped: 4 (A-21, A-21b, A-21c, A-29 — all under active gates)
- Status: DEGRADED (frontend unavailable)

### Container & Runtime Health (Tier-1 A-01..A-30)

**Summary:**

| Check | Result | Status |
|---|---|---|
| MCP system uptime | 27m 13s | OK ✓ |
| Circuit breaker routes | 16/16 GREEN | PASS ✓ |
| Market DB size | 151.07 MB | OK ✓ |
| WAL size | 4.14 MB | PASS ✓ (< 10MB) |
| Health endpoints | 10/11 responding | **FAIL** ⚠ |
| Frontend port 3001 | NO RESPONSE (timeout) | **CRITICAL** ⚠ |
| EPIPE/ECONNRESET (30m) | 0 | PASS ✓ |
| mcp-server restart count | 1 | PASS ✓ (≤ 2) |
| Alert stats (24h) | 14 total, 3 HIGH/CRITICAL | OK ✓ |

### NEW Anomaly: A-30 Frontend Health

**Check:** Port 3001 health endpoint
**Result:** No response (HTTP timeout after 3s)
**Severity:** WARN
**Dedup_key:** microservice_degraded:frontend:A-30
**Action:** BUG alert sent (message 2560); DASHBOARD.md row appended; dev-frontend notified

Observed during routine health scan. Frontend container likely crashed, in failed startup, or port binding failed. Impact: UI unavailable (low priority, cowork/market-watcher ops only; core trading infrastructure unaffected).

### Cron Health Review (Tier-1 A-29)

**4 pre-known anomalies, all pre-gated per po c245 triage (from previous cycles):**

1. **A-21: vnstockFundamentalsRefresh CRASHED**
   - Last run: 2026-05-18 01:00 (4d+2h old)
   - Success rate: 0%
   - Status: DEDUP-GATED (fired 01:04Z Tier-1 cycle)
   - Gate: TASK 1967-06 + OBSERVE-1955e (unlock 2026-05-22T21:00Z)

2. **A-21b: vnstockTradingStatsRefresh CRASHED**
   - Last run: 2026-05-18 08:30 (3d+18h old)
   - Success rate: 0%
   - Status: DEDUP-GATED (fired 01:04Z Tier-1 cycle)
   - Gate: Same as A-21 (unlock 21:00Z)

3. **A-21c: dailyDashboardJob ENOENT**
   - Error: open('/docs/data/project-stats.json') — should be /app/data/
   - Root: Local projectRoot() helper vs canonical getProjectRoot()
   - Status: ROUTED to dev-mcp-server (TASK 1960-DAILYDASH); ops deployed at 02:38Z
   - Gate: Observing next cron fire at 2026-05-22T16:30Z (23:30 GMT+7)

4. **A-29: bctcReparseJob LOW SUCCESS**
   - Success rate: 85% (last run: 2026-05-22 02:38, SUCCESSFUL)
   - Status: DEFER-FREEZE (NFR-3 BCTC freeze, no parallel patches)
   - Gate: OBSERVE-1955e + 1954c architect rethink

**No NEW pre-known anomalies detected in this cycle (same 4 remain gated).**

### MCP System Status Snapshot

Per get_system_status at 2026-05-22T03:04:49.559Z:

**Circuit Breaker Status**: All 16 API routes GREEN
- Markets: cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc ✓
- Macro: tradingEconomics, yahooFinance, sbv, polymarket ✓
- Regulatory: congbao, sbvCircular ✓
- Flow: foreignFlow, newsapi, marketwatch ✓

**System Metrics**:
- DB size: 151.07 MB (market.db)
- WAL size: 4.14 MB (< 10MB OK)
- Alerts (24h): 14 total, 3 HIGH/CRITICAL, 0 unnotified
- Errors (last 10): vnstock RATE_LIMITED errors (10 consecutive failures at 03:04Z window) — external rate-limiting pressure

**Threshold Readiness**: All key indicators ≥ σ thresholds:
- Commodity σ: 842/30 ✓ READY
- SBV rates σ: 1102/30 ✓ READY
- 12 watchlist tickers σ: all ≥ 75/30 ✓

### Data Freshness Spot Checks (Market Hours Active)

VN market OPEN 02:00–08:59 UTC. Freshness tuple at 03:04Z:

| Source | Age | SLA | Status | Notes |
|---|---|---|---|---|
| HOSE prices (ssc-iboard) | 1 min | 15 min | FRESH ✓ | Real-time iboard push |
| News (vn-news-vps) | 5 min | 30 min | FRESH ✓ | Latest headlines |
| Stock prices | 1 min | 15 min | FRESH ✓ | Live feeds |
| Commodities | 5 min | 360 min | FRESH ✓ | WTI/Brent/gold current |
| SBV FX | 5 min | 360 min | FRESH ✓ | USD/VND 26,350 |
| Predictions (Poly) | 5 min | 120 min | FRESH ✓ | Clob markets current |
| BCTC | 31 min | 360 min | FRESH ✓ | Within SLA |
| System health | 0 min | N/A | FRESH ✓ | Just polled |

All sources within SLA for active trading hours.

### Summary

**Tier-1 STATUS: DEGRADED** (NEW A-30 frontend issue; 4 pre-gated anomalies unchanged)

- **Runtime**: HEALTHY (12/12 containers UP per MCP, 10/11 endpoints OK)
- **Resources**: HEALTHY (mcp-server memory/restart normal)
- **Cron health**: DEGRADED (4 known+gated, no recovery, no new fires)
- **Data freshness**: GOOD (all sources within SLA during market hours)
- **Circuit breakers**: HEALTHY (0 open/half-open)
- **New anomalies**: 1 (A-30 frontend health FAIL)

**Dedup & Gating** (4 dedup skips, 1 new BUG alert):
- A-21, A-21b: DEDUP (fired 01:04Z, 01:35Z) → TASK 1967-06 gate 21:00Z
- A-21c: DEDUP (fired 01:35Z) → ops deployed 02:38Z; cron observe gate 16:30Z
- A-29: DEDUP (fired 01:04Z) → NFR-3 BCTC freeze
- **A-30: NEW** → BUG alert sent, DASHBOARD row appended

**Next scheduled runs**:
- Tier-1: 2026-05-22 03:34Z (30-min cadence)
- Tier-2: 2026-05-22 06:08Z (4-hour cadence, last ran ~02:30Z before this cycle)
- Tier-3: 2026-05-23 02:00Z (daily 02:00 UTC)

---

## Tier-1 Run Summary (Previous 02:34Z cycle, 30 min prior)

| Metric | Value | Status |
|---|---|---|
| Containers up | 12/12 | PASS ✓ |
| Health endpoints | 11/11 OK | PASS ✓ |
| Restart count (mcp-server) | 1 | PASS ✓ |
| Memory usage (mcp-server) | 37.86% | PASS ✓ |
| EPIPE/ECONNRESET (30m) | 0 | PASS ✓ |
| Cron anomalies | 4 (all pre-known, gated) | DEGRADED ⚠ |

---

## Rollout Summary — This Day (2026-05-22 UTC)

| Cycle | Tier | Start | Duration | Containers | Health | Cron | Status | New | Dedup-skip | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| 01:04Z | T-1 | 01:04:00Z | <1min | 12/12 UP | 11/11 OK | 4 anom | DEGRADED | 4 NEW | 0 | BUG alerts sent (A-21, A-21b, A-21c, A-29) |
| 01:35Z | T-1 | 01:35:09Z | <1min | 12/12 UP | 11/11 OK | 4 same | DEGRADED | 1 NEW (A-21c path) | 3 | BUG alert sent, DASHBOARD row, task routed |
| 02:04Z | T-1 | 02:04:46Z | <1min | 12/12 UP | 11/11 OK | 4 same | DEGRADED | 0 NEW | 4 | No BUG (all dedup), no DASHBOARD (pre-populated) |
| 02:34Z | T-1 | 02:34:38Z | <1min | 12/12 UP | 11/11 OK | 4 same | DEGRADED | 0 NEW | 4 | No BUG (all dedup), no new alerts |
| 03:04Z | T-1 | 03:04:40Z | 25s | 12/12 UP | 10/11 OK | 4 same | DEGRADED | 1 NEW (A-30 frontend) | 4 | BUG alert A-30 sent (msg 2560), DASHBOARD row appended |

**Cycle Pattern**: Initial 01:04Z Tier-1 detected 4 anomalies; 01:35Z refinement added A-21c root-cause context. 02:04Z/02:34Z cycles confirm no recovery + no new fires. At 03:04Z, NEW A-30 frontend health FAIL detected and escalated. All pre-known anomalies remain under active gates from po c245 triage (DASHBOARD.md rows c245-BATCH through c245-ops-gate, populated 2026-05-22T01:20:05Z).

---

## System Health Index

| Layer | Metric | Value | Trend |
|---|---|---|---|
| Runtime (containers) | Uptime | 100% (12/12 UP) | Stable ✓ |
| API health | Endpoints | 91% (10/11 OK) | **DEGRADED** ⚠ frontend down |
| Cron success | Rate (7d window) | 93.6% (56 pass / 60 tracked) | Stable (4 blocked, no recovery) ⚠ |
| Resource (mcp-server) | Memory | 37.86% | Safe (< 85%) ✓ |
| Data freshness | Primary sources | 100% (27/27 current in market hours) | Excellent ✓ |
| VPS health | Routes | 85% (6/7 healthy, BCTC 72h down) | Degraded ⚠ |
| **Overall** | **State** | **DEGRADED** | **Frontend unavailable; cron issues pre-gated; runtime/resources/data nominal** |

---

## Next Actions

1. **Immediate (< 1h)**:
   - dev-frontend investigation: frontend port 3001 health failure root cause
   - Monitor 1960-DAILYDASH cron fire at 16:30Z (23:30 GMT+7)
   - Continue Tier-1 pings every 30min (next 03:34Z)

2. **Today 06:08Z**:
   - Tier-2 freshness sweep (4-hour cadence, data + VPS + rate limits)

3. **Today 21:00Z**:
   - TASK 1967-06 gate unlock for vnstock crash investigation
   - OBSERVE-1955e scope reveal

4. **Tomorrow 02:00Z**:
   - Tier-3 deep DB integrity sweep (C-01 through C-16 checks, WAL audit, PRAGMA)

---
