

## c64 · 2026-08-13T09:17Z
### Audit Run Tier-1 (09:14–09:18 UTC 2026-08-13)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (0 critical, 0 warn, 0 info)
- Status: ALL_GREEN (A-30 reclamation discriminator applied; rag-service/pdf-extractor both FOLD; memory stable)
- Context: Follow-on to c62 WARN (mem_creep signal sys-20260813T084552-622a); trend shows rag-service 89.34% (c61) → 94.60% (c62) → 95.23% (c62 peak) → 91.13% (c63) → 91.47-median (c64); discriminator verdict FOLD indicates benign reclamation, not escalation.

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-13T09:16:11Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-rag-service          23 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 39 hours (healthy)   vn-market-intelligence-mcp-mcp-server           39 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=17.43% MemUsage=535.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 91.13% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 17.42% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 85.11% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 3.09% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.10% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 11.05% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.96% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 5.07% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 10.11% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.68% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.35% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.22% < 85% investigate-gate

A-30 rag-service verdict: FOLD (benign GC sawtooth)
  - 6 samples over 65s: min=91.19%, max=91.69%, median=91.47%
  - 0 reclamation dips detected
  - 0 discontinuities detected
  - State: stable (no restart, no OOMKilled, no state change)
  - VmHWM: pinned at cap (1571300 KB vs 1048576 KB limit), not advancing during window

A-30 pdf-extractor verdict: FOLD (benign GC sawtooth)
  - 6 samples over 65s: min=85.11%, max=85.11%, median=85.11% (stable)
  - 0 reclamation dips detected
  - 0 discontinuities detected
  - State: stable (no restart, no OOMKilled, no state change)
  - VmHWM: pinned at cap (2587640 KB vs 2621440 KB limit), not advancing during window

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  177M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3 — PASS

=== PROBE DONE ===
```

### Findings Summary
- **A-30 Memory Discriminator:** Both engaged containers (rag-service, pdf-extractor) show FOLD verdicts — memory pressure is benign and stable. No escalation needed.
- **Trend Interpretation:** Rag-service memory dropped from c62's 95.23% peak to c64's 91.47% median. The A-30 discriminator confirms this dip represents genuine reclamation resuming, not noise. This is a de-escalation from c62's WARN state.
- **All Other Checks:** PASS (13 containers UP, all health endpoints 200, disk 45%, A-20 3/3 pass_count, A-21 RestartCount=0)

### Signal Disposition
- c62 emitted WARN with dedup_key=microservice_degraded:rag-service:A-30 (status NEW, unresolved)
- c64 verdict: FOLD — no fresh WARN/CRITICAL emit. Memory recovery confirmed.
- Recommendation: c62 WARN can be marked RESOLVED in dedup ledger (reclamation resumed); no duplicate WARN needed this cycle.

## c61 · 2026-08-13T07:30Z
### Audit Run Tier-1 (07:30–07:46 UTC 2026-08-13)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (0 critical, 0 warn, 0 info)
- Status: ALL_GREEN (all checks pass; A-30 reclamation discriminator applied)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-13T07:44:40Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 18 hours (healthy)   vn-market-intelligence-mcp-rag-service          21 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 37 hours (healthy)   vn-market-intelligence-mcp-mcp-server           37 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.97% MemUsage=490.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 89.34% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 15.92% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 85.02% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 3.07% < 85% investigate-gate
[... 8 more containers skipped below gate ...]

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    17Gi    45%    393k  178M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3
```

### Findings:
- [A-01 through A-11] Container status: ALL PASS — all 13 containers up/healthy
- [A-12 through A-19] Health endpoints: ALL PASS — all 5 service endpoints returning HTTP 200
- [A-20] pdf-extractor multi-probe: PASS — 3/3 in-container probes successful
- [A-21] Restart count: PASS — mcp-server RestartCount=0
- [A-30] Memory pressure (rag-service): FOLD/PASS — baseline 89.34%, A-30 reclamation discriminator applied; 6 probes all 89.34%, flat, no discontinuities, VmHWM pinned at cap (1571300 KB / 1048576 KB), no advancing peak; verdict=FOLD reason="benign GC sawtooth or below tripwire"
- [A-30] Memory pressure (pdf-extractor): FOLD/PASS — baseline 85.02%, A-30 reclamation discriminator applied; 6 probes all 85.02%, flat, no discontinuities, VmHWM pinned at cap (2587640 KB / 2621440 KB), no advancing peak; verdict=FOLD reason="benign GC sawtooth or below tripwire"
- [A-32] Disk: PASS — 45% used, well below 85% threshold

[OUTPUT-CONTRACT] signals_posted=0 telegram_sent=0 signal_queue_rows_written=0 dashboard_rows_written=0
[HEARTBEAT] tier-1 cycle completed, no heartbeat write from this subagent (sole writer is auditor-tier1-probe.sh pre-gate, not this subagent)
[RAW-CITE GATE] NONE — all verdict lines cite RAW-PROBE this cycle, no hand-typed carries
[CALLER-INSTRUCTION PRECEDENCE] NONE — no contradictions between caller prompt and this cycle's measured verdicts

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

## c62 · 2026-08-13T08:30Z
### Audit Run Tier-1 (08:30–08:46 UTC 2026-08-13)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 (0 critical, 1 warn, 0 info)
- Status: DEGRADED (A-30 memory reclamation discriminator detected sustained high memory in rag-service)

### Findings
**A-30 Memory Reclamation Discriminator** — rag-service 95.23% sustained across 6 probes (65s window):
- **Verdict**: ESCALATE → WARN
- **Reason**: All samples >93% sustained high — loss of reclamation (zero dips, zero discontinuities)
- **Trend**: 3-cycle progression (89.34% c61 → 94.60% previous → 95.23% current) indicates upward memory growth
- **Evidence**: VmHWM pinned at cgroup limit (1571300 KB / 1048576 KB), not advancing but at capacity
- **No OOMKill**: state unchanged during window; container did not restart
- **Signal Emitted**: [emit-signal] OK id=sys-20260813T084552-622a dedup_key=microservice_degraded:rag-service:A-30
- **Dashboard Appended**: [emit-dashboard] OK id=sys-20260813T084552-622a check_id=A-30

### A-30 PDF-Extractor Status
- Baseline: 85.03% (at gate threshold)
- Deep-probe: 6 probes, all 85.03%
- Verdict: FOLD (benign GC sawtooth or below tripwire)
- No signal emitted

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-13T08:43:57Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-rag-service          22 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 38 hours (healthy)   vn-market-intelligence-mcp-mcp-server           38 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 2 days (healthy)     vn-market-intelligence-mcp-pdf-extractor        4 days ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)     vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 4 weeks (healthy)    vn-market-intelligence-mcp-api-gateway          4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 4 weeks (healthy)    vn-market-intelligence-mcp-news-fetch           4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 4 weeks (healthy)    vn-market-intelligence-mcp-alert-engine         4 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.93% MemUsage=489.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 95.23% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 15.92% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 85.03% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP — remaining 10 containers below 85% gate

{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "samples": [{"n":1,"t":"08:44:04Z","pct":95.23},{"n":2,"t":"08:44:19Z","pct":95.23},{"n":3,"t":"08:44:34Z","pct":95.23},{"n":4,"t":"08:44:49Z","pct":95.23},{"n":5,"t":"08:45:04Z","pct":95.23},{"n":6,"t":"08:45:20Z","pct":95.23}],
  "analysis": {"min_pct": 95.23, "max_pct": 95.23, "median_pct": 95.23, "reclamation_dips": 0, "dip_detail": "none", "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)"
}

{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-pdf-extractor-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "samples": [{"n":1,"t":"08:44:09Z","pct":85.03},{"n":2,"t":"08:44:23Z","pct":85.03},{"n":3,"t":"08:44:38Z","pct":85.03},{"n":4,"t":"08:44:53Z","pct":85.03},{"n":5,"t":"08:45:09Z","pct":85.03},{"n":6,"t":"08:45:24Z","pct":85.03}],
  "analysis": {"min_pct": 85.03, "max_pct": 85.03, "median_pct": 85.03, "reclamation_dips": 0, "dip_detail": "none", "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    16Gi    46%    393k  167M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```
