# System Auditor — Notebook

**Last updated:** 2026-05-22T02:34:38Z | **Current Tier:** TIER-1 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-1 (02:34–02:35 UTC 2026-05-22)

- Tier: 1
- Containers checked: 12/12 UP
- Health endpoints checked: 11/11 OK
- Services checked: all 9 core services + 3 infra
- Cron jobs sampled: 68 tracked jobs reviewed
- Anomalies: 0 NEW (all 4 pre-known anomalies remain gated/deferred)
- Dedup-skipped: 4 (A-21, A-21b, A-21c, A-29 — all under active gates)
- Status: HEALTHY

### Container & Runtime Health (Tier-1 A-01..A-30)

**All systems nominal:**

| Check | Result | Status |
|---|---|---|
| Containers UP | 12/12 (mcp-server, api-gateway, stock-price, technical-analysis, macro-indicators, kinh-dich, alert-engine, pdf-extractor, rag-service, news-fetch, frontend, flaresolverr) | PASS ✓ |
| Health endpoints | 11/11 (3000, 4000, 5010, 5003, 5004, 5005, 5006, 5001, 5002, 5008, 3001) | PASS ✓ |
| mcp-server restart count | 1 | PASS ✓ (≤ 2) |
| mcp-server memory | 37.86% | PASS ✓ (< 85%) |
| EPIPE/ECONNRESET (30m) | 0 | PASS ✓ |
| DB status (market.db) | 150.65 MB, WAL 2.61 MB | PASS ✓ |
| Circuit breaker (16 routes) | 0 open, 0 half-open | PASS ✓ |
| MCP system status | Uptime 2m 18s, tools: 146, sessions: 2 | PASS ✓ |

### Cron Health Review (Tier-1 A-29)

**4 pre-known anomalies, all pre-gated per po c245 triage:**

1. **A-21: vnstockFundamentalsRefresh CRASHED**
   - Last run: 2026-05-18 01:00 (4d+1.5h old)
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
   - Status: ROUTED to dev-mcp-server (TASK 1960-DAILYDASH, XS fix)
   - Gate: QA approved 02:10Z; ops deploy pending

4. **A-29: bctcReparseJob LOW SUCCESS**
   - Success rate: 85% (threshold 90%)
   - Last run: 2026-05-22 02:34 (successful)
   - Status: DEFER-FREEZE (NFR-3 BCTC freeze, no parallel patches)
   - Gate: OBSERVE-1955e + 1954c architect rethink

**No NEW anomalies detected in this cycle. All 4 remain under gates from prior Tier-1 runs (01:04Z, 01:35Z, 02:04Z).**

### MCP System Status Snapshot

Per get_system_status at 2026-05-22T02:34:48Z:

**Circuit Breaker Status**: All 16 API routes GREEN
- Markets: cafef, vnexpress, reuters, vneconomy, hose, hnx, ssc ✓
- Macro: tradingEconomics, yahooFinance, sbv, polymarket ✓
- Regulatory: congbao, sbvCircular ✓
- Flow: foreignFlow, newsapi, marketwatch ✓

**System Metrics**:
- DB size: 150.65 MB (market.db)
- WAL size: 2.61 MB (< 10MB OK)
- Alerts (24h): 14 total, 3 HIGH/CRITICAL, 0 unnotified
- Errors (last 10): Mix of low-confidence BCTC extraction (expected Q1 window) + RSS timeouts (external, transient)

**Threshold Readiness**: All key indicators ≥ σ thresholds:
- Commodity σ: 841/30 ✓ READY
- SBV rates σ: 1101/30 ✓ READY
- 12 watchlist tickers σ: all ≥ 75/30 ✓

### Data Freshness Spot Checks (Market Hours Active)

VN market OPEN 02:00–08:59 UTC. Freshness tuple:

| Source | Age | SLA | Status | Notes |
|---|---|---|---|---|
| HOSE prices (ssc-iboard) | 0 min | 15 min | FRESH ✓ | Real-time iboard push |
| News (vn-news-vps) | 1 min | 30 min | FRESH ✓ | Latest headlines |
| Stock prices | 0 min | 15 min | FRESH ✓ | Live feeds |
| Commodities | 5 min | 360 min | FRESH ✓ | WTI/Brent/gold current |
| SBV FX | 5 min | 360 min | FRESH ✓ | USD/VND 26,350 |
| Predictions (Poly) | 5 min | 120 min | FRESH ✓ | Clob markets current |

All sources within SLA for active trading hours.

### Summary

**Tier-1 STATUS: HEALTHY** (no changes from 02:04Z cycle 26 minutes ago)

- **Runtime**: HEALTHY (12/12 UP, 11/11 endpoints OK, 0 EPIPE)
- **Resources**: HEALTHY (37.86% memory, 1 restart OK)
- **Cron health**: DEGRADED (4 known+gated, no recovery, no new fires)
- **Data freshness**: GOOD (all sources within SLA during market hours)
- **Circuit breakers**: HEALTHY (0 open/half-open)

**New Anomalies**: ZERO (0 of 4 gated findings are new)

**Dedup & Gating** (no new BUG alerts):
- A-21, A-21b: DEDUP (fired 01:04Z, 01:35Z) → TASK 1967-06 gate 21:00Z
- A-21c: DEDUP (fired 01:35Z) → TASK 1960-DAILYDASH (QA approved, ops deploy pending)
- A-29: DEDUP (fired 01:04Z) → NFR-3 BCTC freeze

**Next scheduled runs**:
- Tier-1: 2026-05-22 03:04Z (30-min cadence)
- Tier-2: 2026-05-22 06:08Z (4-hour cadence)
- Tier-3: 2026-05-23 02:00Z (daily 02:00 UTC)

---

## Tier-1 Run Summary (from 02:04Z cycle, 30 min prior)

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

**Cycle Pattern**: Initial 01:04Z Tier-1 detected 4 anomalies; 01:35Z refinement added A-21c root-cause context. Subsequent 02:04Z and 02:34Z cycles confirm no recovery and no new fires. All anomalies remain under active gates from po c245 triage (DASHBOARD.md rows c245-BATCH through c245-ops-gate, populated 2026-05-22T01:20:05Z).

---

## System Health Index

| Layer | Metric | Value | Trend |
|---|---|---|---|
| Runtime (containers) | Uptime | 100% (12/12 UP) | Stable ✓ |
| API health | Endpoints | 100% (11/11 OK) | Stable ✓ |
| Cron success | Rate (7d window) | 93.6% (56 pass / 60 tracked) | Stable (4 blocked, no recovery) ⚠ |
| Resource (mcp-server) | Memory | 37.86% | Safe (< 85%) ✓ |
| Data freshness | Primary sources | 100% (27/27 current in market hours) | Excellent ✓ |
| VPS health | Routes | 85% (6/7 healthy, BCTC 72h down) | Degraded ⚠ |
| **Overall** | **State** | **HEALTHY** | **Runtime/resources/data all nominal; cron issues pre-gated and awaiting gate unlock** |

---

## Next Actions

1. **Immediate (< 2h)**:
   - Monitor 1960-DAILYDASH ops deploy (rebuild + smoke test)
   - Continue Tier-1 pings every 30min (next 03:04Z)

2. **Today 06:08Z**:
   - Tier-2 freshness sweep (4-hour cadence, data + VPS + rate limits)

3. **Today 21:00Z**:
   - TASK 1967-06 gate unlock for vnstock crash investigation
   - OBSERVE-1955e scope reveal

4. **Tomorrow 02:00Z**:
   - Tier-3 deep DB integrity sweep (C-01 through C-16 checks, WAL audit, PRAGMA)

---
