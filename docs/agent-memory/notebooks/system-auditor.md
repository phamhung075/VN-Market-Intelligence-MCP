## c15 · 2026-08-09T03:33:27Z

### Audit Run Tier-1 (03:30–03:34 UTC 2026-08-09)
- Tier: 1 | Scope: container liveness, health endpoints, restart count, memory, disk
- Status: **DEGRADED** (1 CRITICAL finding)

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-09T03:33:27Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 8 hours (healthy)    vn-market-intelligence-mcp-mcp-server           8 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 16 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        16 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-rag-service          19 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 2 days (healthy)     vn-market-intelligence-mcp-stock-price          2 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 10 days (healthy)    vn-market-intelligence-mcp-macro-indicators     10 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=8.03% MemUsage=246.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 8.03% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 64.71% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 95.41% >= 85% investigate-gate — ENGAGE deep-probe
[A-30 analysis] verdict=ESCALATE reason=all samples >93% sustained high

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    44%    393k  181M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

#### Check Results

**A-01 to A-11 — Container Status:** PASS
- All host_runtime_set services UP and healthy (13 containers)

**A-12 to A-20 — Health Endpoints:** PASS
- mcp-server:3000 → 200 OK
- api-gateway:4000 → 200 OK
- macro-indicators:5004 → 200 OK
- pdf-extractor:5001 → 200 OK
- frontend:3001 → 200 OK
- A-20 pdf-extractor multi-probe: 3/3 passed

**A-21 — Restart Count:** PASS
- mcp-server RestartCount=0 (no crash signals)

**A-30 — Memory Pressure:** CRITICAL
- rag-service memory ESCALATE verdict — sustained at 95.41% (min=95.42%, max=95.42%, median=95.42%)
  - Deep-probe: all 6 samples >93% sustained (loss of reclamation)
  - State: OOMKilled=false, restarts=0, no state_changed, VmHWM pinned at cap
  - **Escalation crossed:** >93% sustained threshold → CRITICAL
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:rag-service:A-30 id=sys-20260809T033559-177a
  - [emit-dashboard] OK id=sys-20260809T033559-177a check_id=A-30

**A-32 — Disk:** PASS
- / filesystem at 44% capacity (< 85%)

#### Summary
Most checks PASS. A-30 rag-service shows ESCALATE memory (95.41%, all samples >93% sustained). Known finding (dedup skip from 2026-08-06), tracked via FU-RAG-DEPLOY-MEMORY.

#### Output
[OUTPUT-CONTRACT] signals_posted=0 telegram_sent=0 signal_queue_rows_written=1 dashboard_rows=1 status=DEGRADED

CONTRACT-CONTRADICTION: NONE

## d4-auto · 2026-08-09T03:00:01.831Z
D4 candidates: R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence
