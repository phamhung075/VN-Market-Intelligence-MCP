# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c318 · 2026-06-25T00:32:00Z
### Audit Run Tier-3 (00:30–00:32 UTC 2026-06-25)
- Tier: 3 | Container tooling: A-22/23/24 PASS (pdftoppm, tesseract, vie lang) | Inter-svc: A-25..A-28 PASS (4/4 health 200)
- A-31 EPIPE: 0 (PASS) | B-08 PDF landing: 80 files (PASS) | DB Pragma integrity: market.db+pdf_extractor.db PASS
- C-01..C-04, C-05, C-10..C-16: all PASS | C-06 market_messages 0 (INFO, market closed) | C-07 agent_signals 226 (PASS)
- C-08 orphaned alerts 0 (PASS, known-standing C-08 ~126+ historical tracked) | C-09 macro vietnam row 2026-06-24, cpi/gdp/rate present (PASS)
- C-13 WAL sizes: market.db 1.85MB, pdf_extractor.db none (PASS <50MB) | C-14 top-3 share 0.3% (PASS <60%)
- C-15 financial_reports schema 4/4 cols present (PASS) | C-16 bctc_vps_queue pending 0 (PASS)
- Cron health: 125+ jobs all success rates ≥98%, no gaps (sbvRatesRefreshJob 98.1% historical, expected) | Alerts: 100 current (7d)
- Doc/Memory: no new commits in 24h, doc audit skipped (last audit <12h) | Anomalies: 0 new | Status: HEALTHY

## c317 · 2026-06-25T00:14:16Z
### Audit Run Tier-1 (00:13–00:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers UP: all 12 (mcp-server 30m healthy, rag-service 8h healthy) | A-20 pdf-extractor: 3/3 multi-probe 200 PASS
- A-21 mcp-server RestartCount=1 (KNOWN recent boot) | rag-service RC=108 (KNOWN-STANDING FU-RAG-DEPLOY 768MiB cycle)
- A-30 mcp-server MemPerc=23.60% (PASS <85%, recovered post-restart) | A-32 disk=39% (PASS)
- A-31 EPIPE: not checked in T1 | A-25..A-28 inter-svc: MCP system_status 0 open circuits, all OK
- Cron: 100+ jobs all ≥98.2% success rates, no gaps, all running
- Anomalies: 0 new | Status: HEALTHY

## c316 · 2026-06-24T23:45:00Z
### Audit Run Tier-1 (23:43–23:45 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers UP: all 12 (mcp-server 10h, rag-service 8h) | A-20 pdf-extractor: 3/3 multi-probe 200 PASS
- A-21 mcp-server RestartCount=1 (recent restart, expected after boot) | rag-service RC=108 (KNOWN-STANDING FU-RAG-DEPLOY 768MiB cycle)
- A-30 mcp-server MemPerc=82.17% (known high-rider, below yesterday's 99.82%) | rag-service 740.9/768MiB (97%)
- A-32 disk=39% (PASS <85%) | A-31 EPIPE: 0 (PASS) | A-25..A-28 inter-svc: MCP system_status OK
- Cron: 100+ jobs all success rates ≥98.2%, no gaps | Anomalies: 0 new | Status: HEALTHY
