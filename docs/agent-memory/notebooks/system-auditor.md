# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c390 · 2026-07-21T06:31:18Z
### Audit Run Tier-2 (06:30–06:31 UTC 2026-07-21)
- Tier: 2 | Cron fire check: A-29 PASS (no major gaps) | Sources checked: 27
- Per-source freshness: 25 PASS, 2 STALE (foreign-flow CRITICAL, vps-services WARN)
- VPS proxy health: 2/5 healthy (bctc-fetch, foreign-flow, price-fetch down) 
- BCTC SLA eval: healthy-idle (16.7h << 151h threshold, earnings-window OUT)
- DB freshness: C-06 PASS (2 messages 3h), C-07 PASS (343 signals 24h)
- BCTC URL shape B-09: PASS (0 SSC portal URLs) 
- Stale pending BCTC B-13: PASS (0 items > 72h)
- D-BCTC-EVAL: no snapshot changes
- D-IMPROVE: 0 candidates emitted
- Anomalies: 2 new (B-02 foreign-flow CRITICAL, B-06 VPS services WARN) | 0 dedup-skipped | Status: DEGRADED


