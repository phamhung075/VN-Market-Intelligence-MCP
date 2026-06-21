# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c618 · 2026-06-21T01:07:19Z
### Audit Run Tier-1 (01:07 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable)
- Status: HEALTHY

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓ | A-21 restart: 0 ✓
- A-30 memory: 18.49% ✓ | A-32 disk: 36% ✓

**Signals:** 0 NEW | Status: CLEAN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-21T01:06:52Z ===

--- docker ps -a ---
NAMES                                             STATUS                   IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 2 hours (healthy)     vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)      vn-market-intelligence-mcp-frontend
vn-market-intelligence-mcp-pdf-extractor-1        Up 5 days (healthy)      vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)      vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)      vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)      vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)      vn-market-intelligence-mcp-kinh-dich-service
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)      vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-rag-service-1          Up 7 minutes (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)     vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)     vn-market-intelligence-mcp-alert-engine

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=18.49% MemUsage=378.6MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%

[A-20-PROBE-1] in-container HTTP 200 ✓
[A-20-PROBE-2] in-container HTTP 200 ✓
[A-20-PROBE-3] in-container HTTP 200 ✓
Majority vote: 3/3 PASS
```

## c617 · 2026-06-21T00:37:29Z
### Audit Run Tier-1 (00:37 UTC 2026-06-21, Sunday off-market)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ | A-12..A-19 health: 5/5 PASS ✓
- A-21 restart: 0 ✓ | A-30 memory: 20.50% ✓ | A-32 disk: 33% ✓

**Signals:** 0 NEW | Status: CLEAN
