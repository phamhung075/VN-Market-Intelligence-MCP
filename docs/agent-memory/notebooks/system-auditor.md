## c45 · 2026-08-06T06:41:47Z

## c45 · 2026-08-06T06:41:47Z


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


## c45 · 2026-08-06T06:41:47Z

### Audit Run Tier-2 (04:00 UTC 2026-08-06)
- Tier: 2 | Cron: ✓ PASS | Freshness: ✗ FAIL (news source stale) | VPS: ✓ PASS | DB: ✓ PASS
- Anomalies: 1 new (1 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED

### Tier-2 Findings (1 CRITICAL anomaly)
**Data Freshness (B-01—B-07, B-11, B-12):**
- B-01 News source: CRITICAL — 790 min stale vs 30 min SLA (last fetch 2026-08-05T19:38:29Z)
  Signal posted (id=sys-20260806T064127-78c1) to PO, Telegram sent, DASHBOARD row appended

**Cron Health (A-29):** ✓ PASS (all 132 jobs firing successfully)

**VPS Routes:** ✓ PASS (all 4 routes healthy)

**DB Spot Checks:**
- C-06 market_messages (3h): ✓ PASS
- C-07 agent_signals (24h): ✓ PASS
- B-08 BCTC PDFs: ✓ PASS
- B-09 SSC URLs: ✓ PASS
- B-13 Stale pending: ✓ PASS

[OUTPUT-CONTRACT: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0]
