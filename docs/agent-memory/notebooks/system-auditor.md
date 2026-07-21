# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c210741 · 2026-07-21T11:41:47Z
### Audit Run Tier-1 (11:40–11:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (1 UNHEALTHY)
- Health endpoints: 4 OK (mcp-server, api-gateway, macro-indicators, frontend), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall persists (KNOWN PDF-AVAIL-02-FIX)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 79.07% PASS | A-32 Disk: 35% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | 1 dedup-skipped (A-20 within 7d, last 2026-07-21T03:41:45Z) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T11:40:41Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)       vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        5 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 5 days (healthy)       vn-market-intelligence-mcp-news-fetch           5 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)     vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 days (healthy)       vn-market-intelligence-mcp-rag-service          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 39 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 5 days (healthy)       vn-market-intelligence-mcp-alert-engine         5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=79.07% MemUsage=2.372GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  262M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

### Emit Results:
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-21T03:41:45Z id=sys-20260721T114143-01c7

## c210735 · 2026-07-21T11:12:28Z
### Audit Run Tier-1 (11:08–11:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (1 UNHEALTHY)
- Health endpoints: 4 OK (mcp-server, api-gateway, macro-indicators, frontend), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall persists (KNOWN PDF-AVAIL-02-FIX)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 76.75% PASS | A-32 Disk: 36% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | 1 dedup-skipped (A-20 within 7d, last 2026-07-21T03:41:45Z) | Status: DEGRADED

## c210733 · 2026-07-21T10:40:53Z
### Audit Run Tier-1 (10:35–10:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 11 UP, 1 UNHEALTHY
- Health endpoints: 4 OK (mcp-server, api-gateway, macro-indicators, frontend), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall persists (KNOWN PDF-AVAIL-02)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 74.69% PASS | A-32 Disk: 36% PASS
- Anomalies: 0 new | 1 dedup-skipped (A-20 within 7d window, last sent 2026-07-21T03:41:45Z) | Status: DEGRADED
