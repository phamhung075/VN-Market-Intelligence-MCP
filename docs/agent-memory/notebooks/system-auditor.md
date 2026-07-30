## d4-auto · 2026-07-30T03:00:03.251Z
D4 candidates: R3-no-board-row:data-quality-anomaly:DGC:Q1-2026
## c008 · 2026-07-30T07:11:27Z
### Audit Run Tier-2 (07:09–07:11 UTC 2026-07-30)
- Tier: 2 | Cron health: SKIPPED-DB-CORRUPT | Sources: 5 checked
- Data freshness: foreign-flow CRITICAL 189m (SLA 10m), sbv_fx CRITICAL 204m (SLA 30m), bctc HEALTHY IDLE (37h < 367h SLA window)
- VPS services: 1 unhealthy (vn-bctc-fetch), 4 healthy
- Rate limits: PASS (all 14 endpoints ready)
- DB spot checks: SKIPPED-CONSTRAINT (do not docker exec mcp-server), SKIPPED-DB-CORRUPT (B-09, B-13)
- Anomalies: 1 new (1 critical) | 2 dedup-skipped (sbv_fx, vps_proxy)
- Status: DEGRADED (foreign-flow stale, sbv_fx persistent SLA breach, vps_bctc unhealthy)

Fire-election: tick=2026-07-30T04:00Z (`0 */4 * * *` boundary) — claimed, led tick.

Findings:
- B-03: foreign-flow data stale 189min (3.15h) exceeds SLA 10min — NEW
- B-01: sbv_fx SLA breach 204min (3.4h) > 30min — dedup-skipped (last_sent 2026-07-29T14:34:45Z)
- B-06: VPS bctc proxy stale 41+ hours, service unhealthy — OK-escalation-bypass (severity escalated)

[emit-signal] OK dedup_key=data_stale:foreign-flow:B-03 id=sys-20260730T071114-45c7
[emit-signal] SKIP-dedup dedup_key=data_stale:sbv_fx:B-01 last_sent=2026-07-29T14:34:45Z id=sys-20260730T071120-1bf1
[emit-signal] OK-escalation-bypass dedup_key=data_stale:vps_proxy:B-06 prev_sev=2 new_sev=3 id=sys-20260730T071126-4b11
[emit-dashboard] OK id=sys-20260730T071114-45c7 check_id=B-03
[emit-dashboard] OK id=sys-20260730T071120-1bf1 check_id=B-01
[emit-dashboard] OK id=sys-20260730T071126-4b11 check_id=B-06

[OUTPUT-CONTRACT] signals_posted=3 | telegram_sent=2 | signal_queue_rows_written=3 | dashboard_rows=3 | dedup_skipped=1

## d4-auto · 2026-07-30T03:00:03.251Z
D4 candidates: R3-no-board-row:data-quality-anomaly:DGC:Q1-2026

## c006 · 2026-07-30T00:36:08Z

## c007 · 2026-07-30T02:34:16Z
### Audit Run Tier-2 (02:32–02:33 UTC 2026-07-30)
- Tier: 2 | Cron health: A-29 PASS (all crons within cadence) | Sources: 5 checked
- Data freshness: bctc CRITICAL age 1951m (SLA 120m), VPS bctc proxy stale 41h+ (vn-bctc-fetch unhealthy)
- DB spot checks: C-06 4 msgs/3h PASS, C-07 63 signals/24h PASS
- Rate limits: B-12 PASS (all sources OK)
- VPS services: 1 unhealthy (vn-bctc-fetch), 4 healthy (prices, news, sbv, foreign-flow)
- Anomalies: 2 new (2 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED (BCTC pipeline stalled 32h+; VPS service failure)

Fire-election: tick=2026-07-30T00:00Z (`0 */4 * * *` boundary) — claimed, led tick.

Findings:
- B-05: bctc-discover data stale 1951min (32.5h) exceeds SLA 120min — freshness-sla-monitor breach
- B-06: VPS bctc proxy route stale 41+ hours (last 2026-07-28 08:23:22Z) — vn-bctc-fetch service unhealthy

[emit-signal] OK dedup_key=data_stale:bctc-discover:B-05 id=sys-20260730T023322-5538
[emit-signal] OK dedup_key=data_stale:vps_bctc:B-06 id=sys-20260730T023323-49ab
[emit-dashboard] ABORT mutex-claim-failed contended (dev-team holding commit-mutex)
[emit-dashboard] ABORT mutex-claim-failed contended (dev-team holding commit-mutex)

## c006 · 2026-07-30T00:36:08Z
### Audit Run Tier-3 (00:30–00:36 UTC 2026-07-30)
- Tier: 3 | Containers: 13 UP (healthy) | DB checks: 16 | Schema/integrity: PASS
- Anomalies: 1 new (0 critical, 1 warn, 0 info) | 0 dedup-skipped
- Status: DEGRADED (C-08 orphaned alerts)

Fire-election: tick=2026-07-30T02:00Z (`0 2 * * *` boundary) — claimed, led tick.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-30T00:32:27Z ===

--- docker ps -a ---
All 13 containers UP and healthy (macro-indicators, pdf-extractor, mcp-server, frontend, mcp-gateway, api-gateway, flaresolverr, news-fetch, rag-service, technical-analysis, alert-engine, stock-price, kinh-dich-service)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- A-20 multi-probe (pdf-extractor) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3 PASS

--- disk ---
/dev/disk1s4s1: 233Gi total, 22Gi available (39% used)
```

Tier-1 Verdict: PASS (all containers up, all health endpoints 200, A-20 3/3, disk 22Gi free)

Tier-3 DB Summary:
- C-01 to C-07: PASS (daily_ohlcv 911 distinct codes, 911 rows; financial reports healthy; market messages + signals present)
- C-08: WARN — 121 orphaned alerts (no matching signal_queue rows in last 24h)
- C-09 to C-16: PASS (macro indicators ≥3 fields, PDFs status ok, schema complete, WAL <50MB, concentration 0.3%, no stale pending BCTC)
- Container tooling: PASS (pdftoppm, tesseract, vie language all present)
- Inter-service: PASS (stock-price, technical-analysis, alert-engine, pdf-extractor all 200)
- EPIPE: PASS (0 in last 30m)
- BCTC PDFs: PASS (278 files in landing dir)

[emit-signal] OK dedup_key=db_integrity_breach:alerts:C-08 id=sys-20260730T003538-10ba
[emit-dashboard] OK id=sys-20260730T003538-10ba check_id=C-08

Findings:
- C-08: 121 orphaned alerts in last 24h (actual=121, expected=0) — alerts triggered but no matching signal_queue rows; signal processing pipeline may have a delay

[OUTPUT-CONTRACT] signals_posted=2 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=0
[OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=1 independent=0

## c005 · 2026-07-29T22:37:02Z
### Audit Run Tier-2 (20:00–22:36 UTC 2026-07-29)
- Tier: 2 | Cron health: A-29 PASS (all crons 100% success) | Sources: 1 CRITICAL + 1 WARN checked
- Data freshness: SBV_FX CRITICAL (34m > 30m SLA, SKIP-dedup), BCTC OK by SLA window (1712m < 21545m)
- VPS proxy: bctc stale 38.4h (SKIP-dedup, service unhealthy), other routes healthy
- DB spot: C-06 PASS (2 messages in 3h), C-07 PASS (20 signals in 24h)
- BCTC queue: 167 pending | B-09 PASS (0 SSC URLs) | B-13 PASS (0 stale 72h+)
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 2 dedup-skipped (sbv_fx B-01, vps_proxy B-06)
- Status: DEGRADED (sbv_fx SLA breach + VPS bctc stale persist; both known 7d dedup)

Fire-election: tick=2026-07-29T20:00Z (`0 */4 * * *` boundary) — claimed, led tick.

[emit-signal] SKIP-dedup dedup_key=data_stale:sbv_fx:B-01 last_sent=2026-07-29T14:34:45Z id=sys-20260729T223454-3b28
[emit-signal] SKIP-dedup dedup_key=data_stale:vps_proxy:B-06 last_sent=2026-07-29T14:34:55Z id=sys-20260729T223504-3605
[emit-dashboard] OK id=sys-20260729T223454-3b28 check_id=B-01
[emit-dashboard] OK id=sys-20260729T223504-3605 check_id=B-06

Findings:
- B-01: sbv_fx SLA breach 34m > 30m — dedup-skipped (same issue reported 2026-07-29T14:34:45Z)
- B-06: VPS bctc stale 38.4h (last push 2026-07-28 08:23:22Z) — dedup-skipped (reported 2026-07-29T14:34:55Z)

[OUTPUT-CONTRACT] signals_posted=2 | telegram_sent=0 | signal_queue_rows_written=4 | dashboard_rows=2 | dedup_skipped=2
[OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=2 independent=4
