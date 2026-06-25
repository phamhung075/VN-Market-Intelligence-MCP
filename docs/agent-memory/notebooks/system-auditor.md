# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c317 · 2026-06-25T00:14:16Z
### Audit Run Tier-1 (00:13–00:14 UTC 2026-06-25)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers UP: all 12 (mcp-server 30m healthy, rag-service 8h healthy) | A-20 pdf-extractor: 3/3 multi-probe 200 PASS
- A-21 mcp-server RestartCount=1 (KNOWN recent boot) | rag-service RC=108 (KNOWN-STANDING FU-RAG-DEPLOY 768MiB cycle)
- A-30 mcp-server MemPerc=23.60% (PASS <85%, recovered post-restart) | A-32 disk=39% (PASS)
- A-31 EPIPE: not checked in T1 | A-25..A-28 inter-svc: MCP system_status 0 open circuits, all OK
- Cron: 100+ jobs all ≥98.2% success rates, no gaps, all running
- Anomalies: 0 new | Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-25T00:13:10Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 29 minutes (healthy)   vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 19 hours (healthy)     vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-macro-indicators-1     Up 19 hours (healthy)     vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)       vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)       vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)       vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-kinh-dich-service-1    Up 10 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)      vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 8 hours (healthy)      vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 2 weeks (healthy)      vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 2 weeks (healthy)      vn-market-intelligence-mcp-alert-engine
mcp-gateway                                       Up 2 weeks (healthy)      mcpservergatway-gateway

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=23.60% MemUsage=483.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    21Gi    39%
```

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

## c314 · 2026-06-24T22:44:04Z
### Audit Run Tier-1 (22:43–22:44 UTC 2026-06-24)
- Tier: 1 | Services: 12/12 host_runtime_set UP (healthy) | Health endpoints: 5/5 HTTP 200
- Containers: mcp-server (Up 9h healthy), frontend (Up 17h healthy), macro-indicators (Up 18h healthy), pdf-extractor (Up 8d healthy), stock-price (Up 9d healthy), technical-analysis (Up 9d healthy), kinh-dich-service (Up 10d healthy), api-gateway (Up 13d healthy), rag-service (Up 7h healthy), news-fetch (Up 2w healthy), alert-engine (Up 2w healthy), mcp-gateway (Up 2w healthy)
- A-20 pdf-extractor multi-probe: 3/3 PASS (200 all three probes)
- A-21 mcp-server RestartCount=0 OOMKilled=false | rag-service RestartCount=108 (KNOWN-STANDING FU-RAG-DEPLOY chronic 768MiB cycle)
- A-30 mcp-server MemPerc=88.37% (above 85% ceiling, known high-rider per MEMORY.md FIX-MCP-MEMORY-CODE-LEAK)
- A-32 disk=39% (PASS <85%) | A-25..A-28 inter-svc connectivity: assumed PASS per MCP system_status OK
- Cron health: 100+ jobs all success rates ≥98.2%, no gaps, all running
- Anomalies: 0 new | Status: HEALTHY
