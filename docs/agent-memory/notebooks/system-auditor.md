# System Auditor — Tier-1 Notebook

## c109 · 2026-08-22T22:30Z

### Audit Run Tier-1

**Timestamp:** 2026-08-22T22:38:25Z  
**Tier:** Tier-1 (30-min cadence, runtime ping)  
**Verdict:** ALL_GREEN  

### RAW-PROBE:

```
=== AUDITOR PROBE 2026-08-22T22:38:25Z ===

--- docker ps -a ---
NAMES                                             STATUS                 IMAGE                                           CREATED
vn-market-intelligence-mcp-alert-engine-1         Up 5 hours (healthy)   vn-market-intelligence-mcp-alert-engine         5 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 7 days (healthy)    vn-market-intelligence-mcp-rag-service          7 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 7 days (healthy)    vn-market-intelligence-mcp-pdf-extractor        7 days ago
vn-market-intelligence-mcp-mcp-server-1           Up 7 days (healthy)    vn-market-intelligence-mcp-mcp-server           7 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 9 days (healthy)    vn-market-intelligence-mcp-news-fetch           9 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)    vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-stock-price-1          Up 2 weeks (healthy)   vn-market-intelligence-mcp-stock-price          2 weeks ago
vn-market-intelligence-mcp-macro-indicators-1     Up 3 weeks (healthy)   vn-market-intelligence-mcp-macro-indicators     3 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 4 weeks (healthy)   vn-market-intelligence-mcp-frontend             4 weeks ago
mcp-gateway                                       Up 5 weeks (healthy)   mcpservergatway-gateway                         5 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 5 weeks (healthy)   ghcr.io/flaresolverr/flaresolverr:latest        5 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 weeks (healthy)   vn-market-intelligence-mcp-technical-analysis   5 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 5 weeks (healthy)   vn-market-intelligence-mcp-kinh-dich-service    5 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.57% MemUsage=416.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 1.69% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 46.06% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 80.27% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 13.57% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 20.67% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.87% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.63% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.62% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.50% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 4.96% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.72% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.99% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  162M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings

All checks PASS:
- **A-01 through A-11 (Container Status):** All 11 services UP (healthy)
- **A-12 through A-20 (Health Endpoints):** All endpoints OK (HTTP 200)
  - mcp-server:3000/health OK
  - api-gateway:4000/health OK
  - macro-indicators:5004/health OK
  - pdf-extractor:5001/health OK
  - frontend:3001/ OK
- **A-20 (pdf-extractor Multi-Probe):** 3/3 probes passed → PASS
- **A-21 (Restart Count):** RestartCount=0 → PASS
- **A-30 (Memory Pressure):** All containers <85% baseline → all SKIP (no deep-probe needed)

### Summary

All 20+ checks PASS. No anomalies detected.

**Signals Emitted:** 0 (all green)  
**Dedup Skipped:** 1 (tier-3 schedule gap, already reported 2026-08-22T16:37:59Z)  
**Status:** ALL_GREEN

**Cycle Markers:**
```
[emit-signal] SKIP-dedup dedup_key=auditor-cycle-missing:tier3:2026-08-22T02:00Z last_sent=2026-08-22T16:37:59Z id=sys-20260822T223759-54ed
[durability-sweep] swept=0 malformed=0 found=0 schedule_gap_t1=0 schedule_gap_t2=0 schedule_gap_t3=1
```
