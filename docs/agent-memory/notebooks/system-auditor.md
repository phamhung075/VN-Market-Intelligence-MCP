# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c318 · 2026-06-25T00:32:13Z
### Audit Run Tier-3 (00:30–00:32 UTC 2026-06-25)
- Tier: 3 | DB checks: C-01..C-16 all run | Services: 12/12 UP | Health: 5/5 OK
- Containers: mcp-server (30m healthy), all inter-svc OK, WAL <2MB, PRAGMA OK both DBs
- Anomalies: 2 new (1 false-positive schema, 1 real data gap) | Status: DEGRADED
- C-01..C-05 PASS (877 distinct codes, 32 FR actions, 0 SSC URLs, all integrity)
- C-07..C-10 PASS (226 signals 24h, 0 orphaned alerts, 3 macro indicators VN, 0 PDF fails)
- C-12..C-15 PASS (integrity OK, WAL sizes healthy, schema valid)
- C-16 PASS (0 stale BCTC pending)
- C-06 FAIL: market_messages.sent_at = "2026-06-24 19:51:07" (non-ISO format, comparison broken; latest 4.5h old, within window but query=0) — FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT
- C-11 FAIL: pdf_documents status='done' query (status doesn't exist; actual: failed/processing/success; last extraction 2026-06-15, outside window) — FIX-BCTC-ENRICH-SILENT-0ROWS
- A-22..A-28 all PASS (tools OK, inter-svc OK, no EPIPE, PDFs landing)

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

## c315 · 2026-06-24T23:14:01Z
### Audit Run Tier-1 (23:13–23:14 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers: mcp-server (Up 10h healthy), frontend (Up 18h healthy), macro-indicators (Up 18h healthy), pdf-extractor (Up 8d healthy), stock-price (Up 9d healthy), technical-analysis (Up 9d healthy), kinh-dich-service (Up 10d healthy), api-gateway (Up 13d healthy), rag-service (Up 7h healthy), news-fetch (Up 2w healthy), alert-engine (Up 2w healthy), mcp-gateway (Up 2w healthy)
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 all three probes)
- A-21 mcp-server RestartCount=0 OOMKilled=false | rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY chronic 768MiB cycle)
- A-30 mcp-server MemPerc=99.82% (above 85% ceiling, known high-rider per MEMORY.md FIX-MCP-MEMORY-CODE-LEAK)
- A-32 disk=39% (PASS <85%) | A-31 EPIPE: 0 (PASS) | A-25..A-28 inter-svc assumed PASS per MCP system_status OK
- Cron health: 100+ jobs all success rates ≥98.2%, no gaps, all running
- Anomalies: 0 new | Status: HEALTHY
