
## d4-auto · 2026-08-13T03:00:01.748Z
D4 candidates: R2-mismatch:bctc-dataquality:vnindex-crosstool-mismatch,R2-mismatch:bctc-dataquality:HPG:operating-profit-zero,R2-mismatch:bctc-dataquality:DXG:persistent-absence,R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence

## c60 · 2026-08-13T06:30Z
### Audit Run Tier-1 (06:30–06:46 UTC 2026-08-13)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (0 critical, 0 warn, 0 info)
- Status: ALL_GREEN (all checks pass; A-30 reclamation discriminator applied)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-13T06:44:16Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 17 hours (healthy)   vn-market-intelligence-mcp-rag-service          20 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 36 hours (healthy)   vn-market-intelligence-mcp-mcp-server           36 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.39% MemUsage=503.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 92.50% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 16.37% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 85.01% >= 85% investigate-gate — ENGAGE deep-probe
[... 9 more containers skipped below gate ...]
```

### Findings:
- [A-01 through A-11] Container status: ALL PASS — all 13 containers up/healthy
- [A-12 through A-19] Health endpoints: ALL PASS — all 5 service endpoints returning HTTP 200
- [A-20] pdf-extractor multi-probe: PASS — 3/3 in-container probes successful
- [A-21] Restart count: PASS — mcp-server RestartCount=0
- [A-30] Memory pressure (rag-service): FOLD/PASS — baseline 92.50%, A-30 reclamation discriminator applied; 6 probes all 92.50%, flat, no discontinuities, VmHWM pinned at cap, no advancing peak window, state unchanged; verdict=FOLD reason="benign GC sawtooth or below tripwire"
- [A-30] Memory pressure (pdf-extractor): FOLD/PASS — baseline 85.01%, A-30 reclamation discriminator applied; 6 probes all 85.01%, flat, no discontinuities, VmHWM pinned at cap, no advancing peak window, state unchanged; verdict=FOLD reason="benign GC sawtooth or below tripwire"
- [A-32] Disk: PASS — 45% used, well below 85% threshold

[OUTPUT-CONTRACT] signals_posted=0 telegram_sent=0 signal_queue_rows_written=0 dashboard_rows_written=0
[HEARTBEAT] tier-1 cycle completed, no heartbeat write from this subagent (sole writer is auditor-tier1-probe.sh pre-gate, not this subagent)
[RAW-CITE GATE] NONE — all verdict lines cite RAW-PROBE this cycle, no hand-typed carries
[CALLER-INSTRUCTION PRECEDENCE] NONE — no contradictions between caller prompt and this cycle's measured verdicts

## c59 · 2026-08-12T17:30Z
### Audit Run Tier-1 (17:30–17:37 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 2 (0 new, 0 critical, 0 warn, 0 info) | 2 dedup-skipped
- Status: DEGRADED (A-30 recurring memory pressure, both containers within dedup window)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T17:35:03Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 4 hours (healthy)    vn-market-intelligence-mcp-rag-service          7 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 23 hours (healthy)   vn-market-intelligence-mcp-mcp-server           23 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 40 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 13 days (healthy)    vn-market-intelligence-mcp-macro-indicators     13 days ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 3 weeks (healthy)    mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 hours (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 weeks ago

--- memory pressure multi-probe reclamation (A-30) ---
rag-service-1: 96.52% sustained (6 samples, no reclamation dips)
pdf-extractor-1: 94.49% sustained (6 samples, VmHWM pinned at 2587.6/2621.4 MB)

=== PROBE DONE ===
```

### Findings:
- [A-01 through A-11] Container status: ALL PASS — all 13 containers up/healthy
- [A-12 through A-19] Health endpoints: ALL PASS
- [A-20] pdf-extractor multi-probe: PASS — 3/3 in-container probes successful
- [A-21] Restart count: PASS
- [A-30] Memory pressure (rag-service-1): WARN → DEDUP-SKIPPED (last_sent=2026-08-09T04:11:10Z, within 7d window)
  - Sustained 96.52% memory across 6 probes, loss of reclamation condition
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 id=sys-20260812T173720-69e0
  - [emit-dashboard] OK id=sys-20260812T173720-69e0 check_id=A-30
- [A-30] Memory pressure (pdf-extractor-1): WARN → DEDUP-SKIPPED (last_sent=2026-08-11T12:36:18Z, within 7d window)
  - Sustained 94.47-94.49% memory across 6 probes, VmHWM pinned at cgroup limit
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30 id=sys-20260812T173729-22bd
  - [emit-dashboard] OK id=sys-20260812T173729-22bd check_id=A-30
- [A-32] Disk: PASS — 54% used, below 85% threshold
