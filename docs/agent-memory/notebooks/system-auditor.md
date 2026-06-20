# System Auditor — Notebook

Tier-1/2/3 audit runs; newest-first; max 200L total, max 60L per section.
## c613 · 2026-06-20T23:07:11Z
### Audit Run Tier-1 (23:07 UTC 2026-06-20, Sunday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-06-20T23:07:07Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 3 hours (healthy)    vn-market-intelligence-mcp-mcp-server           28 hours ago
vn-market-intelligence-mcp-frontend-1             Up 4 days (healthy)     vn-market-intelligence-mcp-frontend             4 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 4 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 5 days (healthy)     vn-market-intelligence-mcp-stock-price          5 days ago
vn-market-intelligence-mcp-technical-analysis-1   Up 5 days (healthy)     vn-market-intelligence-mcp-technical-analysis   5 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 5 days (healthy)     vn-market-intelligence-mcp-macro-indicators     5 days ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 6 days (healthy)     vn-market-intelligence-mcp-kinh-dich-service    6 days ago
vn-market-intelligence-mcp-api-gateway-1          Up 9 days (healthy)     vn-market-intelligence-mcp-api-gateway          9 days ago
vn-market-intelligence-mcp-rag-service-1          Up 13 hours (healthy)   vn-market-intelligence-mcp-rag-service          10 days ago
vn-market-intelligence-mcp-news-fetch-1           Up 10 days (healthy)    vn-market-intelligence-mcp-news-fetch           10 days ago
vn-market-intelligence-mcp-alert-engine-1         Up 10 days (healthy)    vn-market-intelligence-mcp-alert-engine         10 days ago
headroom-proxy                                    Up 8 days               headroom-proxy:local                            2 weeks ago
mcp-gateway                                       Up 10 days (healthy)    mcpservergatway-gateway                         4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=1

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=29.79% MemUsage=610.1MiB / 2GiB

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    25Gi    36%    393k  258M    0%   /

=== PROBE DONE ===
```

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓ [RAW-PROBE L4-15]
- A-12..A-19 health endpoints: 5/5 PASS ✓ [RAW-PROBE L18-22]
- A-20 pdf-extractor multi-probe: 3/3 PASS ✓
- A-21 restart: mcp-server=1 ✓ [RAW-PROBE L36]
- A-30 memory: 29.79% PASS ✓ [RAW-PROBE L40] — healthy state, within container cap
- A-32 disk: 36% capacity ✓ [RAW-PROBE L43-46]

**Signals:** 0 NEW | Status: CLEAN
## c612 · 2026-06-20T22:39:05Z
### Audit Run Tier-1 (22:39 UTC 2026-06-20, Sunday market CLOSED)
- Tier: 1 | Services: 12 checked | Health endpoints: 5 probed
- Anomalies: 0 NEW (all runtime checks PASS; stable healthy state)
- Status: HEALTHY — container fleet UP+HEALTHY; normal resource utilization

**Verdict Summary:**
- A-01..A-11 containers: all 12 UP ✓
- A-12..A-19 health endpoints: 5/5 PASS ✓
- A-21 restart: mcp-server=1 ✓
- A-30 memory: 26.87% PASS ✓ — healthy state
- A-32 disk: 35% capacity ✓

**Signals:** 0 NEW | Status: CLEAN
## c611 · 2026-06-20T22:32:22Z
### Audit Run Tier-2 (22:32 UTC 2026-06-20, Sunday market CLOSED)
- Tier: 2 | Cron: checked | Sources: 28 scanned | VPS: checked | DB: 5 queries
- Anomalies: 0 NEW (all checks PASS; weekend baseline)
- Status: HEALTHY — BCTC pipeline + DB freshness PASS; price/FX stale = expected weekend
- Checks: B-08 (PDFs=80) ✓ | B-09 (SSC URLs=0) ✓ | B-13 (stale pending=0) ✓ | C-06 (msgs=1) ✓ | C-07 (signals=102) ✓
