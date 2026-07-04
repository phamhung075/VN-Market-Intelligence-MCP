

## c389 · 2026-07-04T01:26:29Z
### Audit Run Tier-1 (01:25–01:26 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 63.58% < 85% PASS
- A-32 (disk): 44% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-04T01:25:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)     vn-market-intelligence-mcp-mcp-server           21 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)      74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)      vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)      vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)      vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 7 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 8 days                headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 8 days (healthy)      mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=63.58% MemUsage=1.907GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  183M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c218 · 2026-07-04T00:42:39Z
### Audit Run Tier-3 (00:40–00:42 UTC 2026-07-04)
- Tier: 3 | Services: 12 checked | DB checks: 16 run
- A-01 to A-32 (Runtime): All PASS — 12/12 containers UP, 5/5 health OK, memory/disk OK
- C-01 to C-16 (DB Integrity): 15 PASS, 0 CRITICAL
  - C-01 (OHLCV symbols): 1192 ≥25 PASS
  - C-02 (OHLCV rows): 2845 >0 PASS
  - C-03 (FR 2026Q1): 32 ≥26 PASS
  - C-04 (low-conf): 2 ≤5 PASS
  - C-05 (SSC URLs): 0 PASS
  - C-06 (market msgs 3h): 0 (off-hours, expected)
  - C-07 (signals 24h): 159 >0 PASS
  - C-08 (orphaned alerts): 0 PASS
  - C-09 (macro indicators): 3 ≥3 PASS
  - C-10 (PDF failures): 0 ≤2 PASS
  - C-11 (PDF done 48h): 0 (off-season, expected)
  - C-12 (integrity): OK PASS
  - C-13 (WAL size): <50MB PASS
  - C-14 (concentration): 0.3% <60% PASS
  - C-15 (schema): all cols PASS
  - C-16 (stale pending): 0 PASS
- Doc/Memory Audit: 2 INFO — task_board=85 (cap:80), sprint_entries=16 (cap:15)
- Known Issues Corroborated:
  - MBB Q1-2026: 14.9% BS imbalance (tracked, batch-reflow repair)
  - CTG Q1-2026: total_assets=0 (tracked, W5-FIU-CTG-REFINE, user-gated)
- Anomalies: 2 INFO (no CRITICAL, no WARN) | Status: HEALTHY

## c217 · 2026-07-04T00:31:26Z
### Audit Run Tier-1 (00:31–00:32 UTC 2026-07-04)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 60.35% < 85% PASS
- A-32 (disk): 43% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-04T00:31:26Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)     vn-market-intelligence-mcp-mcp-server           20 hours ago
vn-market-intelligence-mcp-frontend-1             Up 2 days (healthy)      74bfe1c5b392                                    2 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 2 days (healthy)      vn-market-intelligence-mcp-technical-analysis   2 days ago
vn-market-intelligence-mcp-stock-price-1          Up 3 days (healthy)      vn-market-intelligence-mcp-stock-price          3 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 4 days (healthy)      vn-market-intelligence-mcp-macro-indicators     4 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)      vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 8 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 9 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 8 days (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 8 days (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 8 days                headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 8 days (healthy)      mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=60.35% MemUsage=1.81GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    19Gi    43%    393k  194M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c216 · 2026-07-03T23:46:13Z
### Audit Run Tier-1 (23:46–23:46 UTC 2026-07-03)
- Tier: 1 | Services: 12 checked | Health: 5 probed | All UP
- A-01 to A-11 (container status): 12/12 UP/healthy (all host_runtime_set)
- A-12 to A-19 (health endpoints): 5/5 OK — mcp-server, api-gateway, macro-indicators, pdf-extractor, frontend
- A-20 (pdf-extractor multi-probe): 3/3 PASS
- A-21 (restart count): PASS (mcp-server=1)
- A-30 (memory): 52.18% < 85% PASS
- A-32 (disk): 42% < 85% PASS
- Cron health: 100+ jobs all ≥80% success
- Anomalies: 0 | Status: HEALTHY
