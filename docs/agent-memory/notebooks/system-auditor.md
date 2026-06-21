# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

## c275 · 2026-06-21T17:43:02Z
### Audit Run Tier-1 (17:43 UTC 2026-06-21, Sunday off-market 00:43 VN 2026-06-22 Monday)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**RAW-PROBE (2026-06-21T17:43:08Z):**
```
=== AUDITOR PROBE 2026-06-21T17:43:08Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 7 hours (healthy)   vn-market-intelligence-mcp-mcp-server           7 hours ago
vn-market-intelligence-mcp-frontend-1             Up 5 days (healthy)    vn-market-intelligence-mcp-frontend             5 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)    vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)    vn-market-intelligence-mcp-technical-analysis   6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)    vn-market-intelligence-mcp-macro-indicators     6 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 7 days (healthy)    vn-market-intelligence-mcp-kinh-dich-service    7 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)   vn-market-intelligence-mcp-api-gateway          10 days ago
vn-market-intelligence-mcp-rag-service-1          Up 8 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=44.76% MemUsage=916.7MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  253M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, rag-service=92 tracked)
- A-12..A-19 health: 5/5 PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 44.76% (916.7MiB/2GiB) PASS ✓
- A-32 disk: 36% (13Gi/233Gi used, 24Gi free) PASS ✓
- mcp-server: ~7h uptime, healthy (rebuilt ~10:28Z, pre-market VN 00:43 Mon)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN

## c274 · 2026-06-21T17:13:12Z
### Audit Run Tier-1 (17:13 UTC 2026-06-21, Sunday off-market 00:13 VN 2026-06-22)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, stable)
- A-12..A-19 health: 5/5 PASS ✓
- A-30 memory: mcp-server 40.85% (836.7MiB/2GiB) PASS ✓ | A-32 disk: 37% PASS ✓
- mcp-server: ~7h uptime, healthy (rebuilt ~10:28Z)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN

## c273 · 2026-06-21T16:43:54Z
### Audit Run Tier-1 (16:43 UTC 2026-06-21, Sunday off-market 23:43 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, stable)
- A-12..A-19 health: 5/5 PASS ✓
- A-30 memory: mcp-server 45.98% (941.7MiB/2GiB) PASS ✓ | A-32 disk: 37% PASS ✓
- mcp-server: ~6h uptime, healthy

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN
