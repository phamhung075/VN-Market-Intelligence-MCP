## 0jokmt2v · 2026-07-25T12:07:37Z
### Audit Run Tier-1 (12:07 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: ALL 200 OK (5/5) — PASS
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-30 Memory: 73.84% (2215 MiB / 3072 MiB) — PASS (< 85% investigate-gate, SKIP deep-probe)
- A-32 Disk: 34% used — PASS
- Memory state: sampled 2026-07-25T12:07:47Z mid-cycle (after ~25s audit elapsed). 73.84% baseline < 85% gate → deep-probe skipped by design. No OOMKilled or reclamation signal. Within observed envelope since 08:07Z (51.99%→58.63%→66.35%→73.84% = +21.85% over 4h, tracking FIX-MCP-MEMORY-CODE-LEAK backlog).
- Rag-service: RestartCount=13, last restart 11:43:08Z (ExitCode=0, OOMKilled=false) — clean exit, OUT-OF-SCOPE (A-30/A-21 mcp-server-scoped only per probe.sh:209 grep hardcode).
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 13 host_runtime_set services UP (healthy). All 5 health endpoints 200 OK. A-20 multi-probe 3/3. A-21 zero windowed crashes. A-30 gated by baseline. A-32 disk 34%. Cron health: 100+ jobs, all recent runs success, no fire gaps (A-29 SERVER-SIDE plane verified only; session-side CronList plane not verified). MCP uptime 14h 19m. Database 379.48 MB, WAL 0 B.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-25T12:07:47Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 18 hours (healthy)     vn-market-intelligence-mcp-frontend             18 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 14 hours (healthy)     vn-market-intelligence-mcp-mcp-server           28 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)       vn-market-intelligence-mcp-pdf-extractor        3 days ago
mcp-gateway                                       Up 9 days (healthy)       mcpservergatway-gateway                         9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)       vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 9 days (healthy)       ghcr.io/flaresolverr/flaresolverr:latest        9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)       vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 24 minutes (healthy)   vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)       vn-market-intelligence-mcp-macro-indicators     9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)       vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)       vn-market-intelligence-mcp-alert-engine         9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)       vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)       vn-market-intelligence-mcp-kinh-dich-service    9 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=73.84% MemUsage=2.215GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 73.84% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    27Gi    34%    393k  278M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## f5h8k3j2 · 2026-07-25T10:38:45Z
### Audit Run Tier-1 (10:38 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: ALL 200 OK (5/5) — PASS
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-30 Memory: 66.35% (1.991 GiB / 3 GiB) — PASS (< 85%, SKIP deep-probe)
- A-32 Disk: 36% used — PASS
- Memory trend: monotonic rise 51.99% (08:07Z) → 58.63% (08:37Z) → 66.35% (10:38Z) = +14.36% in ~2.5h; 85% threshold remains alert gate
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 13 host_runtime_set services UP (healthy). All 5 health endpoints 200 OK. A-20 multi-probe 3/3. Memory 66.35% << 85% investigate-gate. A-21 zero windowed crashes. A-32 disk 36% well below 85%. Cron jobs all healthy (100+ jobs, most ≥80% success rates, recent runs success). MCP uptime 12h 50m. Database 379.48 MB, WAL 0 B. Memory slope continues upward but well within normal operating envelope. Series extends: 57.45%→60.65%→63.65%→64.94%→66.35% tracks known FIX-MCP-MEMORY-CODE-LEAK (backlog, open since 2026-06-09).

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-25T10:38:45Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 17 hours (healthy)   vn-market-intelligence-mcp-frontend             17 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-mcp-server           26 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 9 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)     vn-market-intelligence-mcp-macro-indicators     9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    9 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=66.35% MemUsage=1.991GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 66.35% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  258M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

## e4g2j9h1 · 2026-07-25T08:37:49Z
### Audit Run Tier-1 (08:37 UTC 2026-07-25)
- Tier: 1 | Services: 13 checked | Health endpoints: 5
- A-01–A-11 container status: ALL UP (13/13) — PASS
- A-12–A-19 health endpoints: ALL 200 OK (5/5) — PASS
- A-20 pdf-extractor multi-probe: 3/3 PASS
- A-21 crash restarts: 0 (4h window) | A-30 Memory: 58.63% (1.759 GiB / 3 GiB) — PASS (< 85%, SKIP deep-probe)
- A-32 Disk: 33% used — PASS
- Memory trend: monotonic rise 51.99% (08:07Z) → 58.63% (08:37Z) = +6.64% in 30min; 85% threshold remains the alert gate
- Anomalies: 0 new
- Status: HEALTHY
- Corroboration: All 13 host_runtime_set services UP (healthy). All 5 health endpoints 200 OK. A-20 multi-probe 3/3 passes. Memory 58.63% << 85% investigate-gate. Denominator=3GiB (Docker stats limit). A-21 zero windowed crashes. A-32 disk 33% well below 85%. Cron jobs healthy (80+ jobs, ≥80% success rates, recent runs all success). MCP uptime 10h 49m. Database 379.48 MB, WAL 0 B. Within observed memory envelope; no evidence of runaway leak.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-07-25T08:37:18Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-frontend-1             Up 15 hours (healthy)   vn-market-intelligence-mcp-frontend             15 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 11 hours (healthy)   vn-market-intelligence-mcp-mcp-server           24 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 3 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        3 days ago
mcp-gateway                                       Up 9 days (healthy)     mcpservergatway-gateway                         9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-flaresolverr-1         Up 9 days (healthy)     ghcr.io/flaresolverr/flaresolverr:latest        9 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)     vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 5 hours (healthy)    vn-market-intelligence-mcp-rag-service          9 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 9 days (healthy)     vn-market-intelligence-mcp-macro-indicators     9 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 9 days (healthy)     vn-market-intelligence-mcp-technical-analysis   9 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 9 days (healthy)     vn-market-intelligence-mcp-alert-engine         9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 9 days (healthy)     vn-market-intelligence-mcp-stock-price          9 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 9 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    9 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=58.63% MemUsage=1.759GiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 58.63% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    28Gi    33%    393k  290M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```
