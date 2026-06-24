# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.


## c443 · 2026-06-24T16:43:51Z
### Audit Run Tier-1 (16:43 UTC 2026-06-24)
- Tier: 1 | Services: 13/13 UP (mcp+frontend+macro+pdf-extractor+stock-price+technical+kinh-dich+api-gateway+rag+news-fetch+alert-engine+gateway+headroom-proxy), healthy | Health: 5/5 HTTP 200
- Anomalies: 0 new | Dedup: A-21 rag=108 no-jump +1/hr (KNOWN-STANDING FU-RAG-DEPLOY), A-30 mcp-mem=43.43% <85%, A-32 disk=39% <85%
- Status: HEALTHY
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-24T16:43:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)      vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 11 hours (healthy)     vn-market-intelligence-mcp-frontend             11 hours ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 hours (healthy)     vn-market-intelligence-mcp-macro-indicators     12 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 8 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)       vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)       vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 13 days (healthy)      vn-market-intelligence-mcp-api-gateway          13 days ago
vn-market-intelligence-mcp-rag-service-1          Up 34 minutes (healthy)   vn-market-intelligence-mcp-rag-service          13 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 days (healthy)     vn-market-intelligence-mcp-news-fetch           13 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 13 days (healthy)     vn-market-intelligence-mcp-alert-engine         13 days ago
headroom-proxy                                    Up 11 days                headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 13 days (healthy)      mcpservergatway-gateway                         5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=43.43% MemUsage=889.5MiB / 2GiB
Container=vn-market-intelligence-mcp-rag-service-1 MemPerc=6.53% MemUsage=50.15MiB / 768MiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    22Gi    39%    393k  229M    0%   /
```

## c442 · 2026-06-24T16:13:45Z
### Audit Run Tier-1 (16:13 UTC 2026-06-24)
- Tier: 1 | Services: 13/13 UP (mcp+frontend+macro+pdf-extractor+stock-price+technical+kinh-dich+api-gateway+rag+news-fetch+alert-engine+gateway+headroom-proxy), healthy | Health: 5/5 HTTP 200 | A-20 multi-probe: 3/3 PASS
- Anomalies: 0 new | Dedup: A-21 mcp=0 PASS, rag=108 no-jump +1/hr (KNOWN-STANDING), A-30 mcp-mem=42.43% <85% normal, A-32 disk=40% <85% normal
- Status: HEALTHY
