# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c610 · 2026-06-20T22:07:42Z
### Audit Run Tier-1 (22:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T22:07:22Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)    vn-market-intelligence-mcp-mcp-server           27 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)     vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 12 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)    vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)    vn-market-intelligence-mcp-alert-engine         10 days ago
mcp-gateway                                       Up 10 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.97% MemUsage=450MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ [RAW-PROBE L4-15]
- A-12..A-19 health endpoints: 5/5 PASS ✓ [RAW-PROBE L18-22]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: mcp-server=1 ✓ [RAW-PROBE L36]
- A-30 memory: 21.97% PASS ✓ [RAW-PROBE L40] — healthy state
- A-32 disk: 35% capacity ✓ [RAW-PROBE L43-46]

**Signals:** 0 NEW | Status: CLEAN

## c609 · 2026-06-20T21:37:51Z
### Audit Run Tier-1 (21:37 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

**Verdict:** A-01..A-11 all 12 UP ✓ | A-12..A-19 5/5 health ✓ | A-20 3/3 probe ✓ | A-21 restart=1 ✓ | A-30 mem=18.32% ✓ | A-32 disk=34% ✓ | Signals: 0 NEW

## c608 · 2026-06-20T21:07:48Z
### Audit Run Tier-1 (21:07 UTC 2026-06-20, Saturday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

**Verdict:** A-01..A-11 all 12 UP ✓ | A-12..A-19 5/5 health ✓ | A-20 3/3 probe ✓ | A-21 restart=1 ✓ | A-30 mem=16.41% ✓ | A-32 disk=36% ✓ | Signals: 0 NEW
