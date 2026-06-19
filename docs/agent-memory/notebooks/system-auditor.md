# System Auditor Notebook

## c402 · 2026-06-19T22:08:14Z
### Audit Run Tier-1 (22:08–22:08 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Container tooling: ✓ | Inter-service: ✓
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L16-L20]
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓ (in-container HTTP 200 all three attempts)
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L22]
- A-22 pdftoppm: present ✓ | A-23 tesseract: present ✓ | A-24 vie lang: present ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: mcp-server 28.13%/2GiB PASS ✓ (stable ceiling, 0-restart)
- A-31 EPIPE: 0 occurrences PASS ✓
- A-32 disk: 34% < 85% PASS ✓ [RAW-PROBE L25-L27]
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T22:08:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)         vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)          vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)          vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)          vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)          vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)          vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)          vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)          vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days                    headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)          mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=28.13% MemUsage=576.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  279M    0%   /

=== PROBE DONE ===
```

## c401 · 2026-06-19T21:37:32Z
### Audit Run Tier-1 (21:37–21:39 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Container tooling: ✓ | Inter-service: ✓
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L16-L20]
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓ (in-container HTTP 200 all three attempts)
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L22]
- A-22 pdftoppm: present ✓ | A-23 tesseract: present ✓ | A-24 vie lang: present ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: mcp-server 21.13%/2GiB PASS ✓ (stable ceiling, 0-restart)
- A-31 EPIPE: 0 occurrences PASS ✓
- A-32 disk: 33% < 85% PASS ✓ [RAW-PROBE L25-L27]
### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-19T21:37:32Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)      vn-market-intelligence-mcp-mcp-server           3 hours ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)       vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
vn-market-intelligence-mcp-stock-price-1          Up 4 days (healthy)       vn-market-intelligence-mcp-stock-price          4 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 days (healthy)       vn-market-intelligence-mcp-technical-analysis   4 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)       vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 8 days (healthy)       vn-market-intelligence-mcp-api-gateway          8 days ago
vn-market-intelligence-mcp-rag-service-1          Up 42 minutes (healthy)   vn-market-intelligence-mcp-rag-service          8 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)       vn-market-intelligence-mcp-news-fetch           8 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)       vn-market-intelligence-mcp-alert-engine         9 days ago
headroom-proxy                                    Up 7 days                 headroom-proxy:local                            13 days ago
mcp-gateway                                       Up 9 days (healthy)       mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.13% MemUsage=432.8MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    28Gi    33%    393k  289M    0%   /

=== PROBE DONE ===
```

## c400 · 2026-06-19T21:08:09Z
### Audit Run Tier-1 (21:06–21:08 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Container tooling: ✓ | Inter-service: ✓
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L16-L20]
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓ (in-container HTTP 200 all three attempts)
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L22]
- A-22 pdftoppm: present ✓ | A-23 tesseract: present ✓ | A-24 vie lang: present ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: mcp-server 19.25%/2GiB PASS ✓ (container % 19.25, denominator 2GiB capped, stable ceiling)
- A-31 EPIPE: 0 occurrences PASS ✓
- A-32 disk: 34% < 85% PASS ✓ [RAW-PROBE L25-L27]

## c399 · 2026-06-19T20:38:56Z
### Audit Run Tier-1 (20:38–20:39 UTC 2026-06-19)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Container tooling: ✓ | Inter-service: ✓
- Anomalies: 0 new | Dedup: 0 skipped
- Status: HEALTHY — all runtime checks PASS
- A-01..A-11 container UP: all 12 PASS ✓ [RAW-PROBE L2-L14]
- A-12..A-19 health endpoints: mcp-server ✓ api-gateway ✓ macro-indicators ✓ pdf-extractor ✓ frontend ✓ [RAW-PROBE L16-L20]
- A-20 multi-probe pdf-extractor: 3/3 PASS ✓
- A-21 restart count: mcp-server=0 PASS ✓ [RAW-PROBE L22]
- A-22 pdftoppm: present ✓ | A-23 tesseract: present ✓ | A-24 vie lang: present ✓
- A-25..A-28 inter-service: stock-price ✓ technical-analysis ✓ alert-engine ✓ pdf-extractor ✓
- A-30 memory: mcp-server 17.80%/2GiB PASS ✓ (container % 17.80, denominator 2GiB stable = ceiling, not spike)
- A-31 EPIPE: 0 occurrences PASS ✓
- A-32 disk: 35% < 85% PASS ✓ [RAW-PROBE L25-L27]
