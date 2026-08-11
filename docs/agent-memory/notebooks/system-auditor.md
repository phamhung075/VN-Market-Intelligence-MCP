## d4-auto · 2026-08-11T03:00:01.697Z
D4 candidates: R2-mismatch:bctc-dataquality:vnindex-crosstool-mismatch,R2-mismatch:bctc-dataquality:HPG:operating-profit-zero,R2-mismatch:bctc-dataquality:DXG:persistent-absence,R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence

## d4-auto · 2026-08-10T03:00:00.961Z
D4 candidates: R2-mismatch:bctc-dataquality:vnindex-crosstool-mismatch,R2-mismatch:bctc-dataquality:HPG:operating-profit-zero,R2-mismatch:bctc-dataquality:DXG:persistent-absence,R3-no-board-row:bctc-dataquality:vnindex-crosstool-mismatch,R3-no-board-row:bctc-dataquality:HPG:operating-profit-zero,R3-no-board-row:bctc-dataquality:DXG:persistent-absence

## c19 · 2026-08-09T05:33:49Z

### Audit Run Tier-1 (05:33–05:35 UTC 2026-08-09)
- Tier: 1 | Scope: container liveness, health endpoints, restart count, memory, disk
- Status: **DEGRADED** (1 WARN finding)

#### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-09T05:33:49Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 10 hours (healthy)   vn-market-intelligence-mcp-mcp-server           10 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 18 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        18 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 21 hours (healthy)   vn-market-intelligence-mcp-rag-service          21 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=8.84% MemUsage=271.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 8.83% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 64.71% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 94.12% >= 85% investigate-gate — ENGAGE deep-probe
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "0", "restart_count_after": "0",
    "started_at_before": "2026-08-08T08:11:45.741666434Z", "started_at_after": "2026-08-08T08:11:45.741666434Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "0001-01-01T00:00:00Z", "finished_at_after": "0001-01-01T00:00:00Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1568064", "vmhwm_kb_after": "1568064",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true,
         "note": "VmHWM pinned at cgroup cap; no advancement during window"},
  "samples": [{"n":1,"t":"05:34:01Z","pct":94.13},{"n":2,"t":"05:34:16Z","pct":94.13},{"n":3,"t":"05:34:30Z","pct":94.13},{"n":4,"t":"05:34:45Z","pct":94.13},{"n":5,"t":"05:35:00Z","pct":94.13},{"n":6,"t":"05:35:16Z","pct":94.13}],
  "analysis": {"min_pct": 94.13, "max_pct": 94.13, "median_pct": 94.13, "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)"
}
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.20% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.06% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.57% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.88% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 3.46% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.88% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.41% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.03% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.14% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    15Gi    47%    393k  161M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

#### Check Results

**A-01 to A-11 — Container Status:** PASS
- All host_runtime_set services UP (13 containers, all healthy status)

**A-12 to A-20 — Health Endpoints:** PASS
- All 5 endpoints responding HTTP 200
- A-20 pdf-extractor multi-probe: 3/3 passed

**A-21 — Restart Count:** PASS
- mcp-server RestartCount=0 (no crash signals)

**A-30 — Memory Pressure:** WARN
- rag-service memory ESCALATE verdict — sustained at 94.13% (all 6 samples identical)
  - Deep-probe: 6 samples over 65s window, all at 94.13% (>93% sustained threshold)
  - State: OOMKilled=false, restarts=0, no state changes, no crashes
  - VmHWM: pinned at cgroup cap (1568 MiB at 1024 MiB limit), no advancement during window
  - Verdict: ESCALATE on "loss of reclamation" (>93% sustained, no dip-jitter veto)
  - Discriminator verdict: genuine sustained-plateau, not a transient spike or crash-cliff
  - Emission: SKIP-dedup (same dedup_key emitted within last 7 days at 2026-08-09T04:11:10Z)
  - Dashboard row: appended with signal_id=sys-20260809T053619-38ad
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30 last_sent=2026-08-09T04:11:10Z id=sys-20260809T053619-38ad
  - [emit-dashboard] OK id=sys-20260809T053619-38ad check_id=A-30

**A-32 — Disk:** PASS
- / filesystem at 47% capacity (< 85% threshold)

**A-33 — Hook Liveness:** PASS
- All 4 load-bearing hooks present, executable, registered

#### Summary
Most checks PASS. A-30 rag-service shows ESCALATE memory finding (94.13% sustained). Discriminator confirms: genuine sustained high-memory plateau (loss of reclamation), no crash evidence, no OOMKilled, VmHWM stable at cap. Known tracked issue (FU-RAG-DEPLOY-MEMORY DONE_VERIFIED; open follow-up FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH P2). Previous emission at 04:11:10Z still within 7-day dedup window, so signal correctly skipped.

#### Output
[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=1 | dedup_skipped=1 | status=DEGRADED
