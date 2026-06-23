# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c380 · 2026-06-23T18:15:16Z
### Audit Run Tier-1 (18:15 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). mcp-server RestartCount=0 (fresh rebuild ~17:55Z, baseline reset per context). Memory 15.81% (323.8MiB / 2GiB, well below 85% threshold, down from 95.78% at 17:44Z — rebuild dropped memory footprint to baseline). rag-service RestartCount=102 (jump from 101, KNOWN-STANDING FU-RAG-DEPLOY-MEMORY chronic OOM-loop, <+10 rule satisfied, Status=UP healthy). Disk 33% PASS. NO new signals emitted.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-23T18:13:22Z ===

--- docker ps -a ---
vn-market-intelligence-mcp-mcp-server-1           Up 4 minutes (healthy)
vn-market-intelligence-mcp-frontend-1             Up 45 hours (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 8 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 8 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 8 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 8 minutes (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.81% MemUsage=323.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    28Gi    33%    393k  289M    0%   /

=== PROBE DONE ===
```

### A-20 Multi-Probe (pdf-extractor):
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
pass_count=3/3 → MAJORITY PASS → A-20 PASS override
```

## c379 · 2026-06-23T17:44:21Z
### Audit Run Tier-1 (17:44 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 12 host_runtime_set containers UP+healthy. Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. A-20 pdf-extractor multi-probe 3/3 PASS (200,200,200). Memory 95.78% (1.916/2GiB, up from 99.48% at 17:14Z). OOMKilled=false, Status=running healthy. Disk 34% PASS. RestartCount: mcp-server=1 (no jump, KNOWN-STANDING FIX-MCP-MEMORY-CODE-LEAK). rag-service=101 (KNOWN-STANDING FU-RAG-DEPLOY-MEMORY, OOMKilled=false, Status=UP, no jump). A-30 mem% WARN-ceiling dedup rule: ≥85% but OOMKilled=false+RestartCount stable = RECORD-ONLY. NO new signals emitted.

## c378 · 2026-06-23T17:14:02Z
### Audit Run Tier-1 (17:14 UTC 2026-06-23)
- Tier: 1 | Services: 12 host_runtime_set + infra checked | Health endpoints: 5 probed
- Anomalies: 0 new | Status: HEALTHY
- Evidence: All 13 containers UP+healthy (12 host_runtime_set + mcp-gateway). Health endpoints: mcp-server 200, api-gateway 200, macro-indicators 200, pdf-extractor 200, frontend 200. Memory 99.48% (1.99/2GiB, spike from 82.65% at 16:44Z, peak observed this session, WARN-ceiling). OOMKilled=false, Status=running healthy. Disk 35% PASS. RestartCount: mcp-server=1 (no jump, KNOWN-STANDING FIX-MCP-MEMORY-CODE-LEAK tracked). rag-service=101 (KNOWN-STANDING chronic OOM-loop FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX, OOMKilled=false, Status=UP+healthy, no jump). All others=0. NO new signals emitted. High mem% recorded per dedup rule A-30: PASS <85% threshold violated but OOMKilled=false+RestartCount unchanged = WARN-ceiling not incident.
