# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

## c507 · 2026-07-03T00:15:33Z
### Audit Run Tier-1 (00:14–00:15 UTC 2026-07-03)
- Tier: 1 | Fire-election: WON (tick=2026-07-03T00:00Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 50.09% memory (PASS)
- A-32: 45% disk (PASS) | Crons: All healthy (100+ jobs, success_rate 98-100%)
- Anomalies: 0 new | Status: HEALTHY

## c506 · 2026-07-02T23:45:00Z
### Audit Run Tier-1 (23:44–23:45 UTC 2026-07-02)
- Tier: 1 | Fire-election: ROUTER-HELD (tick=2026-07-02T23:30Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 46.21% memory (PASS)
- A-32: 45% disk (PASS) | Crons: All healthy (100+ jobs, success_rate 80-100%)
- Anomalies: 0 new | Status: HEALTHY

## c505 · 2026-07-02T23:15:20Z
### Audit Run Tier-1 (23:14–23:15 UTC 2026-07-02)
- Tier: 1 | Fire-election: ROUTER-HELD (tick=2026-07-02T23:00Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 43.45% memory (PASS)
- A-32: 45% disk (PASS) | Crons: All healthy (100+ jobs, success_rate 80-100%)
- Anomalies: 0 new | Status: HEALTHY

## c504 · 2026-07-02T22:45:10Z
### Audit Run Tier-1 (22:44–22:45 UTC 2026-07-02)
- Tier: 1 | Fire-election: ROUTER-HELD (tick=2026-07-02T22:30Z) | Services: 12/12 UP
- Health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend)
- A-20 pdf-extractor multi-probe: 3/3 PASS (event-loop healthy)
- A-21: RestartCount=4 (baseline, no change) | A-30: 41.62% memory (PASS)
- A-32: 45% disk (PASS) | Crons: All healthy (100+ jobs, success_rate 80-100%)
- Anomalies: 0 new | Status: HEALTHY
