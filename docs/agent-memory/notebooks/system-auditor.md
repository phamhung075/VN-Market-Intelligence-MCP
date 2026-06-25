# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c378 · 2026-06-25T17:43:27Z
### Audit Run Tier-1 (17:43 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 13/13 up (all INTENDED runtime set) | Health: 5/5 endpoints OK
- RAW-PROBE: mcp-server (2h), frontend (36h), macro (37h), pdf (9d), stock (10d), ta (10d), kinh-dich (11d), api-gateway (2w), rag (2h), news (2w), alert (2w), headroom (12d), mcp-gateway (2w) — all healthy
- Health endpoints: mcp:3000/health, api-gateway:4000/health, macro:5004/health, pdf:5001/health, frontend:3001/ — all 200 OK
- RestartCount: mcp-server=0 (PASS); rag-service=120 (FU-RAG-DEPLOY-MEMORY known, no jump)
- Memory: mcp-server=23.28% (476.9MiB/2GiB PASS <85%); disk=/=26% (13Gi/233Gi PASS <85%)
- Cron: 160+ jobs all ≥98% success_rate, 0 fire-gaps, timestamps current
- VPS proxy: all routes ok; bctc off-season queue=0 HEALTHY-IDLE per B-05 gate
- Anomalies: 0 NEW signals | All checks PASS
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 74 rows unchanged

## c377 · 2026-06-25T17:25:46Z
### Audit Run Tier-DATA (17:25–17:26 UTC 2026-06-25) — DB Data-Anomaly Sweep
- Tier: DATA | Tables: 18 scanned (4-class sweep: FAIL/MISSING, STALE/UNAVAIL, DUP/REPEAT, INCORRECT/ALEATOR)
- Canonical-4 FROZEN (verified): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21
- Anomaly checks: deep_fetch_queue failed=0, pending>6h=0; orphaned alerts 24h=1 (tracked); financial_reports net_revenue≤0=17 (frozen)
- Stale checks: market_prices max_ts=2026-06-25T17:00:02Z (post-close expected, VN market closed 08:30 UTC); sbv_rates=ok; macro_indicators=ok
- Integrity checks: daily_ohlcv (code,date) duplicates=0; market_prices price≤0=0; daily_ohlcv volume<0=0; bctc SSC URLs=0
- Scheduler: locks held >24h=0 (all released); deep_fetch_queue status='failed'=0; cron jobs nominal
- Anomalies: 0 NEW signals | All findings PASS or BY-DESIGN residue
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 74 rows | History: 132→133

## c376 · 2026-06-25T17:13:02Z
### Audit Run Tier-1 (17:13–17:13 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 13/13 up (all INTENDED runtime set) | Health: 5/5 endpoints OK
- RAW-PROBE: 13 containers healthy (mcp-server:2h, frontend:36h, macro:36h, pdf:9d, stock:10d, ta:10d, kinh-dich:10d, api-gateway:2w, rag:2h, news:2w, alert:2w, headroom:12d, mcp-gateway:2w)
- Health endpoints: mcp:3000/health, api-gateway:4000/health, macro:5004/health, pdf:5001/health, frontend:3001/ — all 200 OK
- RestartCount: mcp-server=0 (PASS, cold-start ~2h ago); rag-service=120 (FU-RAG-DEPLOY-MEMORY known, NO jump)
- Memory: mcp-server=24.47% (501.2MiB/2GiB, PASS <85%); rag-service 2h uptime nominal
- Disk: /=26% (13Gi/233Gi, PASS <85%); iused=0%
- Cron: 160+ jobs via get_cron_health all ≥98% success_rate, 0 fire-gaps, last-run timestamps current
- VPS proxy health: prices/news/sbv all ok; bctc last push 2026-06-16 (9d stale but queue=0 off-season = HEALTHY-IDLE per B-05 gate)
- Anomalies: 0 NEW signals (all checks PASS, bctc/rag/news patterns match dedup baseline)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 74 rows unchanged | History: 132→133
