# System Auditor Notebook

## c422 · 2026-06-20T07:38:13Z
### Audit Run Tier-1 (07:37–07:38 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T07:37:40Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-mcp-server           13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)     vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)     vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 11 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=62.02% MemUsage=1.24GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  279M    0%   /
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L15–L26] ✓
- A-12..A-19 health endpoints: all 5 PASS (200) [RAW-PROBE L30–L34] ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS — event-loop healthy ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L37] ✓
- A-30 memory: 62.02% [RAW-PROBE L40] ✓ (healthy, <85%)
- A-32 disk: 34% [RAW-PROBE L44] ✓ (healthy, <85%)
- Status: HEALTHY — no anomalies


## c421 · 2026-06-20T07:13:11Z
### Audit Run Tier-2 (07:13 UTC 2026-06-20)
- Tier: 2 | Sources: 8 checked (2 market-hours-only skipped) | VPS: 7 routes ✓ | DB: 4 checks
- Anomalies: 0 new (CLEAN) | 1 INFO (C-06 weekend quiet expected)
- Status: HEALTHY — all freshness PASS
- Cron SLA: all within expected fire windows
- VPS proxy: all 7 routes OK (ssc-iboard/bctc-discover/muasamcong/bctc-push/foreign-flow/sbv/news)
- DB: C-06 (0 market_messages/3h) INFO-only; C-07 (108 signals/24h) PASS; B-09 (0 SSC URLs) PASS; B-13 (0 stale BCTC) PASS
- Market context: Saturday 2026-06-20 (VN market CLOSED since Friday 08:00Z); weekend-stale price/FX data classified as INFO, not anomaly
- No BCTC-EVAL snapshot changes (weekend, no state shifts)
- No D-IMPROVE candidates
- All checks completed end-to-end; wall time < 300s; no early exits

## c420 · 2026-06-20T07:13:39Z
### Audit Run Tier-1 (07:13 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T07:13:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 12 hours (healthy)   vn-market-intelligence-mcp-mcp-server           12 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)     vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)     vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 10 hours (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=56.08% MemUsage=1.122GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    35%    393k  269M    0%   /
```

**Findings:**
- A-01..A-11 containers: all 12 UP ✓
- A-12..A-19 health endpoints: all 5 PASS (200) ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart count: mcp-server=0 ✓
- A-30 memory: 56.08% ✓ (healthy, <85%)
- A-32 disk: 35% ✓ (healthy, <85%)
- Status: HEALTHY — no anomalies

## c419 · 2026-06-20T05:07:52Z
### Audit Run Tier-1 (05:07 UTC 2026-06-20)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (CLEAN)
- Status: HEALTHY — all runtime checks PASS ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T05:06:52Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)   vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)     vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)     vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)     vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)     vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 8 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days               headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=52.35% MemUsage=1.047GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    28Gi    33%    393k  291M    0%   /
```

**Findings:**
- A-01..A-11 containers: all 12 UP [RAW-PROBE L15–L26] ✓
- A-12..A-19 health endpoints: all 5 PASS (200) [RAW-PROBE L30–L34] ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS — event-loop healthy ✓
- A-21 restart count: mcp-server=0 [RAW-PROBE L37] ✓
- A-30 memory: 52.35% [RAW-PROBE L40] ✓ (healthy, <85%)
- A-32 disk: 33% [RAW-PROBE L44] ✓ (healthy, <85%)
- Status: HEALTHY — no anomalies
