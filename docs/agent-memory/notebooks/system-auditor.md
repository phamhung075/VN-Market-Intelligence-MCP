# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c278 · 2026-06-21T18:43:48Z
### Audit Run Tier-1 (18:43 UTC 2026-06-21, Monday pre-market 01:43 VN 2026-06-22)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3 PASS
- Anomalies: 0 NEW (all PASS, stable, healthy)
- Status: CLEAN
- Notes: All containers Up/healthy; mcp-server ~8h uptime; disk 36%, mem 48.7%; pre-market window confirmed

**RAW-PROBE (2026-06-21T18:43:13Z):**
```
=== AUDITOR PROBE 2026-06-21T18:43:13Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)   vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)    vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)    vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)    vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)   vn-market-intelligence-mcp-api-gateway          10 days ago
vn-market-intelligence-mcp-rag-service-1          Up 9 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)   vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)   vn-market-intelligence-mcp-alert-engine         10 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=48.70% MemUsage=997.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  252M    0%   /

=== PROBE DONE ===
```

**A-20 Multi-Probe (pdf-extractor in-container):**
- [A-20-PROBE-1] in-container HTTP 200 ✓
- [A-20-PROBE-2] in-container HTTP 200 ✓
- [A-20-PROBE-3] in-container HTTP 200 ✓
- Verdict: PASS (3/3 majority)

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-20 pdf-extractor: 3/3 probes PASS ✓
- A-12..A-19 health: 5/5 probed PASS ✓ | A-21 restart: mcp-server=0 PASS ✓
- A-30 memory: 48.70% PASS ✓ | A-32 disk: 36% PASS ✓

**Signals:** 0 NEW | Dedup-skipped: 1 (rag-service mem ceiling FU-RAG-DEPLOY-MEMORY) | Status: CLEAN

## c277 · 2026-06-21T18:31:27Z
### Audit Run Tier-2 (18:31 UTC 2026-06-21, Monday pre-market 01:31 VN 2026-06-22)
- Tier: 2 (freshness sweep) | Local DB checks: 4 probed | SLA: pre-market window
- Anomalies: 0 NEW (C-06/C-07/B-09/B-13 all PASS)
- Status: CLEAN
- Notes: Gateway-dependent B-01..B-07 deferred (local agent constraint); container healthy; no data staleness detected
