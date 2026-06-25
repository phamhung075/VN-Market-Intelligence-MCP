# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c384 · 2026-06-25T18:44:22Z
### Audit Run Tier-1 (18:43–18:44 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (all INTENDED host_runtime_set) | Health: 4/5 endpoints OK (api-gateway transient curl-err, host-side 200 PASS)
- RAW-PROBE (18:43Z): all 12 containers Up (mcp-server 3h, rag-service 3h, frontend 37h, macro-indicators 38h, pdf-extractor 9d+, rest 2w+)
- A-20 pdf-extractor multi-probe: 3/3 in-container HTTP 200 (majority PASS)
- RestartCount: mcp-server=0 PASS; rag-service=120 STANDING-KNOWN (FU-RAG-DEPLOY-MEMORY, no jump detected)
- Memory: mcp-server 33.19% (679.7MiB/2GiB PASS <85%); disk / 27% (13Gi/233Gi PASS <85%)
- Cron: all 160+ jobs ≥98% success_rate, 0 fire-gaps, all timestamps current
- VPS: all 4 routes OK (prices, news, sbv, bctc); bctc queue=38 active → off-season expected
- Anomalies: 0 NEW signals (all checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 75 rows unchanged

## c383 · 2026-06-25T18:30:41Z
### Audit Run Tier-2 (18:30 UTC 2026-06-25) — Freshness Sweep
- Tier: 2 | Sources: 27 swept | Per-source all within SLA (bctc 12829min << 1714.5h threshold off-window)
- Cron health: 160+ jobs ≥98% success, 0 fire-gaps; 5 recent cron checks all PASS
- BCTC-discover: queue=38 active + host UP → healthy idle gate PASS (no B-05 emit per dedup rule)
- VPS routes: 4/4 ok (prices/news/sbv/bctc); service health: 2 healthy, 2 idle (market-closed), 1 event-driven (bctc expected)
- DB freshness: C-07 ok (263 signals 24h); C-06 0 msgs in 3h (off-market expected, dedup prior signal sau-2026-06-25T18:31:16Z)
- BCTC checks: B-09 PASS (0 ssc.gov.vn), B-13 PASS (0 stale pending); news-vps PASS (age 81min cadence 1h)
- Anomalies: 0 NEW signals | Dedup: B-05/B-06 healthy-idle gate passed, B-11 analysis-age expected, C-06 already emitted by concurrent cycle
- Status: HEALTHY | Signal-queue: 75 rows unchanged

## c382 · 2026-06-25T18:31:16Z
### Audit Run Tier-2 (18:30–18:31 UTC 2026-06-25) — Freshness Sweep
- Tier: 2 | Sources: 27 checked | DB freshness: 4 spot checks
- Cron health: 160+ jobs, all >98% success_rate, 0 fire-gaps
- Pipeline health: 33/38 tickers OHLC ready, 3 TA oversold signals
- VPS proxy: 3/4 routes ok (news, sbv, prices all fresh); bctc=off-season idle
- Data freshness: all sources within SLA thresholds (bctc 12829min << 103381min threshold)
- Rate limits: 14/14 sources ok, none at 100%
- DB checks: C-06 WARN (market_messages=0 in 3h), C-07 ok (263 signals in 24h)
- Anomalies: 1 NEW WARN (C-06 market_messages stale)
- Status: DEGRADED | Signals: 1 posted | Signal-queue: 75 rows (+1)
