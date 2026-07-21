# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c9a1f5 · 2026-07-21T15:12:51Z
### Audit Run Tier-1 (15:11–15:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (1 UNHEALTHY)
- Health endpoints: 4 OK (mcp-server, macro-indicators, frontend, api-gateway), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall (KNOWN PDF-AVAIL-02-FIX)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 99.75% WARN (spike from sawtooth) | A-32 Disk: 34% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | 2 dedup-skipped (A-20 last 2026-07-21T03:41:45Z, A-30 last 2026-07-19T08:11:04Z) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T15:11:36Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)       vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)       vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)       vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 14 hours (healthy)     vn-market-intelligence-mcp-mcp-server           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 days (healthy)       vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)       vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 42 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)       vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)       vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)       vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=99.75% MemUsage=2.993GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    26Gi    34%    393k  276M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

### Emit Results:
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-21T03:41:45Z id=sys-20260721T151232-54c9
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:mcp-server:A-30 last_sent=2026-07-19T08:11:04Z id=sys-20260721T151241-28d6
## c8f9b3 · 2026-07-21T14:43:24Z
### Audit Run Tier-1 (14:41–14:43 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (1 UNHEALTHY)
- Health endpoints: 4 OK (mcp-server, macro-indicators, frontend, api-gateway), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall (KNOWN PDF-AVAIL-02-FIX)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 91.19% WARN (GC-sawtooth within band) | A-32 Disk: 34% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | 2 dedup-skipped (A-20 last 2026-07-21T03:41:45Z, A-30 last 2026-07-19T08:11:04Z) | Status: DEGRADED
## c889e · 2026-07-21T14:34:18Z
### Audit Run Tier-2 (14:32–14:34 UTC 2026-07-21)
- Tier: 2 | Sources: 28 checked | Cron gaps: 0 | VPS routes: 4 ok | Rate limits: 14 ok | DB spot: 2 ok
- Data freshness: news CRITICAL (92min SLA 30min), sbv-vps CRITICAL (47min SLA 30min) | bctc queue=183 pending
- VPS service: 1 healthy (news), 2 idle (price/ff by design), 2 unhealthy (bctc-fetch, sbv-fetch)
- Anomalies: 2 new (2C 0W 0I) | 0 dedup-skipped | Status: DEGRADED
