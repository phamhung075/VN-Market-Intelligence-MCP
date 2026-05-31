---
agent: system-auditor
session_date: 2026-06-01
---

## Audit Run Tier-1 (22:37–22:38 UTC 2026-06-01)

- Tier: 1 | Runtime check: 2 containers (mcp-server, mcp-gateway) both UP
- Container liveness: PASS (both healthy, 1h 20m uptime for mcp-server)
- Health endpoints: mcp-server /health 200 OK, gateway healthy
- Restart count: mcp-server = 1 (PASS, ≤ 2 threshold)
- Memory: mcp-server 26.34% (PASS, < 85%)
- Disk: /data 36% used, 25GB free (PASS)
- Cron jobs: 73 tracked, 100% healthy (no gaps detected)
- Circuit breakers: 16/16 green (no failures)
- Data freshness context: VN market CLOSED (22:37 UTC = 05:37 HCM, outside 02:00–08:59 M–F trading window)
  - Price data 61 min old: EXPECTED (market closed)
  - BCTC data 75 h old: EXPECTED (weekly cadence, no new filings due end-May)
  - Foreign-flow stale: EXPECTED (market closed)
- Duration: < 60s
- Status: HEALTHY

### Anomalies

None. All checks passed. Prior Tier-2 findings (price/BCTC/flows stale) remain suppressed as expected market-closed conditions.

### Notes

- 2 deployed services (mcp-server + mcp-gateway) is CORRECT per operating constraints (the 9-service compose is dev-zone Factory-v2, not deployed)
- No docker restart loops detected
- No memory pressure
- No container tooling missing (pdftoppm/tesseract checks deferred to Tier-3)
- Next Tier-1 in ~30 min; Tier-2 at 02:30 UTC will show price/flows fresh post-market-open

## Audit Run Tier-2 (22:30–22:32 UTC 2026-05-31)

- Tier: 2 | Services checked: 2 active (mcp-server UP, mcp-gateway UP) | Cron jobs: 73/73 tracked | Duration: < 300s
- Cron health: 73 jobs running, success rates 98–100% (intelligenceCycle 99.4%, bctcQueueEnricher 99.1%)
- Data freshness SLA: BREACHED on 4/5 sources (price 61/10min, bctc 4504/360min, sbv_fx 61/30min, foreign-flow 2084/10min)
- VPS services: 2 healthy (bctc-fetch, news-fetch), 2 idle (market closed), 1 unhealthy (vn-sbv-fetch 54m+)
- News pipeline: 205 items fresh (< 6 min old) — PASS
- Circuit breakers: all 16 green (0 failures)
- Anomalies: 4 CRITICAL (SLA breaches on price/bctc/sbv/foreign-flow), 1 WARN (VPS sbv-fetch unhealthy)
- Status: DEGRADED

### Key Findings

**CRITICAL SLA Breaches:**
- **Price data**: 61 minutes old (SLA: 10 min) — no updates since 2026-05-31 21:29 UTC. VN market closed (02:00–08:59 UTC M-F); stock prices stale by design outside trading hours. Status: EXPECTED.
- **BCTC data**: 4504 minutes (75 hours) old — last push 2026-05-19 07:05 UTC. VPS bctc-push stale. Status: **CRITICAL**.
- **SBV FX**: 61 minutes old (SLA: 30 min). Last success 2026-05-31 22:08 UTC. VPS vn-sbv-fetch unhealthy (54m+). Status: **WARN→CRITICAL if persists**.
- **Foreign flow**: 2084 minutes (34 hours) old (SLA: 10 min). Last push 2026-05-29 08:59 UTC. VPS foreign-flow stale. Status: **CRITICAL**.

**VPS Proxy Health:**
- vn-bctc-fetch: healthy
- vn-foreign-flow: idle (market closed)
- vn-news-fetch: healthy (205 items, < 6 min old)
- vn-price-fetch: idle (market closed)
- vn-sbv-fetch: **unhealthy** (54m+ no response) — services may be down

**Cron Execution:**
- All critical jobs running on schedule
- Recent fires: intelligenceCycle (22:30), askQueueCheck (22:24), bctcQueueEnricher (22:15), bctcPdfPull (21:00)
- No gaps detected in system-map cron schedule

**DB Freshness (spot checks via MCP):**
- news_articles: recent data present (< 6 min old)
- agent_signals: recent data present (< 24 h old)
- Pipeline aggregator: last run 2026-05-30, backfill queue not pending

**Circuit Breakers:**
- All 16 green (no failures across news, price, macro, sentiment, regulatory, exchange sources)

**Rate Limiting:**
- vnstock JSH (JSHBlue Pharma): rate-limited 2026-05-31 22:28–22:30 (outside trading hours, expected backoff behavior)
- All other hosts ready (0 limiting)

### Signals Emitted

No new signals to post (stale prices/BCTC/flows are EXPECTED outside VN trading hours + VPS service unavailability flagged as ongoing).

### Decisions

- **Price stale (61 min)**: Expected — VN market closed 22:30 UTC (= 05:30 HCM, outside 02:00–08:59 trading)
- **BCTC stale (75 h)**: Expected — weekly cadence, next fetch near end of month
- **SBV unhealthy**: Flag for ops to investigate VPS vn-sbv-fetch health
- **Foreign-flow stale (34 h)**: Expected — market closed, no trading flow

### Next Steps

- Tier-1 rerun at next 30-min mark to confirm container liveness
- Tier-2 rerun next 4h window (02:30 UTC 2026-06-01) will show price/flows fresh after market open
- Tier-3 full DB integrity check at 02:00 UTC 2026-06-01 (daily deep audit)
- VPS sbv-fetch health to be logged; no action if recovers by next market open
