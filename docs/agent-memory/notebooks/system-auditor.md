
## c65 · 2026-08-06T15:41:26Z
### Audit Run Tier-1 (15:30–15:41 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 0 new (C 0, W 0, I 0) | 1 dedup-skipped
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-06T15:40:22Z ===

--- docker ps -a ---
All 13 services UP (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=49.33% MemUsage=1.48GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 49.33% < 85% investigate-gate

--- disk df -h / ---
Capacity: 54% < 85% PASS

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
**A-01 to A-11 (Container Status):** All 13 host_runtime_set services UP ✓

**A-12 to A-20 (Health Endpoints):** All 5 endpoints OK ✓

**A-20 pdf-extractor multi-probe:** 3/3 pass ✓

**A-21 (Restart Count - Crash Detection):** mcp-server 4 crash restarts in 4h window (2026-08-06 12:17-12:25 UTC) → WARN (dedup-skipped, known issue from 2026-08-05T10:34:34Z)
Signal: sys-20260806T154111-1649

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:mcp-server:A-21 last_sent=2026-08-05T10:34:34Z id=sys-20260806T154111-1649
[emit-dashboard] OK id=sys-20260806T154111-1649 check_id=A-21

**A-30 (Memory Pressure):** mcp-server 49.33% < 85% → PASS ✓

**A-32 (Disk):** 54% capacity < 85% → PASS ✓

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c64 · 2026-08-06T15:11:23Z
### Audit Run Tier-1 (15:00–15:10 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 1 dedup-skipped (0 new, 1 known)
- Status: DEGRADED

### Findings:
**A-01 to A-11 (Container Status):** All 13 host_runtime_set services UP ✓

**A-12 to A-20 (Health Endpoints):** All 5 OK ✓

**A-20 pdf-extractor multi-probe:** 3/3 pass ✓

**A-30 (Memory Pressure):**
- rag-service: 96.56% of 1GiB → WARN (persistent high baseline, no reclamation dips)
- mcp-server: 39.32% → PASS
Signal emitted (dedup-skipped, last sent 2026-08-06T08:16:21Z, occurrence 5-6 in FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH) | id=sys-20260806T151042-6d28

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 last_sent=2026-08-06T08:16:21Z id=sys-20260806T151042-6d28
[emit-dashboard] OK id=sys-20260806T151042-6d28 check_id=A-30

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c63 · 2026-08-06T14:43:48Z
### Audit Run Tier-1 (14:30–14:42 UTC 2026-08-06)
- Tier: 1 | Services: 13 checked | Sources: 0 | DB checks: 0
- Anomalies: 1 CRITICAL (rag-service A-30) | 1 dedup-skipped
- Status: DEGRADED

### Findings:
**A-01 to A-11 (Container Status):** All 13 services UP ✓

**A-12 to A-20 (Health Endpoints):** All 5 OK ✓

**A-20 pdf-extractor multi-probe:** 3/3 pass ✓

**A-30 (Memory Pressure):**
- rag-service: 96.69% of 1GiB → CRITICAL (persistent >96% memory)
- mcp-server: 32.54% → PASS
- pdf-extractor: 70.43% → PASS
Signal emitted (dedup-skipped, last sent 2026-08-06T08:16:21Z) | id=sys-20260806T144250-77d3

[emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260806T144250-77d3
[emit-dashboard] OK id=sys-20260806T144250-77d3 check_id=A-30

### Audit Run Tier-1 (14:19–14:20 UTC 2026-08-06)
- Tier: 1 | Services: 13/13 up | Health: 5/5 OK
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 0 dedup-skipped
- Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-06T14:19:41Z ===

--- docker ps -a ---
NAMES                                             STATUS                       IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up About an hour (healthy)   vn-market-intelligence-mcp-rag-service          About an hour ago
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)         vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)          vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)          vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)          vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-frontend-1             Up 12 days (healthy)         vn-market-intelligence-mcp-frontend             12 days ago
mcp-gateway                                       Up 3 weeks (healthy)         mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)         vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)         ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)         vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)         vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)         vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)         vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=34.95% MemUsage=1.049GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 34.95% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    12Gi    53%    393k  127M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
**A-01 to A-11 (Container Status):** All 13 host_runtime_set services UP (healthy) ✓

**A-12 to A-20 (Health Endpoints):** All 5 endpoints OK ✓

**A-21 (Restart Count):** mcp-server RestartCount=4, no crashes in 4h window ✓

**A-30 (Memory Pressure):** mcp-server 34.95% < 85% → PASS ✓

**A-32 (Disk):** 53% capacity < 85% → PASS ✓

**A-20 pdf-extractor multi-probe:** 3/3 pass ✓

**Summary:** All probed services operational. No anomalies detected this cycle.

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE
