## c112 · 2026-06-08T08:35:50Z
### Audit Run Tier-1 (08:35 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: 6 services all UP/healthy (mcp-server/api-gateway/frontend/macro-indicators/mcp-gateway/pdf-extractor); all health endpoints HTTP 200; restart=0; memory=22.81%; disk=29%.
- Findings: All host_runtime_set services healthy. All health endpoints responding. Inter-service pdf-extractor:5001/health OK. EPIPE count 0 in 30min. BCTC PDFs 60 files healthy. No anomalies detected.
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c111 · 2026-06-08T08:07:20Z
### Audit Run Tier-1 (08:07 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 dedup-skipped (A-20 within 7-day window, prev c106/c105) | Status: DEGRADED (recurring)
- RAW-PROBE: 6 services all UP/healthy; health endpoints OK except pdf-extractor A-20 timeout (curl 3s max-time fails); restart=0; memory=12.76%; disk=27%.
- Findings: pdf-extractor A-20 health timeout recurring (container UP in docker ps, /health probe curl fails). Signal row: sau-c111-a20 (WARN). Dedup active (no BUG).
- Contract: signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c110 · 2026-06-08T07:54:33Z
### Audit Run Tier-2 (07:54 UTC 2026-06-08)
- Tier: 2 | Crons: 63 checked | Sources: 28 checked | VPS routes: 4 OK
- Anomalies: 1 CRITICAL-dedup (B-12 SBV stale) | Status: DEGRADED
- A-29 crons: 63 nominal, vnstockFundamentalsRefresh crashed (isolated).
- B-01..B-07 pipeline: prices/BCTC/foreign-flow/news fresh; SBV stale 26.9h (>24h threshold) CRITICAL.
- B-06/B-07 VPS health: 4 routes OK (prices/news/sbv/bctc). SBV last push 2026-06-07 04:59:57Z.
- B-09 BCTC URLs: 0 bad SSC URLs (PASS). B-13 stale BCTC: 0 pending >72h (PASS).
- C-06/C-07 DB freshness: market_messages 2/3h OK, agent_signals 87/24h OK.
- Signals: 1 emitted (B-12 continuation). BUG Telegram: skipped (dedup active from c107).
- Signal Queue: 1 row appended (sau-c109-b12-continuation, CRITICAL).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c109 · 2026-06-08T07:54:37Z
### Audit Run Tier-1 (07:54 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE summary: All 6 host_runtime_set services UP and HEALTHY. All health endpoints OK (including pdf-extractor). Memory <85%. Disk <85%. Restart count nominal. No anomalies detected.
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c108 · 2026-06-08T02:34:40Z
### Audit Run Tier-1 (02:34 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 0 new | Status: HEALTHY
- Findings: All 6 host_runtime_set services UP and HEALTHY. All health endpoints OK. Memory <85%. Disk <85%. Restart count nominal. No anomalies detected. System status: all circuit breakers OK. Cron health: one job crashed (vnstockFundamentalsRefresh, not Tier-1 scope — Tier-3 detail).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c107 · 2026-06-08T02:01:54Z
### Audit Run Tier-2 (02:01 UTC 2026-06-08)
- Tier: 2 | Crons: 63 checked | Sources: 28 checked | VPS routes: 4 OK
- Anomalies: 1 CRITICAL (B-12 SBV stale) | Status: DEGRADED
- A-29 crons: All 63 firing normally, no gaps. intelligenceCycleJob 99.1% success (562 runs).
- B-01..B-07 pipeline: Prices/BCTC/foreign-flow fresh, news 10min <30min OK, SBV 21h+ stale.
- B-06/B-07 VPS health: All 4 routes OK, push logs show sbv/news stale vs expected cadence.
- B-12 SLA CRITICAL: sbv_fx 47min breach (30min threshold). sbvRatesRefreshJob ran 2026-06-08 00:00Z success, but market.db fetch timestamp stale. Clock skew or silent fetch fail suspected.
- Signals: 1 emitted (CRITICAL sau-c107-b12). BUG Telegram: B-12 sbv-stale (new, no dedup).
- Contract: signals_posted=1 | telegram_sent=1 | signal_queue_rows_written=1 | dashboard_rows=1

## c106 · 2026-06-08T01:34:12Z
### Audit Run Tier-1 (01:34 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 dedup-skipped (A-20 within 7-day window, prev 2026-06-08T01:03:42Z) | Status: DEGRADED (recurring)
- Findings: pdf-extractor health timeout recurrence (A-20). Container UP and responding to logs show health OK, but probe curl timeout during audit window. Consistent with session context: "pdf-extractor restart/health flap during your run is EXPECTED." Issue already in signal_queue (sau-c105-a20, 30min ago). 7-day dedup active: no BUG Telegram sent.
- Signals: 0 posted (BUG dedup) | Signal Queue: 1 row appended (A-20 continuation)
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c105 · 2026-06-08T01:03:42Z
### Audit Run Tier-1 (01:03 UTC 2026-06-08)
- Tier: 1 | Services: 6 checked (all host_runtime_set)
- Anomalies: 1 dedup-skipped (A-20 within 7-day window, prev 2026-06-07T23:04Z) | Status: DEGRADED (known issue)
- Findings: pdf-extractor unhealthy + health endpoint timeout (A-20). Regression since c103 (00:07Z showed passing). Within 7-day dedup window (prev report 2026-06-07T23:04:13Z). No BUG Telegram (dedup). Signal row appended to signal_queue per audit protocol.
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=0

## c104 · 2026-06-08T00:30:43Z
### Audit Run Tier-3 (00:30 UTC 2026-06-08)
- Tier: 3 | Checks: A-22/A-24 (tooling ✓) + C-01..C-16 | Runtime: 360s | Status: CRITICAL
- Anomalies: 4 (1 CRITICAL, 3 WARN) | Dedup-skipped: 0
- C-Checks: C-01/C-02 SKIP (no trading data pre-market) | C-03 ✓ (26 codes) | C-04 WARN (8 low-conf >5) | C-05 ✓ | C-06 ✓ (2 msgs/3h) | C-07 ✓ (87 signals/24h) | C-08 WARN (3 orphaned) | C-09 WARN (0 countries/26h) | C-10 ✓ | C-11 ✓ (earnings window) | C-12 ✓ (integrity ok) | C-13 ✓ (WAL 6MB <50MB) | C-14 SKIP (C-01=0) | C-15 ✓ (schema) | C-16 CRITICAL (338 stale pending BCTC >72h)
- Contract: signals_posted=4 | telegram_sent=4 | signal_queue_rows_written=4 | dashboard_rows=4
