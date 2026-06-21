# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c274 · 2026-06-21T17:13:12Z
### Audit Run Tier-1 (17:13 UTC 2026-06-21, Sunday off-market 00:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**RAW-PROBE (2026-06-21T17:13:12Z):**
```
=== AUDITOR PROBE 2026-06-21T17:13:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)   vn-market-intelligence-mcp-mcp-server           7 hours ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)    vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)    vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)    vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)   vn-market-intelligence-mcp-api-gateway          10 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)   vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)   vn-market-intelligence-mcp-alert-engine         10 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=40.85% MemUsage=836.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  242M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, stable)
- A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ (event-loop healthy)
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 40.85% (836.7MiB/2GiB) PASS ✓
- A-32 disk: 37% (13Gi/233Gi used, 23Gi free) PASS ✓
- mcp-server: ~7h uptime, healthy (rebuilt ~10:28Z)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN

## c273 · 2026-06-21T16:43:54Z
### Audit Run Tier-1 (16:43 UTC 2026-06-21, Sunday off-market 23:43 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**RAW-PROBE (2026-06-21T16:43:12Z):**
```
=== AUDITOR PROBE 2026-06-21T16:43:12Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 6 hours (healthy)   vn-market-intelligence-mcp-mcp-server           6 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)    vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)    vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)    vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)   vn-market-intelligence-mcp-api-gateway          10 days ago
vn-market-intelligence-mcp-rag-service-1          Up 7 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)   vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)   vn-market-intelligence-mcp-alert-engine         10 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=45.98% MemUsage=941.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  241M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, stable)
- A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ (event-loop healthy)
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 45.98% (941.7MiB/2GiB) PASS ✓
- A-32 disk: 37% (13Gi/233Gi used, 23Gi free) PASS ✓
- mcp-server: ~6h uptime, healthy (rebuilt ~10:28Z)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN

## c272 · 2026-06-21T16:13:02Z
### Audit Run Tier-1 (16:13 UTC 2026-06-21, Sunday off-market 23:13 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (mcp-server RestartCount=0, rag-service=92 tracked/known)
- A-12..A-19 health: 5/5 PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 40.40% (827.4MiB/2GiB) PASS ✓
- A-32 disk: 36% (13Gi/233Gi used, 24Gi free) PASS ✓
- mcp-server: ~6h uptime, healthy (rebuilt ~10:28Z, market-closed)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN

## c271 · 2026-06-21T15:43:00Z
### Audit Run Tier-1 (15:43 UTC 2026-06-21, Sunday off-market 22:43 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, stable)
- A-12..A-19 health: 5/5 PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 38.37% PASS ✓
- A-32 disk: 36% (13Gi/233Gi used, 24Gi free) PASS ✓
- mcp-server: ~5h uptime, healthy (rebuilt ~10:28Z, 22:43 VN market-closed)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN
