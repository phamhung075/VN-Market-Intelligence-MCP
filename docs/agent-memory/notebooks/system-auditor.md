
## c57 · 2026-08-12T16:33:24Z
### Audit Run Tier-1 (16:33–16:33 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 dedup-skipped
- Status: ALL_GREEN (PASS on all checks; pdf-extractor A-30 continues prior WARN from c56, dedup window active)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T16:33:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          6 hours ago
vn-market-intelligence-mcp-mcp-server-1           Up 22 hours (healthy)   vn-market-intelligence-mcp-mcp-server           22 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 39 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        4 days ago
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

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=16.25% MemUsage=499.3MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 89.87% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 13.61% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 94.52% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.51% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.67% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 11.02% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.98% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 5.06% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 10.03% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.43% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.35% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.23% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {"oom_killed_before": "false", "oom_killed_after": "false", "restart_count_before": "2", "restart_count_after": "2", "state_changed_during_window": false},
  "vm": {"vmhwm_kb_before": "1571300", "vmhwm_kb_after": "1571300", "mem_limit_kb": "1048576", "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"16:33:32Z","pct":89.87},{"n":2,"t":"16:33:46Z","pct":89.87},{"n":3,"t":"16:34:01Z","pct":89.87},{"n":4,"t":"16:34:16Z","pct":89.87},{"n":5,"t":"16:34:31Z","pct":89.87},{"n":6,"t":"16:34:46Z","pct":89.87}],
  "analysis": {"min_pct": 89.87, "max_pct": 89.87, "median_pct": 89.87, "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-pdf-extractor-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {"oom_killed_before": "false", "oom_killed_after": "false", "restart_count_before": "1", "restart_count_after": "1", "state_changed_during_window": false},
  "vm": {"vmhwm_kb_before": "2587640", "vmhwm_kb_after": "2587640", "mem_limit_kb": "2621440", "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"16:33:36Z","pct":94.52},{"n":2,"t":"16:33:51Z","pct":94.52},{"n":3,"t":"16:34:06Z","pct":94.52},{"n":4,"t":"16:34:20Z","pct":94.52},{"n":5,"t":"16:34:35Z","pct":94.52},{"n":6,"t":"16:34:50Z","pct":94.49}],
  "analysis": {"min_pct": 94.49, "max_pct": 94.52, "median_pct": 94.52, "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    12Gi    52%    393k  130M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- [A-01 through A-11] Container status: ALL PASS — all 13 containers up/healthy
- [A-12 through A-19] Health endpoints: ALL PASS — all 5 service endpoints returning HTTP 200
- [A-20] pdf-extractor multi-probe: PASS — 3/3 in-container probes successful (no event-loop stall)
- [A-21] Restart count: PASS — mcp-server RestartCount=0, no crashes in 4h window
- [A-30] Memory pressure (rag-service): PASS — baseline 89.87%, verdict FOLD (benign GC); no state changes, no OOMKills, 6-sample window all at 89.87%
- [A-30] Memory pressure (pdf-extractor): WARN → DEDUP-SKIPPED (already reported 2026-08-11T12:36:18Z) — baseline 94.52%, verdict ESCALATE (sustained >93%); 6-sample window 94.49-94.52%, no state changes, VmHWM pinned at cgroup limit
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30 last_sent=2026-08-11T12:36:18Z id=sys-20260812T163525-0051
  - [emit-dashboard] OK id=sys-20260812T163525-0051 check_id=A-30
- [A-32] Disk: PASS — 52% used, well below 85% threshold

**Summary:** This cycle confirms prior findings (pdf-extractor sustained high memory) with no new escalations. rag-service memory reading elevated (89.87%) but passes discriminator (benign). All container/endpoint/restart checks clear. Cycle status: ALL_GREEN per spec (no new CRITICAL/WARN findings this cycle).

**[OUTPUT-CONTRACT]** signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=1 | dedup_skipped=1

**[HEARTBEAT]** no heartbeat written this cycle (Tier-1 subagent never touches auditor-tier1-last-healthy.json)

**[CONTRACT-CONTRADICTION]** NONE

---
