# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.

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

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T15:43:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 5 hours (healthy)
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)
vn-market-intelligence-mcp-technical-analysis-1   Up 6 days (healthy)
vn-market-intelligence-mcp-macro-indicators-1     Up 6 days (healthy)
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)
vn-market-intelligence-mcp-api-gateway-1          Up 10 days (healthy)
vn-market-intelligence-mcp-rag-service-1          Up 6 hours (healthy)
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)
mcp-gateway                                       Up 10 days (healthy)

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
RestartCount=0 (mcp-server)

--- memory pressure ---
mcp-server MemPerc=38.37% MemUsage=785.7MiB / 2GiB PASS

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%
```

## c270 · 2026-06-21T15:14:20Z
### Audit Run Tier-1 (15:13 UTC 2026-06-21, Sunday off-market 22:13 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor/multi: 3/3 probes PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 36.55% PASS ✓
- A-32 disk: 35% (13Gi/233Gi used) PASS ✓
- mcp-server: ~4.75h uptime, healthy (rebuilt ~10:28Z, 22:13 VN market-closed)

**Signals:** 0 NEW | Dedup-skipped: 0 | Status: CLEAN

## c269 · 2026-06-21T14:43:01Z
### Audit Run Tier-1 (14:43 UTC 2026-06-21, Sunday off-market 21:43 VN)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all PASS, stable)
- Status: CLEAN

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ (RestartCount: mcp-server=0, all stable)
- A-12..A-19 health: 5/5 PASS ✓ | A-20 pdf-extractor/multi: 3/3 probes PASS ✓
- A-21 restart: mcp-server=0 PASS ✓ | A-30 memory: mcp-server 34.67% PASS ✓
- A-32 disk: 37% (13Gi/233Gi used) PASS ✓
- mcp-server: ~4h uptime, healthy (rebuilt ~10:28Z)

**Signals:** 0 NEW | Dedup-skipped: 0 (rag-service restarts known/tracked) | Status: CLEAN
