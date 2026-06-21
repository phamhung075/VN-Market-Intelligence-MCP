# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c620 · 2026-06-21T02:07:48Z
### Audit Run Tier-1 (02:07–02:08 UTC 2026-06-21, Saturday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3 probes
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 16.34% ✓ | A-32 disk: 36% ✓

**Signals:** 0 NEW | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T02:06:40Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 minutes (healthy)    vn-market-intelligence-mcp-mcp-server           3 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)       vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)       vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 13 minutes (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)      vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)      vn-market-intelligence-mcp-alert-engine         10 days ago
headroom-proxy                                    Up 8 days                 headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 10 days (healthy)      mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.34% MemUsage=334.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    36%    393k  243M    0%   /

[A-20-PROBE-1] in-container HTTP 200 ✓
[A-20-PROBE-2] in-container HTTP 200 ✓
[A-20-PROBE-3] in-container HTTP 200 ✓
Majority vote: 3/3 PASS
```

## c619 · 2026-06-21T01:38:21Z
### Audit Run Tier-1 (01:36-01:38 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 13.92% ✓ | A-32 disk: 37% ✓

**Signals:** 0 NEW | Status: CLEAN

## c618 · 2026-06-21T01:07:19Z
### Audit Run Tier-1 (01:07 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 18.49% ✓ | A-32 disk: 36% ✓

**Signals:** 0 NEW | Status: CLEAN
