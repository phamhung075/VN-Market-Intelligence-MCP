# System Auditor — Notebook

**Last updated:** 2026-05-20 04:18 UTC | **Current Tier:** TIER-2 | **Sprint:** 1956

## Status Summary

**TIER-2 AUDIT CYCLE COMPLETE — DEGRADED**

Data freshness sweep detected 3 NEW critical/warn anomalies:
- **1 CRITICAL:** BCTC SLA breached (329 min vs 120 min, 2.74x over)
- **2 WARN:** BCTC VPS stale (21h, marked STALE), vn-news-fetch unhealthy

Plus 2 zombie cron rows persisting from prior cycle (vnstockFundamentalsRefresh, vnstockTradingStatsRefresh stuck running 20h+).

---

## Tier-2 Audit — 2026-05-20 04:18:02 UTC

**Scope:** Cron fire gaps, per-source fetch freshness, VPS proxy health, news/signal freshness.

### Cron Fire Check (A-29)
From get_cron_health():
- intelligenceCycleJob: running (last_run 04:15, gap 3m, OK)
- predictionMarketPollJob: last_run 03:00 (gap 1h 18m, OK)
- bctcReparseJob: last_run 2026-05-19 22:49:44 (success_rate 87.1%, OK)
- **vnstockFundamentalsRefresh: STUCK (running=true, last_run 2026-05-18 01:00, 27h+ elapsed, success_rate 0%)**
- **vnstockTradingStatsRefresh: STUCK (running=true, last_run 2026-05-18 08:30, 20h+ elapsed, success_rate 0%)**
- Foreign flow fallback: running normally (last 1min)
- **dailyDashboardJob: DEDUP-SKIPPED (known path error ENOENT /docs/data/project-stats.json, last run 2026-05-17, dedup key seen in 7d window)**

### Per-Source Fetch Freshness (B-01 through B-12)

**Price/VPS sources:**
- ssc-iboard: last push 2026-05-20 04:18:27Z (0 min age) — ✓ PASS
- foreign-flow: last push 2026-05-20 04:18:36Z (0 min age) — ✓ PASS
- yahoo-finance: last update within SLA — ✓ PASS

**News/VPS sources:**
- news-vps: ⚠ **WARN — service unhealthy (uptime 1h 1m, marked unhealthy in get_vps_service_health())**
- sbv-vps: last push 2026-05-20 03:58:27Z (OK) — ✓ PASS

**BCTC sources (critical):**
- **bctc-push: ⚠ WARN — VPS stale (last push 2026-05-19 07:05:07Z, 21.2h ago, marked STALE, only 1 push in 24h)**
- **bctc-discover: ✗ CRITICAL — SLA breached (329 min age vs 120 min SLA, 2.74x over). Last bctc update 2026-05-19 05:49Z (~5.5h ago)**

**Macro/indicators:**
- sbv: last_run 2026-05-18 16:00 (OK)
- macro indicator refresh: last_run 2026-05-17 23:00 (OK)

### VPS Proxy Health (B-06, B-07)

From get_vps_proxy_health():
- prices: ok (last push 04:18:27, 0 errors in 24h)
- news: ok (last push 04:18:00, 0 errors in 24h)
- sbv: ok (last push 03:58:27, 0 errors in 24h)
- **bctc: STALE (last push 2026-05-19 07:05:07, flagged STALE)**
- foreign-flow: ok (last push 04:18:36)

From get_vps_service_health():
- vn-bctc-fetch: healthy
- vn-foreign-flow: healthy
- **vn-news-fetch: UNHEALTHY (uptime 1h 1m)**
- vn-price-fetch: healthy
- vn-sbv-fetch: healthy
- Summary: 4 healthy, **1 unhealthy**

### Rate Limits (B-12)
From get_rate_limit_status():
- All 11 sources ready (0s wait)
- No source at 100% → ✓ PASS

### SLA Status (B-10)

From get_sla_status():
| Signal | Age | SLA | Status |
|---|---|---|---|
| price | 0 min | 10 min | ok |
| bctc | **329 min** | **120 min** | **BREACHED** |
| news | 0 min | 30 min | ok |
| sbv_fx | 4 min | 30 min | ok |
| foreign_flow | 0 min | 10 min | ok |

Summary: 4 ok, **1 BREACHED (CRITICAL)**

### DB Freshness Spot Checks (C-06, C-07)

Unable to execute docker exec sqlite3 queries (sqlite3 not in container), but get_alerts() shows:
- 100 alerts in last 7 days ✓ PASS (indicates news_articles + agent_signals active)

### Macro Snapshot
From get_macro_snapshot():
- DXY: 99.30 (USD STABLE)
- US 10Y: 4.67% (RISK-OFF)
- VND Spread: -0.33% (FII_OUTFLOW_RISK)
- Crude: 110.35 (energy sector positive)
- Gold: 4469.00 (risk-off signal)
- FX: USD/VND 26,329 (high pressure)

No anomalies in macro inputs.

---

## Anomaly Summary — Tier-2

**NEW ANOMALIES THIS CYCLE:**
- **C: BCTC SLA breached** (329/120 min, 2.74x over) — severity CRITICAL
- **W: BCTC VPS stale** (21h ago, marked STALE) — severity WARN
- **W: vn-news-fetch unhealthy** (VPS service down) — severity WARN

**Total NEW:** 3 (1 CRITICAL, 2 WARN)

**DEDUP-SKIPPED:**
- dailyDashboardJob ENOENT (path error, known from 2026-05-17 19:31, 7d window active)
- vnstockFundamentalsRefresh stuck (zombie row, known from 2026-05-19, OBSERVE-1955c gate 2026-05-25)
- vnstockTradingStatsRefresh stuck (zombie row, known from 2026-05-19, OBSERVE-1955d gate 2026-05-20)

**Dedup-skipped:** 3 (from prior 7d window)

---

## BUG Channel Escalation

All 3 new anomalies posted to BUG channel:
- Message 2511: B-05a BCTC VPS stale (WARN)
- Message 2512: B-08 vn-news-fetch unhealthy (WARN)
- Message 2513: B-10 BCTC SLA BREACHED (CRITICAL)

---

## Root Cause Hypothesis

**BCTC SLA Breach + VPS Stale Pattern:**
- Context: 1956 sprint closed 11/11 services healthy; cowork team silent 44h (unified-agent last fire 2026-05-18T04:08Z)
- Hypothesis: BCTC VPS connectivity issue or mcp-server fallback not triggering fresh fetches
- Related: task 1955a (dailyDashboardJob path fix), 1955b (zombie row cleanup), 1955c/d (vnstock gates)
- Impact: Financial report freshness degrading during Q1/Q2 earnings season

**vn-news-fetch Unhealthy:**
- Uptime 1h 1m suggests recent restart or recovery attempt
- May be transient (check next Tier-2 cycle in 4h)

---

## DASHBOARD Updates

Appended 3 new rows to docs/signals/DASHBOARD.md (ops section):
- 1956-B-10: BCTC SLA BREACHED (CRITICAL)
- 1956-B-05a: BCTC VPS stale (WARN)
- 1956-B-08: vn-news-fetch unhealthy (WARN)

---

## Operational Notes

- **Wall time:** ~30s (target: <300s) ✓
- **Tier-2 focus:** Data freshness, VPS health, SLA compliance
- **Next steps:**
  - **Ops/dev-mcp-server:** Investigate BCTC VPS connectivity; check mcp-server logs for fetch failures
  - **Ops/dev-vps-crawls:** Restart vn-news-fetch or investigate network latency
  - **PO:** Prioritize 1955a, 1955b, 1955c, 1955d for zombie row cleanup and BCTC fallback resilience
- **Next Tier-2 audit:** 08:00 UTC 2026-05-20 (in 3h 42m)
- **Next Tier-3 audit:** 02:00 UTC 2026-05-21

---

## Session Timeline

- 2026-05-19 20:07:54 UTC: CRITICAL OUTAGE (8 containers down)
- 2026-05-19 20:50:39 UTC: RECOVERY CONFIRMED
- 2026-05-19 21:02:34 UTC: Tier-1 steady state
- 2026-05-20 04:18:05 UTC: Tier-1 audit (HEALTHY, dedup-skipped known errors)
- **2026-05-20 04:18:02 UTC: Tier-2 audit (DEGRADED, 3 NEW data freshness anomalies)**
