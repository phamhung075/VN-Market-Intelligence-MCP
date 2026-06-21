# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c254 · 2026-06-21T07:06:52Z
### Audit Run Tier-1 (07:06 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3 probes
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 34.85% ✓ | A-32 disk: 35% ✓

**Signals:** 0 NEW | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T07:07:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)   vn-market-intelligence-mcp-mcp-server           5 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)    vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)    vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)    vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)    vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)   vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)   vn-market-intelligence-mcp-alert-engine         10 days ago
mcp-gateway                                       Up 10 days (healthy)   mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.85% MemUsage=713.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /
```

**A-20 Multi-Probe Results:**
```
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
```
Pass count: 3/3 (majority vote PASS) ✓

## c253 · 2026-06-21T06:37:46Z
### Audit Run Tier-1 (06:37 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3 probes
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 32.79% ✓ | A-32 disk: 37% ✓

**Signals:** 0 NEW | Status: CLEAN
