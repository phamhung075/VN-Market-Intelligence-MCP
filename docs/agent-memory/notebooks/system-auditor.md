# System Auditor — Tier-1 Notebook


## c96 · 2026-08-14T07:46:15Z

### Audit Run Tier-1 (07:46 UTC 2026-08-14, A-30 continuation — rag-service stable post-fix)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- **Anomalies: NONE — A-30 rag-service FOLD (median 90.90%, benign GC stability)**
- Dedup-skipped: 0 | Signals posted: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T07:46:15Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 12 hours (healthy)   vn-market-intelligence-mcp-mcp-server           12 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 16 hours (healthy)   vn-market-intelligence-mcp-news-fetch           16 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-api-gateway          19 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 20 hours (healthy)   vn-market-intelligence-mcp-alert-engine         20 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 22 hours (healthy)   vn-market-intelligence-mcp-rag-service          45 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 17 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 4 weeks (healthy)    vn-market-intelligence-mcp-kinh-dich-service    4 days ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=10.07% MemUsage=309.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 9.64% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.35% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.59% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.39% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 90.98% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 36.23% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.73% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.22% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 8.78% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.95% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.43% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.98% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "3", "restart_count_after": "3",
    "started_at_before": "2026-08-13T09:20:09.721086103Z", "started_at_after": "2026-08-13T09:20:09.721086103Z",
    "exit_code_before": "0", "exit_code_after": "0",
    "finished_at_before": "2026-08-13T09:20:08.744906538Z", "finished_at_after": "2026-08-13T09:20:08.744906538Z",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1502752", "vmhwm_kb_after": "1502752",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"07:46:30Z","pct":90.98},{"n":2,"t":"07:46:46Z","pct":90.90},{"n":3,"t":"07:47:00Z","pct":90.90},{"n":4,"t":"07:47:15Z","pct":90.90},{"n":5,"t":"07:47:30Z","pct":90.90},{"n":6,"t":"07:47:45Z","pct":90.90}],
  "analysis": {"min_pct": 90.90, "max_pct": 90.98, "median_pct": 90.90,
               "reclamation_dips": 0, "dip_detail": "none",
               "discontinuities": 0, "discontinuity_detail": "none"},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    23Gi    37%    393k  241M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### A-30 Analysis
**Deep-probe on rag-service (baseline 90.98% > 85% gate):**
- Samples: 90.98%, 90.90%, 90.90%, 90.90%, 90.90%, 90.90% (span 65s)
- Median: 90.90% | Min: 90.90% | Max: 90.98% | Dips: 0 (no reclamation dip)
- Discontinuities: 0 (no crash cliff)
- State: No OOMKilled, no restart, no state change during window (container started 2026-08-13T09:20:09Z, ~22h uptime)
- VmHWM: Pinned at cap (1502752KB vs 1048576KB limit), NOT advancing during window
- **Verdict: FOLD** (benign GC stability, zero tripwire signals per tier1-probe.md clause 4)

**Continuation (c95→c96):**
cron-detect-loop Job 2 mem_creep trigger from 2026-08-14T07:14:40Z re-evaluated: rag-service discriminator confirms FOLD (benign). Both c95 and c96 show consistent stable memory profile. Fix commit 82216e291 (skip redundant vector-index rebuild, deployed ~2026-08-12T07:15Z) remains stable at 22h uptime with zero OOM kills. Durability window proceeding normally.
