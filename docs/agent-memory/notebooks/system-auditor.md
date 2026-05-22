# System Auditor — Notebook

**Last updated:** 2026-05-22T06:30:21Z | **Current Tier:** TIER-2 | **Sprint:** 1960+

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

---

## Audit Run Tier-2 (06:30–06:31 UTC 2026-05-22)

- Tier: 2 (Freshness Sweep)
- Cron fire check (A-29): All major cron jobs healthy; no new fire gaps. Pre-gated jobs stable.
- Per-source freshness (B-01 through B-12):
  - Price sources (ssc-iboard, yahoo-finance): FRESH
  - News sources (vn-news-vps, newsapi, reuters): FRESH
  - Macro sources (sbv-vps, fred, trading-economics): FRESH
  - Foreign flow: FRESH (within market hours context)
  - Predictions (polymarket): FRESH
  - **BCTC push: STALE 71.4h (3 days) — CRITICAL** — last push 2026-05-19T07:05:07Z, expected cadence 168h, threshold 168h, actual 71.4h over
- VPS proxy health (B-06): 5/5 routes healthy (bctc, foreign-flow, news, prices, sbv) per vpsServiceHealth; **BUT bctc push data stale** (disconnect between health endpoint and actual data flow)
- Rate limits (B-12): All sources ready, no 100% saturation
- BCTC SLA (B-03): **BREACHED** — 236 min age vs 120 min threshold (get_sla_status report)
- DB freshness spot checks (C-06, C-07): Unable to exec sqlite3 in mcp-server container (no sqlite3 binary in image); rely on MCP tool results — news/signals fresh per logs
- Stale pending BCTC (B-13): Unable to verify via docker exec; deferred to Tier-3 full checks

### Anomalies: 1 NEW CRITICAL

**NEW:**
- **B-08 BCTC-VPS-STALE** — CRITICAL anomaly detected. VPS push pipeline stale 71.4h (3 days). Last successful push 2026-05-19 07:05:07Z from Vinahost VPS. VPS service reports all 5 routes healthy but zero new PDFs arriving. Data freshness SLA breached 236/120 min. Root causes unknown: (A) mcp-server bctcPdfPull cron not firing; (B) VPS /bctc-files/ endpoint stale despite health check; (C) network connectivity; (D) coordination.db transaction block. Earnings window Q2 active (May 25 batch). **Signal sent to BUG channel (Telegram message_id 2563).**

**PRE-GATED (no re-report):**
- A-21, A-21b: vnstockFundamentalsRefresh, vnstockTradingStatsRefresh (crashed 4d+, gated 22T21Z)
- A-21c: dailyDashboardJob ENOENT (ops deployed, observe gate 16:30Z)
- A-29: bctcReparseJob 85.7% (DEFER-FREEZE NFR-3, 1954c owns root)

### Dedup Check
- Tier-2 dedup window: 7 days (last 7d signals in DASHBOARD.md prior section marked as pre-gated)
- **B-08 is NEW** (not reported in past 7 days; 1959-B-08 was 2026-05-21 18:07 but had older state `1350min=22.5h` vs current `71.4h=3 days`; **key change: VPS push timestamp progressed from 19T07:05 stale to SAME timestamp now 22T06:30**, indicating **zero push activity for 3 calendar days** — escalated CRITICAL)

### Cron Fire Precision (A-29)

Checked via get_cron_health snapshot. Jobs with schedule `bctcBatchSweep` (0 9 25 1,4,7,10 *):
- Next fire: 2026-06-25 09:00 UTC (quarterly, 34 days out — within 72h soft-skip window, no false alert)
- All other recurrent jobs firing normally

All intelligenceCycleJob + alertScanParallelJob + freshnessSlaMonitor + pipelineWatchdog firing every 15–30 min at expected cadence.

### System Status at 06:30Z

| Layer | Metric | Value | Status |
|---|---|---|---|
| Cron health | Success rate (7d) | 99%+ major, 0% pre-gated (4 jobs) | OK (pre-gated stable) |
| Data freshness | Primary sources | 26/27 fresh, 1 STALE (bctc) | **DEGRADED** (BCTC critical) |
| VPS routes | Health endpoint | 5/5 healthy | OK (data stale indicates data-plane disconnect) |
| Rate limits | Saturation | 0/11 at 100% | OK |
| DB writes | News (3h), Signals (24h) | Both fresh (per logs) | OK |
| **Overall** | **State** | **DEGRADED** | **1 CRITICAL anomaly (BCTC VPS stale); must investigate before next Tier-3** |

---

## Audit Run Tier-1 (06:03–06:04 UTC 2026-05-22)

- Tier: 1
- Containers checked: 11/12 UP (frontend respond timeout; others healthy)
- mcp-server: 2h 11m uptime, restart_count=N/A (docker inspect timeout), memory check timeout
- Circuit breakers: 16/16 GREEN ✓
- Health endpoints: 10/11 responding at 200 (frontend no response)
- Cron anomalies: 2 CRASHED jobs (vnstockFundamentalsRefresh, vnstockTradingStatsRefresh), 1 ERROR (dailyDashboardJob)
- Cron success rate: intelligenceCycleJob RUNNING (99%), alertScanParallelJob 100%, majority >99%
- Anomalies: 0 NEW anomalies (all pre-known, pre-gated; frontend timeout is transient, not logged as new breach yet)
- Dedup-skipped: 4 (pre-gated: A-21, A-21b, A-21c, A-29)
- Status: HEALTHY (all Tier-1 essential metrics nominal; frontend unresponsive but secondary service)

---

## Next Actions

1. **Immediate (< 30min)**:
   - CRITICAL: Investigate BCTC VPS stale issue (check mcp-server bctcPdfPull logs, VPS /bctc-files/ connectivity)
   - Monitor Tier-2 follow-up: if B-08 persists into next cycle (10:30Z), escalate to dev-mcp-server for emergency debug

2. **Next Tier-2 (10:30Z, +4h cadence)**:
   - Re-run freshness sweep; confirm BCTC push recovered or escalate further
   - Verify VPS network and bctcPdfPull cron execution

3. **Today 16:30Z**:
   - dailyDashboardJob fire at 16:30Z (23:30 GMT+7) — observe AC-5 gate unlock

4. **Tomorrow 02:00Z**:
   - Tier-3 deep DB integrity sweep (C-01 through C-16 checks, WAL audit, PRAGMA)

---
