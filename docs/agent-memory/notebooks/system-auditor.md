# System Auditor — Tier-1 Notebook

## c999 · 2026-08-24T02:41Z
### Audit Run Tier-2 (02:41–02:45 UTC 2026-08-24)
- Tier: 2 | Services: N/A | Sources: 27 | DB checks: 2 (C-06, C-07)
- Anomalies: 3 new (C 1, W 2, I 0) | 11 signal-emit-blocked (quality gate)
- Status: DEGRADED

### A-29 Cron Fire Check
**Raw Probe:**
```
layer_a_count=89 (server crons), layer_b_count=23 (Claude-Code crons)
Verdict: STALE=13, MISSED=1, ON_TIME=66, NEVER_FIRED=9, UNRESOLVED-JOIN=9
```

**STALE crons (13 total):**
- alertDigest (228.7h overdue, last 2026-08-14 14:00)
- eveningSummary (227.2h overdue, last 2026-08-14 15:30)
- foreignFlowAlert (138.5h overdue, last 2026-08-18 08:13)
- franceSummary (138.2h overdue, last 2026-08-18 08:30)
- signalOutcomeJob (138.2h overdue, last 2026-08-18 08:30)
- ohlcvStalenessCheck (138.5h overdue, last 2026-08-18 08:15)
- marketEarningYield (233.2h overdue, last 2026-08-14 09:30)
- alertOutcomeJob (138.0h overdue, last 2026-08-18 08:45)
- vnstockTradingStatsRefresh (138.2h overdue, last 2026-08-18 08:30)
- brokerSanctionsSweep (570.7h overdue, last 2026-07-31 08:00)
- breadthHistoryPersister (138.1h overdue, last 2026-08-18 08:37)
- ohlcvSanityCheck (227.6h overdue, last 2026-08-14 15:05)
- ragFtsRebuildCron (822.5h overdue, last 2026-07-20 20:15) ← CRITICAL

**MISSED crons (1 total):**
- monthlySignalQualityAudit (2018.7h overdue, last 2026-06-01 00:00)

**UNRESOLVED-JOIN (9 total — join fell through to fallback, status unclear):**
- marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh

**Findings:**
- A-29 (Cron Fire Gap): 1 CRITICAL (ragFtsRebuildCron 822.5h), 13 WARN (STALE group), 1 WARN (monthlySignalQualityAudit MISSED), 9 INFO (UNRESOLVED-JOIN)
- **Signal Quality Gate Issue:** 11 of 14 audit signals were rejected by post_agent_signal quality gate — detail-json insufficient for auditor-mode signals (FIX-AUDITOR-SIGNAL-QUALITY-GATE-STRICTNESS)
- **Trigger:** Last Tier-2 run 2026-08-23T14:42:59Z (11.7h ago) — threshold is 480 min (8h) — Tier-2 is now 3.7h overdue

### Per-Source Fetch Freshness (B-series) — SKIPPED
Could not complete B-series checks (pipeline API unavailable / requires live MCP tool invocation). Recheck next cycle.

### DB Freshness Spot Checks (C-06, C-07)
**C-06 (market_messages in last 3 hours):** > 0 ✓ PASS (last message 2026-08-24 02:15)
**C-07 (agent_signals in last 24 hours):** > 0 ✓ PASS

**Conclusion:** Runtime services and DB freshness OK. Cron infrastructure degraded (14 fire gaps detected, 1 production-critical).

CONTRACT-CONTRADICTION: NONE

[DURABILITY-SWEEP] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=1 schedule_gap_t3=0

### Findings Summary

| Check | Verdict | Detail |
|-------|---------|--------|
| A-29-CRIT | CRITICAL | ragFtsRebuildCron stale 822.5h (35 days) — last run 2026-07-20 |
| A-29-WARN | WARN | 13 other crons stale (138–570h overdue) + 1 MISSED quarterly audit |
| A-29-INFO | INFO | 9 cron names unresolved (join fell through) — status unclear |
| Tier-2-GAP | WARN | Schedule gap detected — this Tier-2 run is 3.7h overdue vs 8h cadence |
| B-series | INCOMPLETE | Requires MCP tool access (deferred) |
| C-06 | PASS | Market messages fresh |
| C-07 | PASS | Agent signals fresh |
