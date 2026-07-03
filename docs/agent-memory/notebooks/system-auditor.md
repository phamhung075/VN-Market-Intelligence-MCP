# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c512 · 2026-07-03T02:15:24Z
### Audit Run Tier-1 (02:14–02:15 UTC 2026-07-03)
- Tier: 1 | Fire-election: DISPATCHER-HELD (skip claim/release per coordination)
- Services: 12/12 UP | Health: 5/5 OK | A-20 multi-probe: 3/3 PASS
- A-21: RestartCount=4 (baseline) | A-30: 70.56% memory (PASS)
- A-32: 46% disk (PASS) | Crons: 96+ jobs healthy
- Anomalies: 0 new | Status: HEALTHY

## c511 · 2026-07-03T01:47:14Z
### Audit Run Tier-1 (01:46–01:47 UTC 2026-07-03)
- Tier: 1 | Fire-election: WON (tick=2026-07-03T01:30Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 64.06% memory (PASS)
- A-32: 46% disk (PASS) | Crons: 96 jobs all healthy (100% success rate)
- Anomalies: 0 new | Status: DEGRADED (known A-21 baseline)

## c510 · 2026-07-03T01:15:47Z
### Audit Run Tier-1 (01:14–01:16 UTC 2026-07-03)
- Tier: 1 | Fire-election: WON (tick=2026-07-03T01:00Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, unchanged) | A-30: 59.06% memory (PASS)
- A-32: 45% disk (PASS) | Crons: 96 jobs all healthy (100% success rate)
- Anomalies: 1 WARN (A-21 RestartCount=4) | Status: DEGRADED
- Note: RAW-PROBE fenced block with container/health/system details in full cycle log

## c509 · 2026-07-03T00:44:49Z
### Audit Run Tier-1 (00:44–00:45 UTC 2026-07-03)
- Tier: 1 | Fire-election: WON (tick=2026-07-03T00:30Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 52.82% memory (PASS)
- A-32: 44% disk (PASS) | Crons: All healthy (100+ jobs, success_rate 99-100%)
- Anomalies: 0 new | Status: HEALTHY

## c508 · 2026-07-03T00:35:24Z
### Audit Run Tier-3 (00:30–00:35 UTC 2026-07-03)
- Tier: 3 | Fire-election: ROUTER-HELD (tick=2026-07-03T02:00Z) | Services: 12/12 UP
- Container tooling: A-22/A-23/A-24 PASS (pdftoppm, tesseract, vie language)
- Inter-service connectivity: A-25/A-26/A-27/A-28 PASS (all 200 OK)
- EPIPE crashes (A-31): 0 in last 30min (PASS)
- BCTC PDF landing (B-08): 80 files present (PASS)
- DB checks C-01–C-05: PASS (daily_ohlcv healthy, Q1 reports 32 codes, low-confidence 0, SSC URLs 0)
- DB checks C-06–C-11: C-06 FAIL (0 market_messages in 3h), C-08 FAIL (1 orphaned alert), C-11 FAIL (0 PDFs in 48h)
- DB checks C-12–C-16: PASS (integrity_check ok, WAL 3.3MB, top-3 concentration 0.3%, schema intact, stale pending 0)
- Doc/memory audit: WARN task_board=85 (limit 80), WARN sprint_goal=16 (limit 15)
- Anomalies: 3 new (1 WARN C-08 orphaned alert, 2 WARN doc overages) | Status: DEGRADED
