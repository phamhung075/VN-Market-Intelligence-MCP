# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c476 · 2026-07-02T07:16:11Z
### Audit Run Tier-1 (07:00–07:16 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- Restart: mcp-server=2 ✓ | Memory: 20.40% ✓ | Disk: 41% ✓
- Cron: 100+ jobs, 99%+ success rate; 1 legacy crash (marketScanJob:close, 80%, off-hours)
- Anomalies: 0 new | Status: HEALTHY

## c475 · 2026-07-02T06:46:16Z
### Audit Run Tier-1 (06:30–06:46 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 probes PASS
- Restart: mcp-server=1 ✓ | Memory: 88.69% ⚠ (known condition) | Disk: 41% ✓
- Cron: 100+ jobs, 99%+ success rate; 1 legacy crash (marketScanJob:close, 80%, off-hours)
- Anomalies: 0 new | Status: HEALTHY

## c474 · 2026-07-02T06:35:33Z
### Audit Run Tier-2 (06:30–06:35 UTC 2026-07-02)
- Tier: 2 | Cron: 100+ jobs healthy (100%+ success rate) | Sources: 27 checked
- Freshness: 4/5 sources PASS (ssc-iboard, news-vps, sbv-vps, foreign-flow) | 1 CRITICAL (bctc-discover)
- VPS Proxy: 4/4 active routes OK | 1 STALE (bctc, last push 2026-06-16T18:02Z, >15d)
- VPS Service: 4/5 healthy | 1 UNHEALTHY (vn-bctc-fetch, status down)
- SLA: bctc-discover 369.9h old vs 24h threshold (earnings-window, Q2 in-window) — CRITICAL
- DB Freshness: market_messages 3h (C-06 PASS) | agent_signals 135/24h (C-07 PASS) | BCTC URLs clean (B-09 PASS) | no stale pending (B-13 PASS)
- B-05 Gate: queue has 38 actionable rows (pending+failed+url_not_found) — NOT healthy-idle
- Anomalies: 1 CRITICAL (B-05 BCTC data_stale: queue active but VPS service down) | Signal #8238 posted | orch-state row added
- Status: DEGRADED (VPS bctc-fetch offline, pipeline stalled since quarterly push)
