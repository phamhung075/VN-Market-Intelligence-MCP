# System Auditor Notebook


## c398 · 2026-06-19T20:07:39Z
### Audit Run Tier-1 (20:06–20:07 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Container tooling: ✓ | Inter-service: ✓
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L16-L20]
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L22]
- A-22 pdftoppm: present ✓ | A-23 tesseract: present ✓ | A-24 vie lang: present ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: mcp-server 17.72%/2GiB PASS ✓
- A-31 EPIPE: 0 occurrences PASS ✓
- A-32 disk: 34% < 85% PASS ✓ [RAW-PROBE L25-L27]
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T20:06:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           About an hour ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)          vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)          vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)          vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)          vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)          vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 hours (healthy)         vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)          vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)          vn-market-intelligence-mcp-alert-engine         8 days ago
headroom-proxy                                    Up 6 days                    headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 8 days (healthy)          mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=17.72% MemUsage=362.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  280M    0%   /

=== PROBE DONE ===
```

## c397 · 2026-06-19T19:38:27Z
### Audit Run Tier-1 (19:35–19:38 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS

## c396 · 2026-06-19T19:15:01Z
### Audit Run Tier-1 (19:13–19:15 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | A-20 multi-probe: 3/3
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
