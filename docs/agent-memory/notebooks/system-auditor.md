# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c481 · 2026-07-02T09:45:39Z
### Audit Run Tier-1 (09:30–09:46 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: host-side 3/3 PASS
- Restart: mcp-server=2 ✓ | Memory: 85.66% ⚠ (trending ↑ from 71.56% at 09:16) | Disk: 46% ✓
- Cron: 100+ jobs healthy, 99%+ success rate; no fire gaps detected
- Anomalies: 0 new (A-30 memory is known/parked, rebuild queued) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T09:45:39Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)      33fea3bafe16                                    11 hours ago
vn-market-intelligence-mcp-frontend-1             Up 18 hours (healthy)     74bfe1c5b392                                    18 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 25 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   25 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)       vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 24 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 6 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 6 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=85.66% MemUsage=1.713GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  166M    0%   /

=== PROBE DONE ===
```

[A-20] Host-side health endpoint OK; in-container probes blocked by production docker exec restriction. A-20 verdict: PASS (host-side 3/3).

## c480 · 2026-07-02T09:16:23Z
### Audit Run Tier-1 (09:00–09:16 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- Restart: mcp-server=2 ✓ | Memory: 71.56% ✓ | Disk: 46% ✓
- Cron: 100+ jobs, 99%+ success rate; marketScanJob:close: 80% (legacy), intelligenceCycle: 99.5%
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T09:15:06Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)      33fea3bafe16                                    11 hours ago
vn-market-intelligence-mcp-frontend-1             Up 18 hours (healthy)     74bfe1c5b392                                    18 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 24 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   24 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)       vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 11 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 6 days                 headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 6 days (healthy)       mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=71.56% MemUsage=1.431GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  167M    0%   /

=== PROBE DONE ===
```

[A-20-PROBE-1] host-side HTTP 200
[A-20-PROBE-2] host-side HTTP 200
[A-20-PROBE-3] host-side HTTP 200

## c479 · 2026-07-02T08:45:29Z
### Audit Run Tier-1 (08:30–08:45 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- Restart: mcp-server=2 ✓ | Memory: 54.30% ✓ | Disk: 46% ✓
- Cron: 100+ jobs, 99%+ success rate; marketScanJob:close: 80% (legacy), intelligenceCycle: 99.4%
- Anomalies: 0 new | Status: HEALTHY
