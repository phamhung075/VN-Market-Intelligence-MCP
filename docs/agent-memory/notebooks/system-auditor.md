# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
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

## c370 · 2026-06-25T16:03:51Z
### Audit Run Tier-1 (16:02–16:03 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 up (mcp, api-gateway, frontend, macro, mcp-gateway, pdf, stock, ta, kinh-dich, alert, rag, news)
- Health endpoints: 5/5 ok (mcp:3000, api-gateway:4000, macro:5004, pdf:5001, frontend:3001)
- A-20 pdf-extractor multi-probe: 3/3 PASS (no event-loop stall)
- RestartCount: mcp-server=0 (PASS)
- Memory: mcp-server=17.83% (PASS, <85%)
- Disk: /=26% (PASS, <85%)
- Cron health: 144 jobs tracked, all success_rate≥98%, no fire-gaps
- BCTC-aware gate: 38 pending items + off-season (push 211.4h << 1714.5h SLA threshold) = healthy idle, NO signal
- Anomalies: 0 NEW signals emitted (all checks PASS, no regressions vs prior probes)
- Status: HEALTHY | Signals: 0 posted | Queue: 73 rows unchanged | History: 130→131
