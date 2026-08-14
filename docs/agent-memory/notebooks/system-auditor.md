# System Auditor — Tier-1 Notebook


## c95 · 2026-08-14T06:44:24Z

### Audit Run Tier-1 (06:44–06:46 UTC 2026-08-14, A-30 continuation — pattern c90→c93→c95)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- **Anomalies: NONE — A-30 rag-service FOLD (median 91.72%, benign GC)**
- Dedup-skipped: 0 | Signals posted: 0 | Status: HEALTHY

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T06:44:24Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 11 hours (healthy)   vn-market-intelligence-mcp-mcp-server           11 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 15 hours (healthy)   vn-market-intelligence-mcp-news-fetch           15 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 18 hours (healthy)   vn-market-intelligence-mcp-api-gateway          18 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 19 hours (healthy)   vn-market-intelligence-mcp-alert-engine         19 hours ago
vn-market-intelligence-mcp-rag-service-1          Up 21 hours (healthy)   vn-market-intelligence-mcp-rag-service          44 hours ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 16 hours (healthy)   vn-market-intelligence-mcp-pdf-extractor        5 days ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=15.51% MemUsage=476.5MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 15.51% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.21% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.55% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.39% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 91.09% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 36.20% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.73% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.22% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.16% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.87% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.33% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 2.97% < 85% investigate-gate
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
  "samples": [{"n":1,"t":"06:44:39Z","pct":91.59},{"n":2,"t":"06:44:55Z","pct":91.84},{"n":3,"t":"06:45:10Z","pct":91.84},{"n":4,"t":"06:45:25Z","pct":91.24},{"n":5,"t":"06:45:40Z","pct":91.24},{"n":6,"t":"06:45:55Z","pct":91.24}],
  "analysis": {"min_pct": 91.24, "max_pct": 91.84, "median_pct": 91.72, "reclamation_dips": 1, "discontinuities": 0},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    24Gi    36%    393k  251M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### A-30 Analysis
**Deep-probe on rag-service (baseline 91.09% > 85% gate):**
- Samples: 91.59%, 91.84%, 91.84%, 91.24%, 91.24%, 91.24% (span 65s)
- Median: 91.72% | Min: 91.24% | Max: 91.84% | Dips: 1 benign GC dip (91.84→91.24)
- Discontinuities: 0 (no crash cliff)
- State: No OOMKilled, no restart, no state change during window
- VmHWM: Pinned at cap (1502752KB vs 1048576KB limit), NOT advancing during window
- **Verdict: FOLD** (benign GC sawtooth, all tripwires clear per tier1-probe.md clause 4)

**Pattern context (c90→c93→c95):**
- c90 (2026-08-11): 98.15% → ESCALATE (emit CRITICAL)
- c91 (2026-08-11T21:31): 88.78% → FOLD (dedup-SKIP, within 7d window)
- c92 (2026-08-12T00:00): 92.67-93.64% → FOLD (dedup-SKIP)
- c93 (2026-08-14T06:16): 97.59% → ESCALATE (emit WARN, same container, 2nd escalation)
- c95 (2026-08-14T06:44): 91.09% → FOLD (no emit, benign oscillation)

**Conclusion:** This oscillating pattern (sustained 91-98% with intermittent peaks, no crashes) reflects real memory pressure that recovers via GC. Each cycle's independent verdict is correct. The A-30 discriminator properly gates escalation on tripwires (crash signatures, state changes, sustained peaks >93%+), not on baseline thresholds alone. A prior WARN from c93 already alerted via BUG + DASHBOARD; this cycle's FOLD is not a false negative.

## c94 · 2026-08-14T06:41:00Z

### Audit Run Tier-2 (06:40–06:41 UTC 2026-08-14, Cron gaps + VPS cross-plane)
- Tier: 2 | Services: 0 checked | Sources: 5 checked | DB checks: 2
- **Anomalies: 3 A-29 STALE/MISSED (cron gaps), 1 B-06 WARN (VPS cross-plane)**
- Dedup-skipped: 0 | Signals posted: 4 | Status: DEGRADED

### A-29 Cron Fire Check:
```
Layer A: 89 total, 77 ON_TIME, 2 STALE, 1 MISSED, 9 UNRESOLVED-JOIN
- MISSED: monthlySignalQualityAudit (last: 2026-06-01, overdue 1782.7h, threshold 1080h)
- STALE: brokerSanctionsSweep (last: 2026-07-31 08:00, overdue 334.7h, threshold 36h)
- STALE: ragFtsRebuildCron (last: 2026-07-20 20:15, overdue 586.4h, threshold 36h)
- UNRESOLVED-JOIN: marketOpen, marketClose, dataAuditDaily, summaryWeekly, summaryMonthly, summaryQuarterly, summaryYearly, foreignFlowFetch, publicContractsRefresh (9 names)
```

### B-06/B-07 VPS Route Health:
Cross-plane disagreement for bctc routes (bctc-discover, bctc-push):
- Proxy plane (get_vps_proxy_health): "ok" status
- Service plane (get_vps_service_health): vn-bctc-fetch "unhealthy"
- Verdict: WARN (single-plane disagreement requires corroboration)

### Data Freshness (B-01..B-07, B-11, B-12):
All sources within SLA: price(0min/10min), bctc(953min/10080min), news(12min/30min), sbv_fx(11min/30min), foreign_flow(0min/10min) — PASS

### DB Spot Checks (C-06, C-07):
Pipeline health OK: 33 tickers with TA ready, aggregator last run 2026-08-06, backfill complete — PASS
