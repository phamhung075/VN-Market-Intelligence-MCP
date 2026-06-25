# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
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

## c375 · 2026-06-25T16:54:49Z
### Audit Run Tier-DATA (16:54–16:55 UTC 2026-06-25) — DB Data-Anomaly Sweep
- Tier: DATA (read-only sidecar immutable=1) | Tables: 16 scanned | Anomalies: 0 NEW
- Canonical-4 FROZEN (matched 100%): db1_ohlc_violations=835 (pre-2026-06-20 residue, FIX in_progress), db2_scale_gt100x=1 (DFF 1000x known), db3_vnindex_cache_rows=0 (on-demand empty by design), c04_low_confidence_reports=21 (BCTC enrichment fix in_progress)
- Fresh data checks: daily_ohlcv=18408 (newest 2026-06-25, +0 fresh violations last 2d), market_prices=121 rows (freshest 15:45Z, staleness expected post-close 08:00Z), financial_reports=63 (net_revenue≤0=17 frozen), sbv_rates ok
- Residue roster verified (RECORD-AND-LEAVE): agent_signals.alert_id orphans=220 (FIX DONE-LIVE-VERIFIED commit 1f999f27), one pending signal=stale (2026-06-16, known backlog sau-20260621T155518), scheduler_locks=(0 held, none stuck), deep_fetch_queue status='failed'=0, cron_job_runs all recent+success
- Integrity: PRAGMA integrity_check(100)=ok; all table row counts nominal
- Anomalies: 0 NEW signals | 0 board-tracked fixes required | All findings KNOWN-BY-DESIGN or dedup-benign
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 74 rows | History: 131→132

## c374 · 2026-06-25T16:44:05Z
### Audit Run Tier-1 (16:43–16:44 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 13/13 up (all INTENDED runtime set) | Health: 5/5 endpoints OK (mcp:3000, api-gateway:4000, macro:5004, pdf:5001, frontend:3001)
- Raw-probe evidence: 13 containers UP with status "healthy"; docker ps exit=0; health endpoints all 200
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container HTTP 200 at +0s, +5s, +10s)
- RestartCount: mcp-server=0 (PASS); rag-service=120 (known FU-RAG-DEPLOY-MEMORY standing issue, NO jump >+2 short-window = RECORD-ONLY)
- Memory: mcp-server=18.12% (PASS, <85%); mcp-server cold-start ~1h 7m ago (15:35Z), mem reset nominal
- Disk: /=26% capacity (PASS, <85%); iused=0%
- Cron health via get_cron_health: 144+ jobs all active, success_rate≥98%, last-fire timestamps current, 0 fire-gaps
- MCP status: 16 circuit-breakers OK (no failures); uptime 1h 7m; recent errors off-hours noise (vnexpress/sbv/reuters RSS timeouts during market-closed)
- Anomalies: 0 NEW signals (all checks PASS; A-21 rag-service and B-05 bctc SLA both known/dedup-benign per guidance; no acute regressions)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 74 rows (stable) | History: 43→44

## c373 · 2026-06-25T16:24:59Z
### Audit Run Tier-3 (16:24–16:25 UTC 2026-06-25) — DB Data-Anomaly Sweep
- Tier: 3 | Container tooling: 3/3 ok (pdftoppm, tesseract, vie-lang) | Inter-service: 4/4 ok
- DB checks C-01–C-16: 16 checks, 16 PASS, 0 FAIL | WAL 4MB ok | Integrity ok
- Canonical-4 baseline: db1=835 (MATCH, no regression), db2=0 (← was 1, now stable), db3=0, c04=21 (all MATCH)
- Fresh OHLC violations (2d): 0 (PASS); C-08 orphaned alerts (24h): 1 (residue, BY-DESIGN)
- Anomalies: 0 NEW signals (all checks PASS, all BY-DESIGN residues accounted)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: unchanged | History: 131→132
