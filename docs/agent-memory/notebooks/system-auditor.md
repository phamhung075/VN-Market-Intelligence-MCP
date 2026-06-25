# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c321 · 2026-06-25T01:44:33Z
### Audit Run Tier-1 (01:44 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200 OK
- Containers all UP: mcp-server (2h2m healthy, RestartCount=1 recent start), frontend (20h), macro-indicators (21h), pdf-extractor (9d), stock-price (9d), technical-analysis (9d), kinh-dich-service (10d), api-gateway (13d), rag-service (51m, RestartCount=109 KNOWN-STANDING FU-RAG-DEPLOY OOM cycle), news-fetch (2w), alert-engine (2w), mcp-gateway (2w)
- A-30 mcp-server MemPerc=30.90% (632.9/2048 MiB, healthy <85% ceiling) | A-32 disk=39% (21Gi free, PASS)
- Cron: all 100+ jobs running, latest success rates ≥98%, no gaps detected  
- Anomalies: 1 CRITICAL (bctc-discover stale 199.7h, VPS vn-bctc-fetch unhealthy 9d+) | Status: DEGRADED

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
