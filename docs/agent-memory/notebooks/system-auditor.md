[NB] Total lines:       ~200L (post-cycle-cap)
<!-- System Auditor Notebook — Tier-1/2/3 audit cycle log. NEWEST-FIRST ordering. Max 200L total. -->

## c284 · 2026-06-09T00:36:26Z
### Audit Run Tier-1 (00:36 UTC 2026-06-09, Tuesday → 07:36 VN)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway (not in host_runtime_set, INFO skip).
- Restart count: mcp-server=2 (PASS, ≤2); memory=67.79% (PASS, <85%); disk=37% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes, no event-loop stall).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c283 · 2026-06-09T00:33:17Z
### Audit Run Tier-3 (00:30 UTC 2026-06-09 → 2026-06-09 07:30 VN, Tuesday)
- Tier: 3 | Services: 6 checked | DB checks: C-01..C-16 + tooling A-22..A-31
- Anomalies: 4 new (1 CRITICAL, 3 WARN) | Dedup: 0 skipped
- Status: DEGRADED (C-09 macro-refresh failure critical)
- A-22/23/24 tooling: pdftoppm ✓, tesseract ✓, vie lang ✓
- A-31 EPIPE: 0 crashes (≤2 pass)
- B-08 BCTC PDFs: 60 present (>0 pass)
- C-01/C-02 OHLCV: 1591 tickers (≥25 pass), 1591 rows (>0 pass)
- C-03 Q1 2026 actions: 27 (≥26 pass)
- C-04 low-confidence extractions 7d: 7 (>5 threshold) — WARN
- C-05 bad SSC URLs: 0 (pass)
- C-06 market_messages 3h: 0 (expects >0) — WARN
- C-08 orphaned alerts 24h: 41 (expects 0) — WARN
- C-09 macro_countries 26h: 1 (expects ≥8) — CRITICAL
- C-10 failed PDFs 24h: 0 (≤2 pass)
- C-12 PRAGMA integrity: market.db OK, pdf_extractor.db OK
- C-13 WAL size: 15.73MB <50MB (pass), no WAL on pdf_extractor
- C-14 concentration: 0.2% (<60% pass)
- C-15 schema: 4/4 required columns present
- C-16 stale BCTC 72h: 26 (dedup-skip c112 active)
- Signals emitted: 4 new (C-09/C-08/C-06/C-04)
- Contract: signals_posted=4 | telegram_sent=4 | signal_queue_rows_written=4 | dashboard_rows=4

## c282 · 2026-06-09T00:05:10Z
### Audit Run Tier-1 (00:05 UTC 2026-06-09 → 2026-06-09 07:05 VN)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway (not in host_runtime_set, INFO skip).
- Restart count: mcp-server=2 (PASS, ≤2); memory=52.72% (PASS, <85%); disk=38% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes, no event-loop stall).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c281 · 2026-06-08T23:35:00Z
### Audit Run Tier-1 (23:35 UTC 2026-06-08 → 2026-06-09 06:35 VN)
- Tier: 1 | Services: 6 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor, mcp-gateway)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 6 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200, mcp-gateway (not in host_runtime_set, INFO skip).
- Restart count: mcp-server=2 (PASS, ≤2); memory=48.49% (PASS, <85%); disk=38% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes, no event-loop stall).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0

## c280 · 2026-06-08T23:05:54Z
### Audit Run Tier-1 (23:05 UTC 2026-06-08)
- Tier: 1 | Services: 5 checked (mcp-server, api-gateway, frontend, macro-indicators, pdf-extractor)
- Anomalies: 0 new | Status: HEALTHY
- RAW-PROBE: all 5 services UP/healthy (docker ps); health endpoints: mcp-server 3000→200, api-gateway 4000→200, macro-indicators 5004→200, pdf-extractor 5001→200, frontend 3001→200.
- Restart count: mcp-server=2 (PASS, ≤2); memory=51.04% (PASS, <85%); disk=39% used/233GB (PASS).
- A-20 pdf-extractor multi-probe: 3/3 PASS (in-container health HTTP 200 all probes, no event-loop stall).
- Contract: signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0
