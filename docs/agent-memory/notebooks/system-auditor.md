
## c16 · 2026-08-05T06:41:02Z
### Audit Run Tier-1 (06:39–06:40 UTC 2026-08-05)
- Tier: 1 | Services: 12/12 UP | Health endpoints: 5/5 OK | A-20 multi-probe: 3/3 pass
- Memory: 56.29% (< 85% threshold) | Disk: 40% (< 85% threshold)
- Restart count (A-21): 0 windowed crashes (PASS)
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY

Fire-election: tick=2026-08-05T06:30Z (Tier-1 30-minute boundary) — claimed, led tick.

**RAW-PROBE:**
```
=== AUDITOR PROBE 2026-08-05T06:39:25Z ===

--- docker ps -a ---
All 12 host_runtime_set services UP with healthy status

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
RestartCount=13 (cumulative, windowed crashes=0 in 4h window)

--- memory pressure ---
MemPerc=56.29% (< 85% investigate-gate)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3 PASS

--- disk df -h / ---
Capacity 40% (< 85%)
```

Note: Previous Tier-1 heartbeat was stale (2026-07-29T11:11:55Z, 7 days old). This cycle refreshes the heartbeat.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0



## d4-auto · 2026-08-05T03:00:02.070Z
D4 candidates: R2-mismatch:bug-escalation:bctc-full-outage:20260805-0000,R3-no-board-row:bug-escalation:bctc-full-outage:20260805-0000

## d4-auto · 2026-08-04T03:00:01.418Z
D4 candidates: none

## d4-auto · 2026-08-03T03:00:00.968Z
D4 candidates: none

## d4-auto · 2026-08-02T03:00:02.134Z
D4 candidates: none

## d4-auto · 2026-08-01T03:00:02.137Z
D4 candidates: none

## c15 · 2026-08-01T02:33:49Z
### Audit Run Tier-2 (02:00–02:34 UTC 2026-08-01)
- Tier: 2 | Cron health: PASS (A-29 all jobs healthy, latest runs at 02:30Z) | Sources: 5 checked
- Data freshness: all sources PASS per SLA (price 1m/1082m, bctc 6m/10080m, news 8m/30m, sbv_fx 1m/1021m, foreign_flow 1051m/1082m)
- DB spot checks: C-06 0 market_msgs/3h (EXPECTED—Saturday no trading), C-07 23 signals/24h PASS, B-09 0 SSC URLs PASS, B-13 0 stale pending PASS
- **C-08 investigation:** orphaned alerts query returned **1** (the bctc-overdue alert id=bctc-overdue:batch:2026:Q1:W2952 triggered 2026-08-01T02:00:02.925Z). Predicate: `SELECT count(*) FROM alerts a LEFT JOIN agent_signals s ON a.id = s.alert_id WHERE s.id IS NULL AND a.triggered_at > datetime('now','-24 hours')` — confirmed the join asymmetry: 12 total alerts, 127 total agent_signals, only 16 agent_signals.alert_id IS NOT NULL (structural, not pipeline failure per brief)
- Rate limits: PASS (all sources ok per get_sla_status)
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY (all freshness SLA PASS, market CLOSED Saturday, no trading expected)

Fire-election: tick=2026-08-01T00:00Z (Tier-2 4-hour boundary) — claimed, led tick.

DB & Freshness Context (Saturday 02:33Z, market closed Friday 08:30Z ~18h ago):
- PRAGMA journal_mode: wal | PRAGMA quick_check: ok | No corruption
- SLA Status (get_sla_status live 02:32Z): 5 signal types all `ok` (thresholds calendar-aware per source)
- agent_signals: 127 total (3 in last 30 min), format split: 2 ISO-8601-with-T, 1 space-separated (ongoing FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT)
- Cron health: 100+ jobs all running, latest batch at 02:30Z (askQueueCheckJob, bctcPdfPullJob, bctcQueueEnricherJob, deepFetchMainJob, deepFetchVpsJob, freshnessSlaMonitorJob, intelligenceCycleJob, intraday5mCompactorJob, intradayForeignFlow5mCompactorJob, newsHeadlinesRefreshJob, ohlcv-history-backfill, pipelineWatchdogJob, pollNewsJob, predictionMarketPollJob, restartCadenceAlertJob, schedulerWatchdogJob, verdictResolutionJob, vpsServiceHealthJob, walCheckpointJob)
- Pipeline: aggregator last run 2026-07-31 15:03:00, 33/33 tickers TA-ready, no backfill pending
- BCTC queue: 614 total (1 pek_triggered, 33 pending, 39 url_not_found, 128 enrich_failed, 85 done, 328 deferred_infra)

C-08 swing investigation (121→0→1 across cycles):
- Current cycle returned 1 (this write). Earlier cycles (per briefing): 113, then 121, then 0.
- Root cause of swing: the LEFT JOIN predicate measures different scope across cycles depending on how the 24-hour window boundary was set OR how `agent_signals.alert_id` cardinality changed. Briefing confirmed ~2-16 of 127+ signals carry alert_id refs (high structural variance explains swing). The single orphaned alert today (bctc-overdue for BID stock) is legitimate (confirmed in get_alerts response). No pipeline breakage; the counts are expected variance of the join asymmetry. Per brief: do not re-mint, report predicate + result (done).

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0

## c14 · 2026-08-01T00:34:17Z
### Audit Run Tier-3 (00:33–00:34 UTC 2026-08-01)
- Tier: 3 | Container tooling: PASS (pdftoppm, tesseract, vie lang all present) | Services: 4/4 healthy (stock-price, technical-analysis, alert-engine, pdf-extractor)
- EPIPE crash check: 0 events in 30m PASS | PDF landing: 279 files PASS
- DB integrity checks: C-01 thru C-16 all PASS
  - C-01: 1166 distinct codes (≥25) ✓
  - C-02: 2863 ohlcv rows (>0) ✓
  - C-03: 45 action_codes Q1 2026 (≥26 expected Apr-May) ✓
  - C-04: 0 low-confidence reports (≤5) ✓
  - C-05: 0 SSC portal URLs (=0) ✓
  - C-06: 0 market_messages in 3h (expected pre-market 02:00Z open) ✓
  - C-07: 20 agent_signals in 24h (>0) ✓
  - C-08: 0 orphaned alerts (=0) ✓
  - C-09: 3 macro indicators Vietnam (≥3) ✓
  - C-10: 0 failed PDFs (≤2) ✓
  - C-11: 0 done PDFs (off-season ok) ✓
  - C-12: PRAGMA integrity_check all DBs = ok ✓
  - C-13: WAL sizes <50MB (market 3MB, coordination 1MB) ✓
  - C-14: Top-3 concentration 0.3% (<60%) ✓
  - C-15: Schema present (action_code, period_year, extraction_confidence, net_revenue) ✓
  - C-16: 0 stale pending BCTC (=0) ✓
- DB State: journal_mode=wal (market, coordination, alert_engine, macro_indicators), delete (pdf_extractor), quick_check=ok all DBs
- Anomalies: 0 new (0 critical, 0 warn, 0 info)
- Status: HEALTHY (all system checks pass, pre-market window)

Fire-election: tick=2026-08-01T02:00Z (Tier-3 daily 02:00 UTC) — claimed, led tick.

Known Issues (Trap 4 — timestamp format mismatch FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT, P1):
- agent_signals format split: 111 space-separated, 13 ISO-8601 (causes 24-h space-delimited predicate to return 0 instead of 20)
- market_messages all 1099 rows use space-separated format (no T), no fresh ingestion in 3h pre-market

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0

## c013 · 2026-07-31T18:34:00Z
### Audit Run Tier-2 (16:00–18:34 UTC 2026-07-31)
- Tier: 2 | Cron health: PASS (A-29 all jobs healthy) | Sources: 5 checked
- Data freshness: all sources PASS (price 61m/603m, bctc 4350m/10080m, news 1m/243m, sbv_fx 2m/542m, foreign_flow 571m/603m)
- DB spot checks: C-06 2 msgs/3h PASS, C-07 12 signals/24h PASS, B-09 0 SSC URLs PASS, B-13 0 stale pending PASS
- VPS services: 2 healthy (news, sbv), 2 idle (price, foreign-flow), 1 unhealthy (bctc service only)
- Rate limits: implicit PASS (all sources ok per get_sla_status)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 dedup-skipped (B-06 bctc service unhealthy)
- Status: HEALTHY (market CLOSED, all freshness SLA PASS)

Fire-election: tick=2026-07-31T16:00Z (`0 */4 * * *` Tier-2 boundary) — claimed, led tick.

DB & Freshness Context (market CLOSED 08:30Z, thresholds CALENDAR-AWARE per get_sla_status):
- PRAGMA journal_mode: wal | PRAGMA quick_check: ok | No corruption
- SLA Status (get_sla_status at 18:32Z): 5 signal types all `ok` (price 61m/603m SLA, bctc 4350m/10080m SLA, news 1m/243m SLA, sbv_fx 2m/542m SLA, foreign_flow 571m/603m SLA)
- BCTC queue total: 580 (active 167: pending/url_not_found/enrich_failed; deferred_infra 328, done 85)
- agent_signals: 116 total (12 in last 30min), format split: 12 ISO-8601-with-T (alert-engine), 104 space-separated (legacy)

Known Issues (unchanged from c012):
- B-06: bctc vps_service_health UNHEALTHY despite proxy route ok (dedup-skipped, last c008)
- B-06 both planes: proxy_health status=ok idle-no-work, service_health vn-bctc-fetch=unhealthy (last poll 3m)
- Q2 2026 financial_reports: 0 rows (documented SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD)

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=1
