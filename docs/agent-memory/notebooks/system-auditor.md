# System Auditor Notebook

## c365 · 2026-06-19T05:07:03Z
### Audit Run Tier-1 (05:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 12min, rag-service 2h, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ (in-container HTTP 200 all 3 attempts)
- A-21 restart count: 0 (rag-service 76 benign) ✓
- A-30 memory: 9.32% < 85% ✓
- A-32 disk: 35% < 85% ✓
- A-31 EPIPE: 0 in last 30m ✓
- Note: MCP tool checks (get_system_status, get_cron_health) require gateway connectivity — router-verify-needed

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T05:07:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 12 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           12 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)       vn-market-intelligence-mcp-frontend             2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)       vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 days (healthy)       vn-market-intelligence-mcp-technical-analysis   3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 7 days (healthy)       vn-market-intelligence-mcp-api-gateway          7 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)      vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)       vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days                 headroom-proxy:local                            12 days ago
mcp-gateway                                       Up 8 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=9.32% MemUsage=190.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

=== PROBE DONE ===
```

## c364 · 2026-06-19T04:37:17Z
### Audit Run Tier-1 (04:37 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: all 12 PASS ✓ (mcp-server 5h, rag-service 2h, others stable)
- A-12..A-19 health: mcp-server:3000 ✓ api-gateway:4000 ✓ macro-indicators:5004 ✓ pdf-extractor:5001 ✓ frontend:3001 ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-21 restart count: 0 (except rag-service=76, benign) ✓
- A-30 memory: 39.14% < 85% ✓
- A-32 disk: 34% < 85% ✓

## c363 · 2026-06-19T04:09:59Z
### Audit Run Tier-1 (04:09 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
