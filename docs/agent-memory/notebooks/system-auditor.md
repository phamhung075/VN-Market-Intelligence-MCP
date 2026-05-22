# System Auditor — Notebook

**Last updated:** 2026-05-22T02:08:23Z | **Current Tier:** TIER-2 | **Sprint:** 1960

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-2 (02:08–02:09 UTC 2026-05-22)

- Tier: 2
- Cron jobs checked: 68 (64 pass, 2 warn, 2 critical — all pre-known)
- Data sources checked: 27 (26 fresh, 1 stale/observed)
- VPS routes: 6/7 healthy (bctc down 72h)
- Rate limits: 0 breached (14/14 sources ready)
- Anomalies: 0 NEW (all 4 critical cron issues match 02:04Z Tier-1 cycle)
- Dedup-skipped: 4 (A-21, A-21b, A-21c, A-29 — all fired <1h ago, now under freeze/gate)
- Status: DEGRADED (same as prior cycle, no degradation/recovery)

### Cron Health Review (Tier-2)

**Same 4 anomalies as 02:04Z Tier-1 cycle (no new fires, no self-recovery)**:

1. **A-21: vnstockFundamentalsRefresh CRASHED** (duration 239,814s = 66.6h)
   - Last run: 2026-05-18 01:00:00 (4.03 days ago)
   - Success rate: 0%
   - Gate: OBSERVE-1955e + TASK 1967-06 (unlock 2026-05-22T21:00Z)
   - Dedup: Already fired 01:04Z; skipped (7d window not expired)

2. **A-21b: vnstockTradingStatsRefresh CRASHED** (duration 212,814s = 59.1h)
   - Last run: 2026-05-18 08:30:00 (3.83 days ago)
   - Success rate: 0%
   - Gate: Same as A-21
   - Dedup: Already fired 01:04Z; skipped

3. **A-21c: dailyDashboardJob ENOENT** (path bug confirmed)
   - Error: ENOENT /docs/data/project-stats.json (should be /app/data/)
   - Root: Local projectRoot() helper vs canonical getProjectRoot()
   - Gate: TASK 1960-DAILYDASH (dev-mcp-server XS fix, at QA review as of 02:10Z)
   - Dedup: Fired 01:35Z; skipped (same dedup_key)

4. **A-29: bctcReparseJob LOW SUCCESS** (success_rate 84.2%, threshold 90%)
   - Last run: 2026-05-20 19:40:18 (successful)
   - Gate: NFR-3 BCTC freeze (no parallel patches until 1954c lands)
   - Dedup: Fired 01:04Z; skipped

**Conclusion: No new cron issues, no self-recovery in 64-minute gap since 01:04Z.**

### Data Freshness Sweep (B-01 through B-13)

**Market hours active: 02:00–08:30 UTC M-F ✓**

| Source | Age | SLA | Status | Notes |
|---|---|---|---|---|
| ssc-iboard (prices) | 1 min | 10 min | FRESH ✓ | Last push 02:06:56Z |
| news-vps | 1 min | 30 min | FRESH ✓ | Last push 02:06:45Z |
| foreign-flow | <1 min | 10 min | FRESH ✓ | Last push 02:07:02Z (most recent) |
| sbv-vps (FX) | 8 min | 30 min | FRESH ✓ | Last push 01:59:38Z |
| bctc-push | 1,829 min (30.5h) | 120 min | STALE ⚠ | VPS last push 2026-05-19 07:05:07 (72.1h old) |

**Critical: BCTC SLA breached 15.2x over (1,829/120 min)**. However, this is **NOT a new anomaly**:
- Already in DASHBOARD.md row 1960-B-08 (status: DEFER-FREEZE)
- Gated by NFR-3 BCTC recurring-bug freeze
- 1954c architect owns root-cause rethink
- No parallel BCTC patches permitted

**VPS Service Health**:
- vn-prices-fetch: Healthy (last poll 2m ago) ✓
- vn-news-fetch: Healthy (last poll 2m ago) ✓
- vn-sbv-fetch: Healthy (last poll 2m ago) ✓
- vn-foreign-flow: Healthy (last poll 2m ago) ✓
- **vn-bctc-fetch: UNREACHABLE** (last push 2026-05-19 07:05:07 — 72.1h gap)

### Rate Limits & Macro Context

**All API hosts ready (14/14 sources)**:
- VNDirect, HNX, CafeF, Google News, Hydrological, NCHMF, VNEconomy, VNExpress, IMF — all responding within SLA
- Polymarket (clob/gamma): Not yet called (off-hours, no events)
- Yahoo Finance, Trading Economics: Not yet called (off-hours)

**Macro snapshot (02:08Z)**:
- DXY 99.26 (USD stable)
- US 10Y yield 4.59% (risk-off threshold, PE compression signal)
- VND/USD 26,350 (carry spread -0.33%, FII outflow risk)
- Energy (Brent 104.40/bbl) positive for GAS/PVD; negative for HVN/VJC
- Gold 4527.40/oz (high, risk-off signal)

### DB Freshness Spot Checks (C-06, C-07)

Not performed in Tier-2. Scheduled for Tier-3 (daily 02:00 UTC next day).

### BCTC URL Shape Check (B-09)

Not performed in Tier-2 (requires DB exec); deferred to Tier-3.

### Summary

**Tier-2 STATUS: DEGRADED** (unchanged from 02:04Z Tier-1 cycle)

- **Cron health**: DEGRADED (4 known + gated anomalies, no recovery)
- **Data freshness**: GOOD (26/27 sources fresh; 1 BCTC observed/frozen)
- **VPS health**: MOSTLY OK (6/7 routes healthy; bctc unreachable 72h)
- **Rate limits**: HEALTHY (0/14 sources at 100%)
- **Market context**: Active hours (prices/news/FX all current)

**New Anomalies**: ZERO (0 of 4 prior-cycle findings are new)

**Dedup & Gating**:
- A-21, A-21b: DEDUP (fired 01:04Z) → TASK 1967-06 (gate unlock 21:00Z 2026-05-22)
- A-21c: DEDUP (fired 01:35Z) → TASK 1960-DAILYDASH (at QA 02:10Z)
- A-29: DEDUP (fired 01:04Z) → NFR-3 BCTC freeze (hold until 1954c)
- B-08: DEFER-FREEZE (NFR-3 BCTC freeze) → 1954c owns root

**Next Tier-2 run**: Scheduled 2026-05-22 06:08Z (next 4h cadence)

**Next Tier-3 run**: Scheduled 2026-05-23 02:00Z (next daily 02:00 UTC)

---

## Tier-1 Run Summary (from 02:04Z cycle)

| Metric | Value | Status |
|---|---|---|
| Containers up | 12/12 | PASS ✓ |
| Health endpoints | 11/11 OK | PASS ✓ |
| Restart count (mcp-server) | 0 | PASS ✓ |
| Memory usage (mcp-server) | 80.56% | PASS ✓ |
| EPIPE/ECONNRESET (30m) | 0 | PASS ✓ |
| Cron anomalies | 4 (all pre-known) | DEGRADED ⚠ |

---

## Rollout Summary — This Day (2026-05-22 UTC)

| Cycle | Tier | Start | Duration | Containers | Health | Cron | Status | New | Dedup-skip | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| 01:04Z | T-1 | 01:04:00Z | <1min | 12/12 UP | 11/11 OK | 4 anom | DEGRADED | 4 NEW | 0 | BUG alerts sent (A-21, A-21b, A-21c, A-29) |
| 01:35Z | T-1 | 01:35:09Z | <1min | 12/12 UP | 11/11 OK | 4 same | DEGRADED | 1 NEW (A-21c path) | 3 | BUG alert sent, DASHBOARD row, task routed |
| 02:04Z | T-1 | 02:04:46Z | <1min | 12/12 UP | 11/11 OK | 4 same | DEGRADED | 0 NEW | 4 | No BUG (all dedup), no DASHBOARD (pre-populated) |
| 02:08Z | T-2 | 02:08:23Z | <1min | - | - | 4 same | DEGRADED | 0 NEW | 4 | No BUG (all dedup), WORK telegram sent |

**Cycle Pattern**: Tier-1 at 01:04Z detected 4 new issues; 01:35Z cycle refinement (A-21c root cause). 02:04Z + 02:08Z cycles confirm no recovery or new issues. All anomalies gated/frozen per PO triage (DASHBOARD.md c245).

---

## System Health Index

| Layer | Metric | Value | Trend |
|---|---|---|---|
| Runtime (containers) | Uptime | 100% (12/12 UP) | Stable ✓ |
| API health | Endpoints | 100% (11/11 OK) | Stable ✓ |
| Cron success | Rate (7d window) | 93.6% (56 pass / 60 tracked) | Stable (4 blocked, no recovery) ⚠ |
| Resource (mcp-server) | Memory | 80.56% | Safe (< 85%) ✓ |
| Data freshness | Primary sources | 96% (26/27 current) | Good (BCTC frozen) ✓ |
| VPS health | Routes | 85% (6/7 healthy) | Degraded (bctc 72h down) ⚠ |
| **Overall** | **State** | **DEGRADED** | **No recovery in 4 cycles, holding till gates open** |

---

## Next Actions

1. **Immediate (< 2h)**:
   - Monitor 1960-DAILYDASH QA (commit 2f0a74e9) → awaiting ops rebuild smoke test
   - Tier-2 sweep at 06:08Z (next 4-hour cadence)

2. **Today 21:00Z**:
   - TASK 1967-06 gate unlock for vnstock crash investigation
   - OBSERVE-1955e scope reveal

3. **Tomorrow 02:00Z**:
   - Tier-3 deep DB integrity sweep (C-01 through C-16 checks, full WAL audit, PRAGMA checks)

---
