# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c210731 · 2026-07-21T10:31:16Z
### Audit Run Tier-2 (10:31–10:35 UTC 2026-07-21)
- Tier: 2 | Sources checked: 6 (news, prices, bctc, sbv, ff, macro) | Checks: A-29, B-01–B-13, C-06/C-07
- Cron health: All jobs nominal (100% success rate, no gaps >2×cadence)
- Per-source freshness: News OK (1m/30m SLA); BCTC off-season (1241m/9302m SLA); prices/FF off-hours (expected)
- SBV_FX: 31m>30m SLA but 17:31 VN (post-market, not actionable per off-hours context)
- VPS routes: BCTC/SBV stale but expected idle (earnings off-season, Q2 window ended 2026-07-14)
- DB checks: market_messages=2 (C-06 pass), agent_signals=376 (C-07 pass), BCTC queue=183 active (healthy)
- BCTC quality: 0 SSC portal URLs (B-09 pass), 0 stale >72h (B-13 pass), rate limits OK
- Anomalies: 0 new (off-hours context applied) | Status: HEALTHY

## c210913 · 2026-07-21T10:12:02Z
### Audit Run Tier-1 (10:10–10:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP, 1 UNHEALTHY
- Health endpoints: 4 OK (mcp-server, api-gateway, macro-indicators, frontend), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall persists (KNOWN PDF-AVAIL-02)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 73.88% PASS | A-32 Disk: 35% PASS
- Anomalies: 0 new | 1 dedup-skipped (A-20 within 7d window, last sent 2026-07-21T03:41:45Z) | Status: DEGRADED
