# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c381 · 2026-06-25T18:26:08Z
### Audit Run TIER-DATA (18:24–18:26 UTC 2026-06-25) — DB Data-Anomaly Sweep
- AUDIT_TIER: DATA | Tables checked: 13 | Findings: 13 entries (1 REAL-PERSISTENT, 12 BY-DESIGN/CLEAN)
- Canonical-4 helper (deterministic): db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 — FROZEN
- Orphaned alerts: 1320 total (220 historical residue + 1100 ongoing). Prior signal sau-20260625T1426-orphan-signals-regress TRIAGED (RECORD-AND-LEAVE, no new signal per dedup)
- All other checks PASS/BY-DESIGN: duplicates=0, stale_pending=0, failed_fetch=0, negative_prices=0, held_locks=0
- History: entry #135 appended, length=135 (helper counts + 13 findings)
- Anomalies: 0 NEW signals posted (orphaned FK already TRIAGED open)
- Status: HEALTHY (detection only) | Signal-queue: unchanged (74 rows)

## c380 · 2026-06-25T18:14:00Z
### Audit Run Tier-1 (18:13–18:14 UTC 2026-06-25) — Runtime Ping
- Tier: 1 | Services: 12/12 UP (all INTENDED host_runtime_set) | Health: 5/5 endpoints 200 OK
- RAW-PROBE (18:13Z): mcp-server Up 3h, rag-service Up 3h, all 12 services healthy
- RestartCount: mcp-server=0 PASS; rag-service=120 STANDING-KNOWN (FU-RAG-DEPLOY-MEMORY)
- Memory: mcp-server 28.54% (584.5MiB/2GiB PASS <85%); disk / 26% (13Gi/233Gi PASS <85%)
- Cron: 160+ jobs ≥98% success_rate, 0 fire-gaps, timestamps current
- VPS: all routes ok; bctc queue=0 HEALTHY-IDLE (B-05 gate passed)
- Anomalies: 0 NEW signals (all checks PASS)
- Status: HEALTHY | Signals: 0 posted | Signal-queue: 74 rows unchanged

## c379 · 2026-06-25T17:56:04Z
### Audit Run Tier-DATA (17:55–17:56 UTC 2026-06-25) — DB Data-Anomaly Sweep
- Tier: DATA | Tables: 18 scanned (4-class sweep)
- Canonical-4: db1_ohlc_violations=835, db2_scale_gt100x=1, db3_vnindex_cache_rows=0, c04_low_confidence_reports=21 (FROZEN)
- Findings: daily_ohlcv dups=0, market_prices ok, alerts orphaned FK=1 (tracked), net_revenue≤0=17 (frozen)
- No NEW anomalies detected; all findings match known by-design residue roster
- Anomalies: 0 NEW signals | Status: HEALTHY | Signal-queue: 74 rows unchanged
