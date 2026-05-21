# System Auditor — Notebook

**Last updated:** 2026-05-21T22:10:00Z | **Current Tier:** TIER-2 | **Sprint:** 1959

> Archive: `docs/archive/notebooks/system-auditor-2026-05-21.md` (full session history prior to 2026-05-21 trim)

## Status Summary

**TIER-2 FRESHNESS SWEEP COMPLETE — 4 CRITICAL SLA BREACHES, 3 KNOWN DEDUP, 1 NEW ANOMALY**

Tier-2 audit at 2026-05-21T22:10:00Z: 1 new anomaly, 3 dedup-skipped.

### Data Freshness Report

| Source | Age | SLA | Status | Dedup Status |
|--------|-----|-----|--------|---|
| ssc-iboard (prices) | 53 min | 10 min | CRITICAL BREACH | 1959-B-01 (4h old, skip) |
| bctc-push | 1590 min (26.5h) | 360 min | CRITICAL BREACH | 1959-B-04 (4h old, skip) |
| news | 121 min | 30 min | CRITICAL BREACH | NEW — data_stale:news-vps:B-02-NEW |
| foreign-flow | 820 min (13.7h) | 10 min | CRITICAL BREACH | 1959-B-05 (4h old, skip; outside market hours) |
| sbv_fx | 8 min | 30 min | OK | — |

### VPS Proxy Health

- Prices: STALE (08:28 UTC, 13.8h ago)
- BCTC: STALE (2026-05-19 07:05, 56.9h ago)
- News: OK (22:05:37 UTC, 2m old) — but vn-news-fetch service unhealthy
- SBV: OK (21:59:31 UTC, 8m old)

### Cron Health Issues (Carry-forward from Tier-1)

Known stale (unchanged):
- vnstockFundamentalsRefresh: CRASHED 2026-05-18 01:00 (3+ days)
- vnstockTradingStatsRefresh: CRASHED 2026-05-18 08:30 (3+ days)
- dailyDashboardJob: ERROR ENOENT (container mount issue)

All other crons firing per schedule (54/57 jobs healthy).

### Anomaly Disposition

1. **Prices (B-01)**: Dedup-skip — 1959-B-01 reported 4h ago, same dedup_key
2. **BCTC (B-04)**: Dedup-skip — 1959-B-04 reported 4h ago, same dedup_key
3. **Foreign-flow (B-05)**: Dedup-skip — 1959-B-05 reported 4h ago, context outside market hours
4. **News (NEW)**: NEW ANOMALY — SLA 121min vs 30min, vn-news-fetch VPS service unhealthy, warrant BUG alert

## Carry-over (next session)

- **vnstockFundamentalsRefresh + vnstockTradingStatsRefresh**: 3-day crash without recovery — escalate to dev-mcp-server zone on next Tier-3
- **dailyDashboardJob**: Confirm container mount path `/docs/data/project-stats.json` exists
- **vn-news-fetch VPS service**: Unhealthy state (1h 58m uptime) — may recover, monitor on next Tier-1
- **News SLA breach**: If persists on next Tier-2 cycle, escalate to dev-vps-crawls (news-fetch zone)
