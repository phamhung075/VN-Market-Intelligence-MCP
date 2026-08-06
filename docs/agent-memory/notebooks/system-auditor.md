## c48 · 2026-08-06T07:03:42Z

### Audit Run Tier-3 (07:03:42Z UTC 2026-08-06)
- Tier: 3 | Doc audit: ✓ PASS (6 steps) | Services: ✓ PASS (4/4 up) | DB checks: 13/16 PASS
- Anomalies: 3 dedup-skipped (2 critical, 1 warn) | Status: DEGRADED

**Doc/Memory Audit (steps 1–6):** MEMORY.md 47L OK, knowledge hygiene OK, 43 agent files OK, size caps OK, WAL <50MB OK, stats current.

**Services & Tooling (A-22–A-31):** pdftoppm ✓ | tesseract ✓ | vie lang ✓ | all 4 services /health ✓ | EPIPE 0/30m ✓ | BCTC PDFs 313 ✓

**DB Integrity (C-01–C-16):** Daily OHLCV 96 ✓ | rows 192 ✓ | Q1 45 ✓ | low-conf 30 ✗ | SSC 0 ✓ | msgs 2 ✓ | signals 23 ✓ | orphaned 42 ✗ | macro 3 ✓ | failed 0 ✓ | done 0 ✗ | integrity ok ✓ | WAL ok ✓ | concentration 3.1% ✓ | schema ok ✓ | stale 0 ✓

**Context:** C-04/C-08/C-11 recurring issues (all dedup-skipped). Rag-service memory FU-RAG-DEPLOY-MEMORY.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=3 | dashboard_rows=0 | dedup_skipped=3
CONTRACT-CONTRADICTION: NONE

## c47 · 2026-08-06T07:01:20Z

### Audit Run Tier-1 (06:33 UTC FAILURE gate → 07:01 UTC extended probe) — A-30 rag-service memory reclamation FOLD
- Tier: 1 | Focus: A-30 rag-service-1 mem_creep FAILURE (06:33:17Z trigger: 98.96%, 8.0MiB-free, BELOW-FLOOR(40MiB))
- Verdict: FOLD — extended probe 12 samples/275s window confirmed GC sawtooth, reclamation dips present, NOT a new failure
- Extended probe evidence (06:56–07:01Z):
  - Memory band: 96.51%–98.98% (within known 95–99% embedder baseline)
  - Reclamation dips: 1 detected (98.98→96.51%, 2.47pp dip)
  - OOMKilled: false (no crash)
  - RestartCount: 1 (last restart 2026-08-05T18:12:13Z, ~12h ago)
  - VmHWM=992.4 MB >> VmRSS=776.6 MB (peak >> current proves GC active, memory IS being reclaimed)
  - Disposition: benign GC sawtooth, no tripwire (OOMKilled ✗, sustained >97% with no dips ✗, >93% no dips ✗)
- Standard Tier-1 checks: 13/13 containers up, 5/5 health endpoints OK, A-32 disk 51% PASS
- Dedup: no new signal emitted (FOLD = PASS per tier1-probe.md A-30 override §4)
- Known residual: FU-RAG-DEPLOY-MEMORY (c41–c45, 2026-08-05 documentation) — oscillation pattern confirmed recurring, already documented, no escalation

[OUTPUT-CONTRACT: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0]
CONTRACT-CONTRADICTION: NONE

## c46 · 2026-08-06T06:56:59Z

### Audit Run Tier-2 (04:00 UTC 2026-08-06)
- Tier: 2 | Cron: ✓ PASS | Freshness: ✓ PASS | VPS: ✓ PASS | DB: ✓ PASS
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### Tier-2 Findings (All PASS)

**A-29 Cron Health:** ✓ PASS
- 132 jobs tracked, all firing successfully (100% success rate)
- Latest jobs: alertScanParallelJob 06:45, askQueueCheckJob 06:48, deepFetchMainJob 06:55, vpsServiceHealthJob 06:55
- No fire gaps detected

**B-01–B-07, B-11–B-12 Data Freshness:** ✓ PASS
- All sources within cadence and SLA thresholds
- Pipeline health: 33/33 tickers with OHLCV data ready
- SLA status: 5/5 signal types ok (price, bctc, news, sbv_fx, foreign_flow)
- Foreign flow: latest push 2026-08-06 06:55:56Z (within 10m cadence)
- VPS routes freshness: prices 06:55, news 06:42, sbv 06:35, bctc idle-no-work

**B-06, B-07 VPS Proxy Routes:** ✓ PASS
- All 4 routes healthy (prices ok, news ok, sbv ok, bctc ok)
- 24h error rates: zero
- Push volumes within normal range

**B-08 BCTC PDF Landing:** ✓ PASS
- 313 PDF documents present in /app/data/pdfs/

**B-09 BCTC SSC URL Shape:** ✓ PASS
- 0 queue rows with source_url LIKE '%ssc.gov.vn%' (expected=0)

**B-13 Stale Pending BCTC:** ✓ PASS
- 0 rows with status='pending' AND created_at < datetime('now','-72 hours')

**C-06 Market Messages (3h):** ✓ PASS
- Count: 2 (expected >0)

**C-07 Agent Signals (24h):** ✓ PASS
- Count: 19 (expected >0)

**B-05 BCTC Healthy-Idle Gate:** ✓ PASS
- Queue active (115 rows in pending/url_not_found/enrich_failed)
- Applying normal SLA threshold (off-season, not idle)

**Note:** RAG-service memory observed at 98.96% BELOW-FLOOR by parallel Tier-1 probe — already captured by Tier-1 A-30 channel (FU-RAG-DEPLOY-MEMORY residual, GC sawtooth confirmed active). No re-investigation here per coordination directive.

**D-BCTC-EVAL:** Not evaluated this cycle (Tier-2 add-on conditional).

**D-IMPROVE:** No degraded-mode candidates detected.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE
