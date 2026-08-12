
## c58 · 2026-08-12T17:00Z
### Audit Run Tier-1 (17:00–17:05 UTC 2026-08-12)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 new (0 critical, 0 warn, 0 info) | 1 dedup-skipped
- Status: ALL_GREEN (PASS on all checks; pdf-extractor A-30 WARN persists within dedup window)

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-12T17:03:16Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-rag-service-1          Up 3 hours (healthy)    vn-market-intelligence-mcp-rag-service          6 hours ago
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

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=13.63% MemUsage=418.8MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-rag-service-1 baseline 27.76% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 13.63% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-pdf-extractor-1: baseline 94.97% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.51% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 2.66% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.87% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 3.01% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 5.06% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 10.17% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.42% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.33% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.23% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-pdf-extractor-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "1", "restart_count_after": "1",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "2587640", "vmhwm_kb_after": "2587640",
         "mem_limit_kb": "2621440",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"17:03:28Z","pct":94.97},{"n":2,"t":"17:03:42Z","pct":94.97},{"n":3,"t":"17:03:58Z","pct":94.97},{"n":4,"t":"17:04:12Z","pct":94.97},{"n":5,"t":"17:04:27Z","pct":94.97},{"n":6,"t":"17:04:42Z","pct":94.91}],
  "analysis": {"min_pct": 94.91, "max_pct": 94.97, "median_pct": 94.97,
               "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    11Gi    55%    393k  120M    0%   /

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
- [A-20] pdf-extractor multi-probe: PASS — 3/3 in-container probes successful
- [A-21] Restart count: PASS — mcp-server RestartCount=0
- [A-30] Memory pressure (rag-service): PASS — baseline 27.76%, below investigate-gate
- [A-30] Memory pressure (pdf-extractor): WARN → DEDUP-SKIPPED — baseline 94.97%, verdict ESCALATE (sustained >93%); no state changes, VmHWM pinned at limit
  - [emit-signal] SKIP-dedup dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30 last_sent=2026-08-11T12:36:18Z id=sys-20260812T170518-5265
  - [emit-dashboard] OK id=sys-20260812T170518-5265 check_id=A-30
- [A-32] Disk: PASS — 55% used, well below 85% threshold
