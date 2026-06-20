# System Auditor Notebook

## c407 · 2026-06-20T00:03:22Z
### Audit Run Tier-3 (00:03 UTC 2026-06-20)
- Tier: 3 | Checks: A-22..A-28 + B-08 + C-01..C-16 + integrity
- Anomalies: 2 new (1 WARN, 1 INFO)
- Status: HEALTHY with minor integrity findings
- Tier-1 (runtime): all 12 containers UP, mcp-server 27.32% mem, 0 restarts, 0 EPIPE
- Tier-3 (DB integrity): market.db + pdf_extractor.db both "ok" on PRAGMA check, WAL < 50MB ✓
- C-01..C-05 PASS: daily_ohlcv 949 rows, financial_reports Q1 32 actions, no SSC URLs pending
- C-06..C-07 INFO: 0 market_messages (weekend market closed), 107 agent_signals 24h ✓
- **C-04 WARN**: 13 financial_reports with extraction_confidence<0.2 (threshold ≤5) — emitted signal
- **C-08 INFO**: 10 orphaned alerts 24h (1319 all-time, 88% of 1495 total); by design: most alerts lack 1:1 signal; trend: 103→63→33→10 (declining) — emitted signal
- C-09..C-16 PASS: macro indicators 3 cols ✓, PDF status 0/0 ✓, WAL clean, top-3 concentration 0.3%, schema 4/4 cols, stale BCTC queue 0
- Tooling OK: pdftoppm, tesseract, vie lang all present
- Inter-service connectivity: stock-price, ta, alert-engine, pdf-extractor all HEALTHY
- Signals written: 2 rows to signal_queue.rows[]

## c406 · 2026-06-19T23:37:41Z
### Audit Run Tier-1 (23:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓
- A-01..A-11 containers: 11/12 UP ✓ (mcp-server 5h, api-gateway 8d, frontend 3d, stock-price 4d, ta 4d, macro 4d, kinh-dich 5d, pdf-extractor 3d, rag 3h, news 9d, alert 9d)
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-21 restart count: mcp-server=0 PASS ✓
- A-30 memory: mcp-server 27.03% / 2GiB ✓
- A-32 disk: 34% ✓

## c405 · 2026-06-19T23:07:35Z
### Audit Run Tier-1 (23:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓
- A-01..A-11 containers: all 12 UP ✓ (mcp-server 4h, api-gateway 8d, frontend 3d, stock-price 4d, ta 4d, macro 4d, kinh-dich 5d, pdf-extractor 3d, rag 2h, news 9d, alert 9d)
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓
- A-30 memory: mcp-server 25.64% / 2GiB ✓
- A-31 EPIPE: 0 ✓ | A-32 disk: 35% ✓

## c404 · 2026-06-19T22:44:00Z
### Audit Run Tier-1 (22:44 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓
- A-01..A-11 containers: all 12 UP ✓ (mcp-server 4h, api-gateway 8d, frontend 3d)
- A-12..A-19 health: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓
- A-20..A-24 tooling: pdftoppm ✓ tesseract ✓ vie lang ✓
- A-25..A-28 inter-svc: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: 25.00% / 2GiB ✓ | A-31 EPIPE: 0 ✓ | A-32 disk: 33% ✓
