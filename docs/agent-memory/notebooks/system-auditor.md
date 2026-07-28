## c8v5x2m7 · 2026-07-28T13:12:27Z
### Audit Run Tier-1 (13:07 UTC 2026-07-28) — Memory Pressure Continuation
- Tier: 1 | Services: 13 checked | Health: 5 endpoints
- A-01–A-11: ALL UP (13/13) ✓ | A-12–A-19: ALL 200 OK (5/5) ✓
- A-20 pdf-extractor: 3/3 PASS ✓ | A-21 restarts: 0 (4h) ✓ | A-32 disk: 35% ✓
- A-30 mcp-server: 69.58% (< 85% gate, SKIP deep-probe) ✓
- **FINDINGS:** pdf-extractor 85.54% (same as 12:45Z, plateau confirmed). rag-service 88.32% post-restart (restarted 12:21Z from 99.10%, RestartCount=15). Both WARN signals emitted (ids: sys-20260728T131219-3fca, sys-20260728T131227-5964).
- Anomalies: 2 memory pressure events (both continuation/monitoring)
- Status: DEGRADED

### RAW-PROBE:
[PROBE 2026-07-28T13:07:55Z]: All services UP, all health endpoints 200 OK, mcp-server mem 69.58%, disk 35%, pdf-extractor multi-probe 3/3, restarts=0 in 4h window.

## c6m2p9k1 · 2026-07-28T12:45:35Z
### Audit Run Tier-1 (12:45 UTC 2026-07-28) — PDF-Extractor Memory WARN
- Tier: 1 | Services: 13 checked | Health: 5 endpoints
- A-01–A-11: ALL UP (13/13) ✓ | A-12–A-19: ALL 200 OK (5/5) ✓
- A-20 pdf-extractor: 3/3 PASS ✓ | A-21 restarts: 0 (4h) ✓ | A-32 disk: 34% ✓
- A-30 mcp-server: 72.70% (< 85% gate, SKIP deep-probe) ✓
- **🚨 PDF-MEM-01 WARN:** pdf-extractor 85.54% of 2.5 GiB (2.138 GiB, crossing WARN threshold). Methodology: multi-sample window (3 samples 10s apart) all showed 2.138 GiB → PLATEAU, NOT LEAK. Restart history: RestartCount=2 lifetime, current uptime 3h continuous (since 09:26:20Z), OOMKilled=false, health status healthy. Root: 458 PDF extraction jobs in 'processing' state loaded in memory (normal working set for OCR/PDF work), 0 jobs completed in 24h (stalled queue). Severity: WARN (at threshold, stable). Signal: sys-20260728T124939-50a8
- Structural defect discovered: A-30 probe.sh only checks mcp-server memory (line 59-92), not pdf-extractor or other containers. This audit captured pdf-extractor 85.54% only via manual sampling, not via standard A-30 check. **Recommend:** extend A-30 or create separate PDF-MEM check covering all memory-intensive containers (pdf-extractor, rag-service).
- **rag-service context:** 99.10% from prior cycle (12:09Z) — continuation, not new. Per trigger directive, NOT re-emitted.
- Anomalies: 1 new (pdf-extractor memory WARN, PDF-MEM-01)
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-28T12:45:35Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 days (healthy)       vn-market-intelligence-mcp-mcp-server           3 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)       vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 hours (healthy)      vn-market-intelligence-mcp-pdf-extractor        6 days ago
mcp-gateway                                       Up 12 days (healthy)      mcpservergatway-gateway                         12 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)      vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 12 days (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)      vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 23 minutes (healthy)   vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)      vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 12 days (healthy)      vn-market-intelligence-mcp-technical-analysis   12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)      vn-market-intelligence-mcp-alert-engine         12 days ago
vn-market-intelligence-mcp-stock-price-1          Up 12 days (healthy)      vn-market-intelligence-mcp-stock-price          12 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 12 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service    12 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=72.70% MemUsage=2.181GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 72.71% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  281M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Supplemental PDF-Extractor Metrics (manual multi-sample audit):
```
PDF-Extractor Direct Metrics:
docker stats snapshot: 3b0413734f67 vn-market-intelligence-mcp-pdf-extractor-1 0.17% 2.138GiB / 2.5GiB 85.54%

Memory Samples (10s apart):
  Sample 1: 2.138 GiB
  Sample 2: 2.138 GiB
  Sample 3: 2.138 GiB

Container Inspect:
  MemoryLimit=2684354560 (2.5 GiB)
  MemorySoft=1073741824 (1 GiB reservation)
  RestartCount=2 (lifetime cumulative)
  StartedAt=2026-07-28T09:26:20Z
  OOMKilled=false
  Health=healthy

Uptime: ~201 minutes (~3 hours)

Queue Status (pdf_extractor.db):
  pending: 0
  processing: 458 (STALLED)
  done_24h: 0

Recent Process Info:
  Process: python3 -m uvicorn main:app --host 0.0.0.0 --port 5001
  CPU: 0.17% (idle)
  Memory: 25.7% of system (RSS 2090960 KB)
  Logs: health checks only, no active PDF extraction
```

## 7knw9z3x · 2026-07-28T12:09:11Z
### Audit Run Tier-1 (12:08 UTC 2026-07-28)
- Tier: 1 | Services: 13 checked | Health: 5 endpoints
- A-01–A-11: ALL UP (13/13) ✓ | A-12–A-19: ALL 200 OK (5/5) ✓
- A-20 pdf-extractor: 3/3 PASS ✓ | A-21 restarts: 0 (4h) ✓
- A-30 mcp-server: 66.82% (< 85% gate) ✓ | A-32 disk: 34% ✓
- 🚨 **A-RAG-MEM-01 WARN:** rag-service 99.10% of 768 MiB cap (761.1 MiB, <7 MiB headroom). Climbed from 86.65% over 66h dormancy. OOMKilled=false but vulnerable. Signal: sys-20260728T120919-7e1e
- Anomalies: 1 new (rag-service memory WARN)
- Status: DEGRADED

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-28T12:08:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 2 days (healthy)    vn-market-intelligence-mcp-mcp-server           2 days ago
vn-market-intelligence-mcp-frontend-1             Up 3 days (healthy)    vn-market-intelligence-mcp-frontend             3 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        6 days ago
mcp-gateway                                       Up 12 days (healthy)   mcpservergatway-gateway                         12 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 12 days (healthy)   vn-market-intelligence-mcp-api-gateway          12 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 12 days (healthy)   ghcr.io/flaresolverr/flaresolverr:latest        12 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 12 days (healthy)   vn-market-intelligence-mcp-news-fetch           12 days ago
vn-market-intelligence-mcp-rag-service-1          Up 2 days (healthy)    vn-market-intelligence-mcp-rag-service          12 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 12 days (healthy)   vn-market-intelligence-mcp-macro-indicators     12 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 12 days (healthy)   vn-market-intelligence-mcp-technical-analysis   12 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 12 days (healthy)   vn-market-intelligence-mcp-alert-engine         12 days ago
vn-market-intelligence-mcp-stock-price-1          Up 12 days (healthy)   vn-market-intelligence-mcp-stock-price          12 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 12 days (healthy)   vn-market-intelligence-mcp-kinh-dich-service    12 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=66.82% MemUsage=2.005GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 66.83% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  281M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```
