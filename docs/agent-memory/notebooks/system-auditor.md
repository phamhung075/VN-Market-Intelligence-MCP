# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c320 · 2026-06-25T01:13:55Z
### Audit Run Tier-1 (01:13 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (1h healthy), frontend (20h healthy), macro-indicators (20h healthy), pdf-extractor (9d healthy), stock-price (9d healthy), technical-analysis (9d healthy), kinh-dich-service (10d healthy), api-gateway (13d healthy), rag-service (21m healthy), news-fetch (2w healthy), alert-engine (2w healthy), mcp-gateway (2w healthy)
- A-20 pdf-extractor: 3/3 multi-probe 200 PASS (event-loop responsive)
- A-21 mcp-server RestartCount=1 (recent restart OK) | rag-service RestartCount=109 (KNOWN-STANDING FU-RAG-DEPLOY 768MiB OOM cycle, steady ~1/hr, no escalation)
- A-30 mcp-server MemPerc=32.22% (660/2048 MiB, healthy <85%) | A-32 disk=39% (21Gi free, PASS)
- Cron: 100+ jobs all running, latest success rates ≥98.1%, no gaps detected
- Anomalies: 0 new | Status: HEALTHY

## c319 · 2026-06-25T00:43:02Z
### Audit Run Tier-1 (00:43 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (59m healthy), frontend (19h healthy), macro-indicators (20h healthy), pdf-extractor (8d healthy), stock-price (9d healthy), technical-analysis (9d healthy), kinh-dich-service (10d healthy), api-gateway (13d healthy), rag-service (9h healthy), news-fetch (2w healthy), alert-engine (2w healthy), mcp-gateway (2w healthy)
- A-21 mcp-server RestartCount=1 (recent restart OK) | rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY chronic 768MiB OOM cycle, no escalation)
- A-30 mcp-server MemPerc=27.44% (562/2048 MiB, healthy <85% ceiling) | A-32 disk=40% (20Gi free, PASS)
- A-25..A-28 inter-svc connectivity: all services reporting OK via api-gateway /health
- Anomalies: 0 new | Status: HEALTHY

## c318 · 2026-06-25T00:32:13Z
### Audit Run Tier-3 (00:30–00:32 UTC 2026-06-25)
- Tier: 3 | DB checks: C-01..C-16 all run | Services: 12/12 UP | Health: 5/5 OK
- Containers: mcp-server (30m healthy), all inter-svc OK, WAL <2MB, PRAGMA OK both DBs
- Anomalies: 2 new (1 false-positive schema, 1 real data gap) | Status: DEGRADED
- C-01..C-05 PASS (877 distinct codes, 32 FR actions, 0 SSC URLs, all integrity)
- C-07..C-10 PASS (226 signals 24h, 0 orphaned alerts, 3 macro indicators VN, 0 PDF fails)
- C-12..C-15 PASS (integrity OK, WAL sizes healthy, schema valid)
- C-16 PASS (0 stale BCTC pending)
- C-06 FAIL: market_messages.sent_at format issue; latest 4.5h old — FIX-MARKET-MESSAGES-TIMESTAMP-FORMAT
- C-11 FAIL: pdf_documents status mismatch; last extraction 2026-06-15 — FIX-BCTC-ENRICH-SILENT-0ROWS
- A-22..A-28 all PASS (tools OK, inter-svc OK, no EPIPE, PDFs landing)
