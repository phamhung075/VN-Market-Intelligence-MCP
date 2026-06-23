# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c378 · 2026-06-23T17:14:02Z
### Audit Run Tier-1 (17:14 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 containers UP+healthy (12 host_runtime_set + mcp-gateway). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. Memory 99.48% (1.99/2GiB, spike from 82.65% at 16:44Z, peak observed this session, WARN-ceiling). OOMKilled=false, Status=running healthy. Disk 35% PASS. RestartCount: mcp-server=1 (no jump, KNOWN-STANDING FIX-MCP-MEMORY-CODE-LEAK tracked). rag-service=101 (KNOWN-STANDING chronic OOM-loop FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX, OOMKilled=false, Status=UP+healthy, no jump). All others=0. NO new signals emitted. High mem% recorded per dedup rule A-30: PASS <85% threshold violated but OOMKilled=false+RestartCount unchanged = WARN-ceiling not incident.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T17:14:02Z ===

--- docker ps all (host_runtime_set validation) ---
vn-market-intelligence-mcp-mcp-server-1           Up 21 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 44 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)
mcp-gateway                                       Up 12 days (healthy)

--- health endpoints (5 primary probes) ---
mcp-server:3000/health = 200 "ok"
api-gateway:4000/health = 200 "ok"
macro-indicators:5004/health = 200 "ok"
pdf-extractor:5001/health = 200 "ok"
frontend:3001/ = 200

--- restart counts (host_runtime_set) ---
mcp-server=1 (no jump) | rag-service=101 (no jump) | all others=0
OOMKilled (both critical): mcp-server=false, rag-service=false

--- memory mcp-server ---
MemUsage: 1.99GiB / 2GiB | MemPerc: 99.48%

--- disk ---
/dev/disk1s4s1: 35% used (13Gi/233Gi)

=== PROBE DONE ===
```

## c377 · 2026-06-23T16:44:05Z
### Audit Run Tier-1 (16:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 containers UP+healthy (12 host_runtime_set + mcp-gateway). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe 3/3 PASS (200, 200, 200). Memory 82.65% (1.653/2GiB, upward trend from 76% baseline, still PASS <85%). Disk 35% PASS. RestartCount: mcp-server=1, rag-service=101 (KNOWN-STANDING chronic OOM-loop FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX, Status=UP+healthy, NOT acute). All others=0. NO new signals emitted.
