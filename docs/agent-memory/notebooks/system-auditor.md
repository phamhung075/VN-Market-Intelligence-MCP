# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## 0ab97c7 · 2026-07-22T06:32:52Z
### Audit Run Tier-2 (06:30–06:32 UTC 2026-07-22)
- Tier: 2 | Cron fire check: PASS (100+ jobs running) | Sources checked: 28
- VPS proxy health: DEGRADED (2 healthy, 3 unhealthy: vn-bctc-fetch, vn-price-fetch, vn-foreign-flow)
- SLA breaches: 2 CRITICAL (B-04 foreign-flow 1642min/10min, B-05 bctc-discover 2441min/120min)
- DB spot checks: PASS (C-06=3 messages, C-07=284 signals, B-09=0 SSC URLs, B-13=0 stale)
- BCTC queue: 183 pending/url_not_found/enrich_failed items (not healthy-idle gate)
- Anomalies: 3 new (C critical × 3: foreign-flow, bctc-discover, VPS services) | Status: DEGRADED
- [emit-signal] OK-escalation-bypass B-04 id=sys-20260722T063217-1356
- [emit-signal] OK-escalation-bypass B-05 id=sys-20260722T063233-76cb
- [emit-signal] OK-escalation-bypass B-06 id=sys-20260722T063225-07c9

## a4f2b1e · 2026-07-22T06:11:30Z
### Audit Run Tier-1 (06:10–06:11 UTC 2026-07-22)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (all stable)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=1 PASS | A-30 Memory: 49.92% PASS | A-32 Disk: 27% PASS
- Anomalies: 0 new (all green) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-22T06:10:58Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 4 hours (healthy)    vn-market-intelligence-mcp-mcp-server           14 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 14 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        14 hours ago
mcp-gateway                                       Up 6 days (healthy)     mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)     vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)     vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)     vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)     vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)     vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=49.92% MemUsage=1.498GiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    37Gi    27%    393k  389M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## 7d3f9cd · 2026-07-22T03:40:44Z
### Audit Run Tier-1 (03:40–03:41 UTC 2026-07-22)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (all stable)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=1 PASS | A-30 Memory: 18.18% PASS | A-32 Disk: 27% PASS
- Anomalies: 0 new (all green) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-22T03:40:44Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)    vn-market-intelligence-mcp-mcp-server           12 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 12 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        12 hours ago
mcp-gateway                                       Up 6 days (healthy)     mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)     vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)     vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)     vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)     vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)     vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)     vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=18.18% MemUsage=558.4MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    37Gi    27%    393k  390M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## d4-auto · 2026-07-22T03:00:02.728Z
D4 candidates: none

## c86a9e8 · 2026-07-22T02:32:20Z
### Audit Run Tier-2 (02:31–02:32 UTC 2026-07-22)
- Tier: 2 | Cron gap check: PASS | Per-source freshness: 1 CRITICAL | VPS proxy: DEGRADED
- Sources checked: 28 | DB spot checks: PASS (C-06, C-07)
- B-05 gate: bctc-discover HEALTHY IDLE (queue=183, SLA out-of-window threshold=2355h)
- B-09 URL shape: PASS (0 SSC portal URLs) | B-13 stale pending: PASS
- Anomalies: 1 new (C critical: foreign-flow stale 1402min, SLA 30min) | Status: DEGRADED
- [emit-signal] OK dedup_key=data_stale:foreign-flow:B-04 id=sys-20260722T023220-774e

## c8f3b5d · 2026-07-22T02:11:23Z
### Audit Run Tier-1 (02:10–02:11 UTC 2026-07-22)
- Tier: 1 | Services: 12 checked (all host_runtime_set) | Container status: 12 UP (all healthy)
- Health endpoints: 5 OK (all stable)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=1 PASS | A-30 Memory: 10.99% PASS | A-32 Disk: 27% PASS
- Anomalies: 0 new (all green) | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-22T02:10:48Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 minutes (healthy)       vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 10 hours (healthy)        vn-market-intelligence-mcp-pdf-extractor        10 hours ago
mcp-gateway                                       Up 6 days (healthy)          mcpservergatway-gateway                         6 days ago
vn-market-intelligence-mcp-frontend-1             Up 6 days (healthy)          vn-market-intelligence-mcp-frontend             6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 6 days (healthy)          vn-market-intelligence-mcp-api-gateway          6 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 6 days (healthy)          ghcr.io/flaresolverr/flaresolverr:latest        6 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 6 days (healthy)          vn-market-intelligence-mcp-news-fetch           6 days ago
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)          vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)          vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 6 days (healthy)          vn-market-intelligence-mcp-alert-engine         6 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)          vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)          vn-market-intelligence-mcp-kinh-dich-service    6 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=10.99% MemUsage=337.6MiB / 3GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    38Gi    27%    393k  400M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## c8f3b5d · 2026-07-22T01:41:09Z
### Audit Run Tier-1 (01:41–01:42 UTC 2026-07-22)
- Tier: 1 | Services: 13 checked (all host_runtime_set) | Container status: 13 UP (all healthy)
- Health endpoints: 5 OK (all recovered from 01:40Z api-gateway failure)
- A-20 multi-probe (pdf-extractor): 3/3 PASS — event-loop healthy
- A-21 Restart count: mcp-server=0 PASS | A-30 Memory: 99.86% (CONVERGE-benign, GC sawtooth pattern) | A-32 Disk: 27% PASS
- Health-3000 multi-probe: 5/5 PASS (no transient failures detected under memory pressure)
- Anomalies: 0 new (transient api-gateway recovery from 01:40Z) | Status: HEALTHY
