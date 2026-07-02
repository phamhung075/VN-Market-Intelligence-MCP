# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c493 · 2026-07-02T18:16:09Z
### Audit Run Tier-1 (18:16–18:17 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 4/5 OK | A-20: 3/3 PASS
- WARN NEW: api-gateway health endpoint failed (HTTP CURL_ERR) [RAW-PROBE L4]
- A-30: 99.96% memory KNOWN-TRIAGED (sawtooth 60→99%→GC, FIX-MCP-MEMORY-CODE-LEAK in-flight)
- Restart count: 3 (dedup skip) | Disk: 49% ✓
- Anomalies: 1 new (api-gateway A-13) | Dedup: 1 skipped (A-21, A-30 TRIAGED)
- Status: DEGRADED | Signals: 1 emitted (signal_id=8320)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T18:16:09Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)     33fea3bafe16                                    20 hours ago
vn-market-intelligence-mcp-frontend-1             Up 27 hours (healthy)    74bfe1c5b392                                    27 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 33 hours (healthy)    vn-market-intelligence-mcp-technical-analysis   33 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)      vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)      vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 days (healthy)      vn-market-intelligence-mcp-api-gateway          4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 2 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 6 days                headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 6 days (healthy)      mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.96% MemUsage=1.999GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    49%    393k  152M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c492 · 2026-07-02T17:46:28Z
### Audit Run Tier-1 (17:45–17:46 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- A-30 WARN: mcp-server memory 99.62% of 2GiB (1.992GiB) [RAW-PROBE L43]
- Persistent high-memory state (99.67% @ 17:16Z → 99.62% @ 17:46Z, no recovery)
- Restart count: 3 (unchanged) | Disk: 47% ✓ | All health endpoints 200
- Anomalies: 0 new (DEDUP sau-1783012565 + sau-2026-07-02T14:14:52Z-a21-mcp)
- Status: DEGRADED | Dedup: 2 skipped

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T17:45:18Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)      33fea3bafe16                                    19 hours ago
vn-market-intelligence-mcp-frontend-1             Up 26 hours (healthy)     74bfe1c5b392                                    26 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 33 hours (healthy)     vn-market-intelligence-mcp-technical-analysis   33 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)       vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)       vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)       vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 18 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.62% MemUsage=1.992GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    47%    393k  163M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
=== PROBE DONE ===
```

## c491 · 2026-07-02T17:16:39Z
### Audit Run Tier-1 (17:14–17:15 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP | Health: 5/5 OK | A-20: 3/3 PASS
- WARN: mcp-server memory 99.67% of 2GiB (1.993GiB) [RAW-PROBE L46]
- Memory jump observed: 60.70% → 99.67% in ~1 hour (watch for leak)
- Container responsive (isolation probe: get_system_status OK)
- Restart count: 3 (at threshold) | Disk: 48% ✓
- Anomalies: 1 new (A-30 WARN) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-02T17:14:33Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)     33fea3bafe16                                    19 hours ago
vn-market-intelligence-mcp-frontend-1             Up 26 hours (healthy)    74bfe1c5b392                                    26 hours ago
vn-market-intelligence-mcp-technical-analysis-1   Up 32 hours (healthy)    vn-market-intelligence-mcp-technical-analysis   32 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)      vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 days (healthy)      vn-market-intelligence-mcp-macro-indicators     2 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 days (healthy)      vn-market-intelligence-mcp-api-gateway          3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)      vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    2 weeks ago
vn-market-intelligence-mcp-rag-service-1          Up 6 minutes (healthy)   vn-market-intelligence-mcp-rag-service          3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
headroom-proxy                                    Up 6 days                headroom-proxy:local                            3 weeks ago
mcp-gateway                                       Up 6 days (healthy)      mcpservergatway-gateway                         6 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=3

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.51% MemUsage=1.99GiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    48%    393k  153M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
=== PROBE DONE ===
```

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

## c488 · 2026-07-02T14:14:52Z
### Audit Run Tier-1 (14:00–14:15 UTC 2026-07-02)
- Tier: 1 | Services: 12/12 UP (docker ps) | Health: 3/5 OK, 2/5 FAIL | A-20: 3/3 PASS
- CRITICAL: mcp-server unhealthy (docker ps) + CURL_ERR on 3000/health [RAW-PROBE L4, L16]
- WARN: mcp-server restart_count=3 (threshold ≤2) [RAW-PROBE L25]
- Memory: 60.39% ✓ | Disk: 47% ✓ | Isolation: per-service (Docker healthy)
- Anomalies: 1 new (mcp-server CRITICAL) | Status: CRITICAL
- MCP unavailable (get_system_status timeout) — mcp-server unreachable
