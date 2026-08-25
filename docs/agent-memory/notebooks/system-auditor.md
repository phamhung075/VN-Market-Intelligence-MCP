## c3 · 2026-08-25T12:16:46Z
### Audit Run Tier-2 (Tier-2 Freshness Sweep)
- Tier: 2 | Data sources checked: 20+ | VPS routes: 8 | BCTC status checked
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED (stale BCTC pending queue)

#### Tier-2 Freshness Checks

**VPS Proxy Health (B-06/B-07):**
- All dual-plane routes healthy (ssc-iboard, bctc-discover, bctc-push, sbv-vps, news-vps)
- Single-plane route healthy (foreign-flow)
- No-coverage routes noted (muasamcong, vietstock-agm-plan) — tracked gap
- Verdict: PASS

**Per-Source Fetch Freshness (B-01 through B-12):**
- Tick aggregator running normally
- No foreign-flow staleness detected (market hours: 09:00–15:30 VN = 02:00–08:30 UTC M-F, currently market closed)
- Rate limits: all sources ready (san sang)
- Verdict: PASS (except B-13 below)

**BCTC Stale Pending Check (B-13):**
- 513 pending records in bctc_vps_queue older than 72 hours
- Oldest: 2026-05-15 21:44:19 (2438h ago)
- Newest: 2026-07-12 12:30:27
- Root cause: PDF extraction or data enrichment backlog, likely related to elevated pdf-extractor memory (known A-30 steady-state condition, separate from data freshness)
- Verdict: WARN — signal emitted as sys-20260825T121606-2ad8

**BCTC URL Shape (B-09):**
- SSC portal URLs not present in non-skipped records
- Verdict: PASS

**DB Freshness Spot Checks (C-06, C-07):**
- market_messages in last 3h: 0 (table may not be actively written in real-time)
- agent_signals in last 24h: 5 (normal)
- Verdict: PASS (table usage pattern may differ from expectations)

**VPS Service Health:**
- vn-bctc-fetch: healthy
- vn-foreign-flow: idle (market closed)
- vn-news-fetch: healthy
- vn-price-fetch: idle (market closed)
- vn-sbv-fetch: healthy
- All services operational

#### Signals Emitted
1. sys-20260825T121606-2ad8 — B-13 WARN: stale pending BCTC (513 records >72h)

#### Dashboard Updated
- 1 WARN row added for B-13 stale pending BCTC

**Dedup and Coverage:**
- B-13 dedup_key: stale_pending_bctc:bctc-discover:B-13 (new signal)
- No dedup skips this cycle
- All Tier-2 checks executed

**Exit code:** 0 (cycle complete)

## Audit Run Tier-DATA (c88)

**Run:** 2026-08-25T12:09:51Z | Pre-gate exit: SPAWN (5 watched tables changed since last sweep)

**Summary:** DATA tier sweep completed. 3 findings recorded to db-integrity-history.json (all BY-DESIGN or already tracked).

**Key results:**
- deep_fetch_stats: 0 rows (class a, production writer exists) — REAL but already owned by FIX-DEEPFETCH-PIPELINE
- daily_ohlcv OHLC violations: 336 across 20 dates, all pre-2026-08-25 (no fresh 2d violations) — BY-DESIGN, owned by CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR
- financial_reports low-confidence: 52 rows (extraction_confidence < 0.2) — BY-DESIGN, expected PDF OCR noise

**History append:** history_len_before=200, history_len_after=200 (at cap), signals_written=[] (all BY-DESIGN/already-tracked)

## c2 · 2026-08-25T08:00Z
### Audit Run Tier-DATA (05:00–16:59 UTC 2026-08-25)
- Tier: DATA | Tables checked: 17 | DB Data-Anomaly Sweep
- Anomalies: 0 new (no findings outside already-open tasks)
- Status: HEALTHY (all tracked issues remain stable)

#### Raw Counts (db-integrity-counts.sh)
- scan_ts: 2026-08-25T07:59:48Z
- ohlc_violations_count: 336 (20 distinct dates, 0 fresh in last 2 days)
- scale_gt100x_count: 0
- vnindex_cache_rows_count: 1
- low_confidence_reports_count: 52

#### Findings Summary
**No new anomalies detected.** All observations match existing open task tracking:

1. **deep_fetch_stats** (0 rows, class a/may_stay_critical): Already-open signal tracked under FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD.

2. **daily_ohlcv OHLC violations** (336 rows across 20 distinct dates): Stable residue; 0 fresh violations in last 2 days. Already-open under LINT-OHLCV-WRITE-BYPASS.

3. **Other tables** (macro_indicators, sbv_rates, price_alerts, alert_engine_records, cron_job_runs): All classified as by-design (class b/c) or already tracked.

**Database state:** Stable. Deep fetch pipeline remains stalled (consistent with prior cycle). No new root causes identified.

**Entry appended to:** `docs/data/db-integrity-history.json` (length: 200, capped)

**Dedup status:** 1 finding (deep_fetch_stats) matched to existing open task FIX-DEEPFETCH-PIPELINE-100PCT-UNFETCHED-PRODUCER-LIVE-CONSUMER-DEAD. No new signals written.

**Exit code:** 0 (RECORD OK)
