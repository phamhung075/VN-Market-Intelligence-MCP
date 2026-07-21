# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c889e · 2026-07-21T14:34:18Z
### Audit Run Tier-2 (14:32–14:34 UTC 2026-07-21)
- Tier: 2 | Sources: 28 checked | Cron gaps: 0 | VPS routes: 4 ok | Rate limits: 14 ok | DB spot: 2 ok
- Data freshness: news CRITICAL (92min SLA 30min), sbv-vps CRITICAL (47min SLA 30min) | bctc queue=183 pending
- VPS service: 1 healthy (news), 2 idle (price/ff by design), 2 unhealthy (bctc-fetch, sbv-fetch)
- Anomalies: 2 new (2C 0W 0I) | 0 dedup-skipped | Status: DEGRADED

### Emit Results:
- [emit-signal] OK dedup_key=data_stale:news-vps:B-03 id=sys-20260721T143352-15e7
- [emit-signal] OK dedup_key=data_stale:sbv-vps:B-04 id=sys-20260721T143355-616c
## c<NEW> · 2026-07-21T14:11:07Z
### Audit Run Tier-1 (14:10–14:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (1 UNHEALTHY)
- Health endpoints: 4 OK (mcp-server, macro-indicators, frontend, api-gateway), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall (KNOWN PDF-AVAIL-02-FIX)
- A-12 api-gateway health: CURL_ERR (recurring, last 2026-07-20T06:12:10Z)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 88.81% WARN (within GC-sawtooth band) | A-32 Disk: 36% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | 3 dedup-skipped (A-12 last 2026-07-20T06:12:10Z, A-20 last 2026-07-21T03:41:45Z, A-30 last 2026-07-19T08:11:04Z) | Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-21T14:11:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
mcp-gateway                                       Up 5 days (healthy)       mcpservergatway-gateway                         5 days ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)       vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 5 days (healthy)       vn-market-intelligence-mcp-api-gateway          5 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        5 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 5 days (healthy)       vn-market-intelligence-mcp-news-fetch           5 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)     vn-market-intelligence-mcp-mcp-server           5 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 days (healthy)       vn-market-intelligence-mcp-rag-service          5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)       vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 41 hours (unhealthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)       vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 5 days (healthy)       vn-market-intelligence-mcp-alert-engine         5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)       vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    5 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health FAIL (HTTP CURL_ERR)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health FAIL (HTTP CURL_ERR)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=2

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=88.81% MemUsage=2.664GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  261M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 000000
[A-20-PROBE-2] in-container HTTP 000000
[A-20-PROBE-3] in-container HTTP 000000
[A-20] pass_count=0/3

=== PROBE DONE ===
```

### Emit Results:
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:api-gateway:A-12 last_sent=2026-07-20T06:12:10Z id=sys-20260721T141203-40b0
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:pdf-extractor:A-20 last_sent=2026-07-21T03:41:45Z id=sys-20260721T141213-26f0
- [emit-signal] SKIP-dedup dedup_key=microservice_degraded:mcp-server:A-30 last_sent=2026-07-19T08:11:04Z id=sys-20260721T141218-70cb
## c210a9e · 2026-07-21T13:12:14Z
### Audit Run Tier-1 (13:10–13:12 UTC 2026-07-21)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (1 UNHEALTHY)
- Health endpoints: 4 OK (mcp-server, api-gateway, macro-indicators, frontend), 1 FAIL (pdf-extractor CURL_ERR)
- A-20 multi-probe (pdf-extractor): 0/3 PASS — event-loop stall (KNOWN PDF-AVAIL-02-FIX)
- A-21 Restart count: mcp-server=2 PASS | A-30 Memory: 88.38% WARN (GC-sawtooth reclamation, within band) | A-32 Disk: 36% PASS
- Cron health: All 87 jobs nominal (100% success rate, no gaps)
- Anomalies: 0 new | 2 dedup-skipped (A-30 last 2026-07-19T08:11:04Z, A-20 last 2026-07-21T03:41:45Z) | Status: DEGRADED
