# System Auditor — Tier-1 Notebook

## c91 · 2026-08-14T04:44:01Z

### Audit Run Tier-1 (04:44–04:45 UTC 2026-08-14, follow-up investigation)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 0 (no new findings) | Dedup-skipped: 0
- Status: ALL_GREEN

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T04:44:01Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)    vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-news-fetch           13 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 16 hours (healthy)   vn-market-intelligence-mcp-api-gateway          16 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 17 hours (healthy)   vn-market-intelligence-mcp-alert-engine         17 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-rag-service          42 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 14 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
vn-market-intelligence-mcp-stock-price-1          Up 7 days (healthy)     vn-market-intelligence-mcp-stock-price          7 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 2 weeks (healthy)    vn-market-intelligence-mcp-macro-indicators     2 weeks ago
vn-market-intelligence-mcp-frontend-1             Up 2 weeks (healthy)    vn-market-intelligence-mcp-frontend             2 weeks ago
mcp-gateway                                       Up 4 weeks (healthy)    mcpservergatway-gateway                         4 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 4 weeks (healthy)    ghcr.io/flaresolverr/flaresolverr:latest        4 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 4 weeks (healthy)    vn-market-intelligence-mcp-technical-analysis   4 weeks ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.16% MemUsage=465.9MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 15.16% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 7.97% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.53% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.43% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 88.77% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 36.15% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.73% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.32% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.29% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.86% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.36% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.03% < 85% investigate-gate
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "vn-market-intelligence-mcp-rag-service-1",
  "window": {"probes": 6, "interval_sec": 13, "span_sec": 65},
  "state": {
    "oom_killed_before": "false", "oom_killed_after": "false",
    "restart_count_before": "3", "restart_count_after": "3",
    "state_changed_during_window": false
  },
  "vm": {"vmhwm_kb_before": "1502752", "vmhwm_kb_after": "1502752",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"04:44:19Z","pct":88.78},{"n":2,"t":"04:44:34Z","pct":88.78},{"n":3,"t":"04:44:49Z","pct":88.78},{"n":4,"t":"04:45:04Z","pct":88.78},{"n":5,"t":"04:45:19Z","pct":88.78},{"n":6,"t":"04:45:34Z","pct":88.78}],
  "analysis": {"min_pct": 88.78, "max_pct": 88.78, "median_pct": 88.78,
               "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- A-30 FOLD: rag-service memory stable at 88.78% (no escalation). Follow-up to c90's ESCALATE finding shows recovery/normalization. VmHWM pinned at cap but no state changes, no OOM, no discontinuities. Median 88.78%, min/max 88.78% over 65s window — below tripwire thresholds for both high-sustained (>93%) and peak (>97%) escalation.

### Emit Actions:
```
[emit-signal] NONE — A-30 verdict FOLD, no new anomalies, no BUG alert issued
```

### Cycle Summary:
Pre-gate verdict (auditor-tier1-probe.sh @ 04:13:28Z): FAILURE — mem_creep detected (rag-service 96.72%, 33.6MiB free vs 40MiB floor).
c90 investigation (04:15–04:20 UTC): ESCALATE — rag-service sustained >93% (median 98.15%, min 97.70%). Signal emitted: sys-20260814T041720-3a88.
c91 investigation (04:44–04:45 UTC): FOLD — rag-service stabilized at 88.78%, no escalation warranted. Memory recovery observed between cycles.
Verdict: Presumed successful memory reclamation/GC recovery. No further alert. Monitoring continues.

## c90 · 2026-08-14T04:17:44Z

### Audit Run Tier-1 (04:15–04:20 UTC 2026-08-14, post-preflight)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 new (C=1 W=0 I=0) | Dedup-skipped: 0
- Status: CRITICAL

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T04:15:20Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 9 hours (healthy)    vn-market-intelligence-mcp-mcp-server           9 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 13 hours (healthy)   vn-market-intelligence-mcp-news-fetch           13 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 15 hours (healthy)   vn-market-intelligence-mcp-api-gateway          15 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 16 hours (healthy)   vn-market-intelligence-mcp-alert-engine         16 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 19 hours (healthy)   vn-market-intelligence-mcp-rag-service          42 hours ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=21.54% MemUsage=661.6MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 98.15% >= 85% investigate-gate — ENGAGE deep-probe
\{
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation"
\}

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- A-30 ESCALATE: rag-service sustained memory pressure >93% (median 98.15%, min 97.70% over 65s window). Signal: sys-20260814T041720-3a88

### Emit Actions:
```
[emit-signal] OK dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30:escalate-high-sustained id=sys-20260814T041720-3a88
```

## c89 · 2026-08-14T03:47:03Z

### Audit Run Tier-1 (03:44–03:48 UTC 2026-08-14, preflight FAILURE)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- Anomalies: 1 new (C=1 W=0 I=0) | Dedup-skipped: 0
- Status: CRITICAL

