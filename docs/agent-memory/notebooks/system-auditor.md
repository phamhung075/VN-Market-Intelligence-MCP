# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c362 · 2026-07-21T02:12:03Z
### Audit Run Tier-1 (02:10–02:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and healthy) [RAW-PROBE L4-16]
- A-12 (frontend health): OK — recovered from CURL_ERR [RAW-PROBE L45]
- A-12 (pdf-extractor health): CURL_ERR endpoint (known) [RAW-PROBE L41], dedup-skip
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall [RAW-PROBE L55-58], dedup-skip
- A-21 (restart count): mcp-server=2 PASS [RAW-PROBE L47]
- A-30 (memory): mcp-server=16.08% PASS [RAW-PROBE L50-51]
- A-32 (disk): 35% < 85% PASS [RAW-PROBE L54]
- Anomalies: 0 new | 2 dedup-skipped (A-12, A-20) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T02:10:53Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)       vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        5 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 5 days (healthy)       vn-market-intelligence-mcp-news-fetch           5 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 35 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)       vn-market-intelligence-mcp-rag-service          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 29 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.08% MemUsage=494MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    35%    393k  263M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

## c361 · 2026-07-21T01:40:55Z
### Audit Run Tier-1 (01:40–01:41 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and healthy) [RAW-PROBE L4-16]
- A-12 (frontend health): CURL_ERR endpoint — NEW WARN signal [RAW-PROBE L45]
- A-12 (pdf-extractor health): CURL_ERR endpoint (known, related to A-20) [RAW-PROBE L40]
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall [RAW-PROBE L54-57], dedup-skip
- A-21 (restart count): mcp-server=2 PASS [RAW-PROBE L44]
- A-30 (memory): mcp-server=10.88% PASS [RAW-PROBE L47-48]
- A-32 (disk): 35% < 85% PASS [RAW-PROBE L51]
- Anomalies: 1 new (A-12 frontend escalation) | 1 dedup-skipped (A-20) | Status: DEGRADED

## c360 · 2026-07-21T01:12:40Z
### Audit Run Tier-1 (01:10–01:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and healthy) [RAW-PROBE L4-16]
- A-12 (pdf-extractor health): CURL_ERR — endpoint down [RAW-PROBE L40], overridden by A-20
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall [RAW-PROBE L85-92], dedup-skip
- A-21 (restart count): mcp-server=1 PASS [RAW-PROBE L56-57]
- A-30 (memory): mcp-server=92.53% WARN [RAW-PROBE L62-63], dedup-skip
- A-32 (disk): 35% < 85% PASS [RAW-PROBE L67]
- Anomalies: 0 new | 2 dedup-skipped (A-20, A-30) | Status: DEGRADED (persistent)

## c848 · 2026-07-21T00:44:16Z
### Audit Run Tier-1 (00:42–00:44 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked | Health: 5 probed
- A-01 to A-11 (container status): 12/12 UP (all deployed and running) [RAW-PROBE L4-16]
- A-12 (api-gateway health): CURL_ERR — WARN [RAW-PROBE L39], dedup-skip
- A-20 (pdf-extractor multi-probe): 0/3 FAIL — HTTP 000 event-loop stall [RAW-PROBE L85-92], dedup-skip
- A-21 (restart count): mcp-server=1 PASS [RAW-PROBE L56-57]
- A-30 (memory): mcp-server=93.59% WARN [RAW-PROBE L62-63], dedup-skip
- A-32 (disk): 36% < 85% PASS [RAW-PROBE L67]
- Anomalies: 0 new | 3 dedup-skipped (A-12, A-20, A-30) | Status: DEGRADED (persistent)
