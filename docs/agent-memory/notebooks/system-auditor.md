# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c346 · 2026-06-25T08:13:38Z
### Audit Run Tier-1 (08:12–08:13 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (4h, RestartCount=0 BUILD-04:38Z sha=4ef240ed, mem=45.11% 923.9MiB/2GiB), rag-service (3h, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-30 mcp-server mem=45.11% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi avail, 13Gi used, PASS)
- B-05 BCTC healthy-idle: queue pending, push-age ~200h << SLA-1714.5h out-of-window → PASS
- VPS proxy: prices OK 08:12:14, news OK 08:04:14, sbv OK 08:05:54, bctc stale 2026-06-16 18:02 (by-design off-season, not actionable per SLA)
- Crons: 100+ active, success ≥98% | Circuit breakers: 16/16 OK | No fire gaps
- RAW-PROBE: docker ps all 12 up; health 5/5 200; mem 45.11%; disk 26% capacity
- Anomalies: 0 new | Status: HEALTHY

## c345 · 2026-06-25T07:44:10Z
### Audit Run Tier-1 (07:43–07:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (3h, RestartCount=0 BUILD-04:38Z, mem=37.12% 760.3MiB/2GiB), rag-service (2h, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 200 200) — no event-loop stall
- A-30 mcp-server mem=37.12% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=203h << SLA-1714.5h out-of-window → PASS
- Circuit breakers: 16/16 OK | Crons: 100+ active, success ≥98% | No gaps
- RAW-PROBE: docker ps all 12 up; health 5/5 200; mem 37.12%; disk 26% capacity
- Anomalies: 0 new | Status: HEALTHY

## c344 · 2026-06-25T07:28:02Z
### DB DATA-ANOMALY SWEEP — Tier DATA (07:26–07:28Z)
- **CANONICAL-4** (deterministic helper scan_ts 2026-06-25T07:26:39Z): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 — FROZEN identical to scan #112
- **Baseline freshness**: daily_ohlcv_total=18251, newest_date=2026-06-25 (CURRENT), market_prices_freshness=2026-06-25T07:26:48Z (~0 min FRESH)
- **TABLES CHECKED**: 13 high-value (daily_ohlcv, market_prices, alerts, price_alerts, agent_signals, deep_fetch_queue, scheduler_locks, financial_reports, others)
- **INTEGRITY**: market_prices fresh 07:26:48Z, NULL_count=0, negative_volume=0; alerts=1653 normal; agent_signals=4201 (with ~4156 expired by-design); deep_fetch_queue 0 stuck >8h; scheduler_locks released weeklyPortfolioReport (released_at=2026-06-22T01:59:31)
- **ANOMALIES**: 0 NEW detected — all by-design states (db1/db2/db3/c04 frozen, financial_reports net_revenue<=0 or NULL=31, agent_signals expired backlog by-design GC-absent)
- **HISTORY APPEND**: 112→113 entries (scan_ts=2026-06-25T07:28:02Z, counts embedded deterministically, helper-verified grown)
- **STATUS**: STEADY-STATE — no new signals required; market data live and fresh

## c343 · 2026-06-25T07:13:25Z
### Audit Run Tier-1 (07:13–07:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers UP: mcp-server (3h, RestartCount=0 REBUILD-04:38Z, mem=27.04% 553MiB/2GiB), rag-service (2h, RestartCount=117 KNOWN-STANDING FU-RAG-DEPLOY-MEMORY), all others stable 9d–2w
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 200 200) — no event-loop stall
- A-30 mcp-server mem=27.04% (PASS <85%) | A-31 EPIPE=0 | A-32 disk=26% (39Gi free, PASS)
- B-05 BCTC healthy-idle: queue=38 pending, push-age=202.5h << SLA-1714.5h out-of-window → PASS
- Circuit breakers: 16/16 OK | Crons: 100+ active, success ≥98% | No gaps
- RAW-PROBE L4–L50: docker ps all up; health 5/5 200; mem 27.04%; disk 26%
- Anomalies: 0 new | Status: HEALTHY
