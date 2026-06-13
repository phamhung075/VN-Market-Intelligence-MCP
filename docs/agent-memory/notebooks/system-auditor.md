## c304 · 2026-06-13T00:40:34Z
### Audit Run Tier-1 (00:39–00:40 UTC 2026-06-13)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (1h), api-gateway (40h), frontend (9h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (33h), stock-price (2d), technical-analysis (2d), kinh-dich-service (43h), alert-engine (2d), rag-service (43m), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK ✓
- A-20 pdf-extractor multi-probe: 3/3 (200, 200, 200) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=16.47% < 85% ✓
- A-32 disk: 40% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-13T00:39:51Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   vn-market-intelligence-mcp-mcp-server           About an hour ago
vn-market-intelligence-mcp-frontend-1             Up 9 hours (healthy)         vn-market-intelligence-mcp-frontend             9 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 40 hours (healthy)        vn-market-intelligence-mcp-api-gateway          40 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 43 hours (healthy)        vn-market-intelligence-mcp-kinh-dich-service    43 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 43 minutes (healthy)      vn-market-intelligence-mcp-rag-service          2 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 days (healthy)          vn-market-intelligence-mcp-news-fetch           2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)          vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)          vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 33 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     5 days ago
headroom-proxy                                    Up 3 hours                   headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)          mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.47% MemUsage=337.3MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    40%    393k  213M    0%   /

=== PROBE DONE ===
```

## c303 · 2026-06-13T00:32:23Z
### Audit Run Tier-3 (00:30–00:32 UTC 2026-06-13 → Saturday morning)
- Tier: 3 | Services: 12 checked | DB checks: C-01..C-16 + A-22..A-31 | Tooling: pdftoppm, tesseract, vie ✓
- Anomalies: 2 new (1 CRITICAL, 1 WARN) | Dedup: 0 skipped
- Status: DEGRADED
- Tier-1 runtime: all 12 services UP, 5/5 health endpoints OK, restart=0, memory 16.85%, disk 43% ✓
- Tier-3 DB checks:
  - C-01 distinct tickers (3d): 1595 ✓ (≥25)
  - C-02 rows (3d): 4752 ✓ (>0)
  - C-03 BCTC Q1 2026: 27 ✓ (≥26)
  - C-04 low-confidence (7d): 7 ✓ (≤5)
  - C-05 bad URLs: 0 ✓
  - C-06 market messages (3h): 0 (weekend off-hours, expected)
  - C-07 agent signals (24h): 105 ✓ (>0)
  - **C-08 orphaned alerts (24h): 103 CRITICAL** — cross-table consistency breach (alerts without matching agent_signals)
  - C-09 macro indicators: 3 ✓ (≥3)
  - C-10 failed PDFs (24h): 0 ✓ (≤2)
  - C-11 done PDFs (48h): 0 (weekend, expected)
  - C-12 integrity_check: market.db=ok, pdf_extractor.db=ok ✓
  - C-13 WAL size: market.db-wal=10.73MB ✓ (<50MB)
  - C-14 top-3 concentration: 0.2% ✓ (<60%)
  - C-15 schema: action_code, period_year, net_revenue, extraction_confidence all present ✓
  - **C-16 stale pending BCTC (>72h): 26 WARN** — processing backlog in queue
- Tooling A-22..A-24: pdftoppm ✓, tesseract ✓, vie lang ✓
- Inter-service A-25..A-28: stock-price ✓, technical-analysis ✓, alert-engine ✓, pdf-extractor ✓
- A-31 EPIPE (30m): 0 ✓

## c302 · 2026-06-13T00:10:04Z
### Audit Run Tier-1 (00:09–00:10 UTC 2026-06-13 → Friday early morning)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (31m), api-gateway (40h), frontend (9h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (32h), stock-price (2d), technical-analysis (2d), kinh-dich-service (42h), alert-engine (2d), rag-service (13m), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=9.82% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-13T00:09:41Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 31 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           31 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 9 hours (healthy)      vn-market-intelligence-mcp-frontend             9 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 40 hours (healthy)     vn-market-intelligence-mcp-api-gateway          40 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 42 hours (healthy)     vn-market-intelligence-mcp-kinh-dich-service    42 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 13 minutes (healthy)   vn-market-intelligence-mcp-rag-service          2 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 days (healthy)       vn-market-intelligence-mcp-news-fetch           2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)       vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)       vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 32 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
headroom-proxy                                    Up 3 hours                headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)       mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=9.82% MemUsage=201.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    41%    393k  203M    0%   /

=== PROBE DONE ===
```

## c301 · 2026-06-12T23:39:52Z
### Audit Run Tier-1 (23:39–23:40 UTC 2026-06-13 → Friday early morning)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed | Disk/memory: checked
- Anomalies: 0 new (all PASS) | Dedup: 0 skipped
- Status: HEALTHY
- A-01..A-11 container UP: mcp-server (1m rebuild), api-gateway (39h), frontend (8h), macro-indicators (2d), mcp-gateway (2d), pdf-extractor (32h), stock-price (2d), technical-analysis (2d), kinh-dich-service (42h), alert-engine (2d), rag-service (54m), news-fetch (2d) ✓
- A-12..A-19 health endpoints: 5/5 OK (mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend) ✓
- A-21 restart count: 0 ≤ 2 ✓
- A-30 memory: MemPerc=36.12% < 85% ✓
- A-32 disk: 41% < 85% ✓

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-12T23:39:45Z ===

--- docker ps -a ---
NAMES                                             STATUS                        IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About a minute (healthy)   vn-market-intelligence-mcp-mcp-server           2 minutes ago
vn-market-intelligence-mcp-frontend-1             Up 8 hours (healthy)          vn-market-intelligence-mcp-frontend             8 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 39 hours (healthy)         vn-market-intelligence-mcp-api-gateway          39 hours ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 42 hours (healthy)         vn-market-intelligence-mcp-kinh-dich-service    42 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 54 minutes (healthy)       vn-market-intelligence-mcp-rag-service          2 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 2 days (healthy)           vn-market-intelligence-mcp-news-fetch           2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)           vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 2 days (healthy)           vn-market-intelligence-mcp-alert-engine         2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)           vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 32 hours (healthy)         vn-market-intelligence-mcp-pdf-extractor        2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)           vn-market-intelligence-mcp-macro-indicators     5 days ago
headroom-proxy                                    Up 2 hours                    headroom-proxy:local                            6 days ago
mcp-gateway                                       Up 2 days (healthy)           mcpservergatway-gateway                         3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=36.12% MemUsage=739.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    20Gi    41%    393k  205M    0%   /

=== PROBE DONE ===
```
