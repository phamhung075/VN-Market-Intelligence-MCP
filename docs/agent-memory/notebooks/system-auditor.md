# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c488 · 2026-07-02T14:14:52Z
## c489 · 2026-07-02T14:44:57Z
### Audit Run Tier-1 (14:30–14:45 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP (docker ps) | Health: 3/5 OK, 2/5 FAIL | A-20: 3/3 PASS
- mcp-server CRITICAL (docker ps unhealthy + CURL_ERR) [RAW-PROBE L4, L16] — DEDUP-SKIP (14:14:52Z)
- mcp-server WARN (restart_count=3) [RAW-PROBE L24] — DEDUP-SKIP (14:14:52Z)
- frontend WARN NEW (health endpoint CURL_ERR) [RAW-PROBE L20] — NEW SIGNAL
- api-gateway PASS (health endpoint OK now) — resolution of 14:14:52Z alert
- Memory: 60.39% ✓ | Disk: 47% ✓ | A-30: PASS | A-32: PASS
- Anomalies: 1 new (frontend health) | 2 dedup-skipped | Status: DEGRADED
- MCP transport dead (expected — container wedged since 13:43Z) — no post_agent_signal/telegram

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T14:44:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (unhealthy)       33fea3bafe16                                    16 hours ago
vn-market-intelligence-mcp-frontend-1             Up 23 hours (healthy)        74bfe1c5b392                                    23 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 30 hours (healthy)        vn-market-intelligence-mcp-technical-analysis   30 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)          vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)          vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)          vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 6 days                    headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 6 days (healthy)          mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health FAIL (HTTP CURL_ERR)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ FAIL (HTTP CURL_ERR)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=60.39% MemUsage=1.208GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    47%    393k  164M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
=== PROBE DONE ===
```


### Audit Run Tier-1 (14:00–14:15 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP (docker ps) | Health: 3/5 OK, 2/5 FAIL | A-20: 3/3 PASS
- CRITICAL: mcp-server unhealthy (docker ps) + CURL_ERR on 3000/health [RAW-PROBE L4, L16]
- WARN: api-gateway unhealthy (docker ps) + CURL_ERR on 4000/health [RAW-PROBE L10, L15]
- WARN: mcp-server restart_count=3 (threshold ≤2) [RAW-PROBE L25]
- Memory: 60.39% ✓ | Disk: 47% ✓ | Isolation: per-service (Docker healthy)
- Anomalies: 2 new (mcp-server + api-gateway CURL_ERR REGRESSION) | Status: CRITICAL
- MCP unavailable (get_system_status timeout) — mcp-server unreachable

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T14:14:52Z ===
--- docker ps -a ---
mcp-server-1: Up 4 hours (unhealthy) | api-gateway-1: Up 3 days (unhealthy)
frontend-1: Up 23 hours (unhealthy) | technical-analysis-1: Up 29 hours (healthy)
stock-price-1: Up 2 days (healthy) | macro-indicators-1: Up 2 days (healthy)
pdf-extractor-1: Up 4 days (healthy) | kinh-dich-service-1: Up 6 days (healthy)
rag-service-1: Up 36 minutes (healthy) | news-fetch-1: Up 6 days (healthy)
alert-engine-1: Up 6 days (healthy) | mcp-gateway: Up 6 days (healthy)
--- health endpoints ---
[health] mcp-server:3000/health FAIL (HTTP CURL_ERR) | api-gateway:4000/health FAIL (CURL_ERR)
[health] macro-indicators:5004/health OK | pdf-extractor:5001/health OK | frontend:3001/ OK
--- restart count ---
RestartCount=3 (threshold=2 exceeded)
--- memory pressure ---
MemPerc=60.39% (< 85% OK)
--- disk df -h / ---
Capacity=47% (< 85% OK)
--- pdf-extractor multi-probe (A-20) ---
[A-20-PROBE-1] HTTP 200 | [A-20-PROBE-2] HTTP 200 | [A-20-PROBE-3] HTTP 200 (pass_count=3/3)
=== PROBE DONE ===
```

## c487 · 2026-07-02T12:46:01Z
### Audit Run Tier-1 (12:30–12:46 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- Restart: mcp-server=3 ⚠ (known/dedup-tracked @10:46Z) | Memory: 50.36% ✓ | Disk: 48% ✓
- Anomalies: 0 new | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T12:45:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)      33fea3bafe16                                    14 hours ago
vn-market-intelligence-mcp-frontend-1             Up 21 hours (healthy)     74bfe1c5b392                                    21 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 28 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   28 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)       vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 12 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
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
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=50.36% MemUsage=1.007GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    48%    393k  154M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

[A-20] PASS: 3/3 probes; event-loop healthy.
Note: A-21 skipped (dedup: known restart_count=3 tracked since @10:46Z within 7d window).

## c486 · 2026-07-02T11:45:42Z
### Audit Run Tier-1 (11:30–11:45 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- Restart: mcp-server=3 ⚠ (known/dedup-tracked @10:46Z) | Memory: 36.24% ✓ | Disk: 46% ✓
- Anomalies: 0 new (1 dedup-skipped A-21) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T11:44:56Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up About an hour (healthy)   33fea3bafe16                                    13 hours ago
vn-market-intelligence-mcp-frontend-1             Up 20 hours (healthy)        74bfe1c5b392                                    20 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 27 hours (healthy)        vn-market-intelligence-mcp-technical-analysis   27 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)          vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)          vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)          vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 5 seconds (healthy)       vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)          vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)          vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 6 days                    headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 6 days (healthy)          mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=36.24% MemUsage=742.2MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  165M    0%   /

=== PROBE DONE ===
```

[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
A-20: PASS (3/3 probes); event-loop healthy.

