# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c373 · 2026-06-25T16:24:59Z
### Audit Run Tier-3 (16:24–16:25 UTC 2026-06-25) — DB Data-Anomaly Sweep
- Tier: 3 | Container tooling: 3/3 ok (pdftoppm, tesseract, vie-lang) | Inter-service: 4/4 ok
- DB checks C-01–C-16: 16 checks, 16 PASS, 0 FAIL | WAL 4MB ok | Integrity ok
- Canonical-4 baseline: db1=835 (MATCH, no regression), db2=0 (← was 1, now stable), db3=0, c04=21 (all MATCH)
- Fresh OHLC violations (2d): 0 (PASS); C-08 orphaned alerts (24h): 1 (residue, BY-DESIGN)
- History: append c373 (len 130→131); history cap=200 OK
- Anomalies: 0 NEW signals (all checks PASS, all BY-DESIGN residues accounted)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: unchanged | History: 131→132

## c372 · 2026-06-25T16:13:08Z
### Audit Run Tier-1 (16:13–16:13 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 up (mcp-server:37m, frontend:35h, macro:35h, pdf:9d, stock:10d, ta:10d, kinh-dich:10d, api-gateway:2w, rag:47m, news:2w, alert:2w, mcp-gateway:2w)
- Health endpoints: 5/5 ok (mcp:3000, api-gateway:4000, macro:5004, pdf:5001, frontend:3001)
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container HTTP 200 all probes)
- RestartCount: mcp-server=0 (PASS); rag-service=120 (known FU-RAG-DEPLOY-MEMORY, RECORD-AND-LEAVE)
- Memory: mcp-server=16.84% (PASS, <85%); clean recycle after 15:35 restart, mem reset expected
- Disk: /=26% (PASS, <85%)
- Cron health: 144+ jobs all success_rate≥98%, no fire-gaps detected
- VPS proxy: prices/news/sbv all ok; bctc off-season idle (0 pushes/24h expected Q2)
- B-05 gate: queue=38 pending/failed (not stuck); push 199.7h << 1714.5h SLA threshold = HEALTHY-IDLE, NO signal
- Anomalies: 0 NEW signals (all checks PASS, no regressions)
- Status: HEALTHY | Signals: 0 posted | Queue: 74 rows (c371→c372) | History: 131→132

## c371 · 2026-06-25T16:04:34Z
### Audit Run Tier-2 (16:02–16:04 UTC 2026-06-25) — Freshness Sweep
- Tier: 2 | Cron: 144 jobs, all ≥98% success, 0 fire-gaps | Sources: 27 checked vs cadence thresholds
- Per-source results: price/bctc/news/sbv/foreign-flow all PASS SLA thresholds
- B-05 (bctc-discover): push 213.6h << 1720.5h threshold (Q2 out-of-window); queue=38 pending/failed (not stuck); verdict=HEALTHY-IDLE off-season, NO signal
- B-06 (vps proxy): routes ok (bctc 0 pushes/24h expected off-season)
- B-07 (sbv_fx): rate fresh 2026-06-25T16:00Z (cadence 6h, stale >24h)
- B-09 (ssc urls): 0 in queue — PASS
- B-11 (news-vps): vn-news-fetch healthy, last push 16:00:01 — PASS
- B-12 (rate limits): no source at 100% — PASS
- B-13 (bctc >72h stale): 0 rows — PASS
- C-06 (market_messages 3h): 2 rows — PASS | C-07 (agent_signals 24h): 267 rows — PASS
- Dedup: B-05/B-06/B-11/FX findings RECORD-AND-LEAVE (known recurrent patterns, no acute new anomaly)
- Anomalies: 0 NEW signals | All rechecked findings KNOWN-BENIGN or dedup-matched
- Status: HEALTHY | Signals: 0 posted | Queue: 73 rows unchanged | History: 131→132
