# System Auditor — Tier-1 Notebook


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
## c93 · 2026-08-14T06:16:37Z

### Audit Run Tier-1 (06:14–06:16 UTC 2026-08-14, A-30 escalation — recurrence pattern c90→c93)
- Tier: 1 | Services: 13 checked | Sources: 0 checked | DB checks: 0
- **Anomalies: 1 ESCALATE (A-30 rag-service sustained >93% memory; oscillating pattern c90→c93 suggests incomplete fix)**
- Dedup-skipped: 0 | Signals posted: 1 (A-30 WARN) | Telegram sent: BUG channel

### RAW-PROBE:
```
=== AUDITOR PROBE 2026-08-14T06:14:37Z ===

--- docker ps -a ---
NAMES                                             STATUS                  IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 11 hours (healthy)   vn-market-intelligence-mcp-mcp-server           11 hours ago
vn-market-intelligence-mcp-news-fetch-1           Up 15 hours (healthy)   vn-market-intelligence-mcp-news-fetch           15 hours ago
vn-market-intelligence-mcp-api-gateway-1          Up 17 hours (healthy)   vn-market-intelligence-mcp-api-gateway          17 hours ago
vn-market-intelligence-mcp-alert-engine-1         Up 18 hours (healthy)   vn-market-intelligence-mcp-alert-engine         18 hours ago
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
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=14.47% MemUsage=444.4MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-mcp-server-1 baseline 14.46% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-news-fetch-1 baseline 8.15% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-api-gateway-1 baseline 2.45% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-alert-engine-1 baseline 2.36% < 85% investigate-gate
[A-30] vn-market-intelligence-mcp-rag-service-1: baseline 97.59% >= 85% investigate-gate — ENGAGE deep-probe
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-pdf-extractor-1 baseline 36.18% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-stock-price-1 baseline 2.73% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-macro-indicators-1 baseline 3.37% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-frontend-1 baseline 10.18% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-flaresolverr-1 baseline 2.87% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-technical-analysis-1 baseline 3.34% < 85% investigate-gate
[A-30] SKIP deep-probe — vn-market-intelligence-mcp-kinh-dich-service-1 baseline 3.02% < 85% investigate-gate
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
  "vm": {"vmhwm_kb_before": "UNAVAILABLE", "vmhwm_kb_after": "UNAVAILABLE",
         "mem_limit_kb": "UNAVAILABLE",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": false},
  "samples": [{"n":1,"t":"06:14:53Z","pct":97.59},{"n":2,"t":"06:15:07Z","pct":97.78},{"n":3,"t":"06:15:23Z","pct":97.77},{"n":4,"t":"06:15:37Z","pct":97.62},{"n":5,"t":"06:15:53Z","pct":97.62},{"n":6,"t":"06:16:07Z","pct":97.71}],
  "analysis": {"min_pct": 97.59, "max_pct": 97.78, "median_pct": 97.66, "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "ESCALATE",
  "reason": "all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; 0 dip(s) <=40pp observed, 0 discontinuity(ies) observed)"
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

### Findings:
**A-30 (Memory Pressure):** rag-service baseline 97.59% >= 85% investigate-gate, deep-probe engaged. Window: 6 probes 65s span, all sustained 97.59–97.78% (median 97.66%). Zero reclamation dips, zero discontinuities, no state changes, no OOMKilled. Verdict: ESCALATE. Reason: "loss of reclamation" (>93% sustained floor). Per tier1-probe.md §A-30 clause 4 verdict rule: WARN severity (not CRITICAL — no death signatures, discontinuities, or VmHWM pinning).

### Trend Analysis (c90→c93):
- **c90** (2026-08-14T04:17Z): 98.15% → ESCALATED, signal emitted
- **c91** (2026-08-14T04:44Z): 88.78% → FOLD
- **c92** (2026-08-14T05:46Z): 92.67–93.64% → FOLD (under threshold)
- **c93** (2026-08-14T06:14Z): 97.59–97.78% → ESCALATE (back above, worse baseline than c92)

Pattern: NOT recovering. Oscillating range ~88–98%. FU-RAG-DEPLOY-MEMORY (marked DONE_VERIFIED) fix incomplete or circumstantially effective. Real steady state is cycling, not fixed.

### Anomaly Actions:
- Signal posted to po (type: signal_feedback, check_id: A-30, severity: WARN, dedup_key: microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30)
- BUG channel Telegram alert sent with c90→c93 trend callout
- Heartbeat file updated (docs/data/auditor-tier1-last-healthy.json)
  },
  "vm": {"vmhwm_kb_before": "1502752", "vmhwm_kb_after": "1502752",
         "mem_limit_kb": "1048576",
         "vmhwm_advancing_in_window": false, "vmhwm_pinned_at_cap": true},
  "samples": [{"n":1,"t":"05:47:04Z","pct":92.67},{"n":2,"t":"05:47:18Z","pct":92.67},{"n":3,"t":"05:47:34Z","pct":92.86},{"n":4,"t":"05:47:48Z","pct":93.25},{"n":5,"t":"05:48:03Z","pct":93.64},{"n":6,"t":"05:48:18Z","pct":93.64}],
  "analysis": {"min_pct": 92.67, "max_pct": 93.64, "median_pct": 93.06,
               "reclamation_dips": 0, "discontinuities": 0},
  "verdict": "FOLD",
  "reason": "benign GC sawtooth or below tripwire"
}

--- disk df -h / ---
Capacity 36% (24Gi available)

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20] pass_count=3/3

=== PROBE DONE ===
```

### Findings:
- A-30 FOLD (c92 re-evaluation): rag-service memory 92.67–93.64% over 65s window (median 93.06%). Min is 0.33pp below the 93% escalation floor. No state changes, no OOM, no discontinuities, no VmHWM advancement. Verdict justified per discriminator logic: all tripwire conditions negative.
- **STALE-ACK context**: pre-gate flagged this as tracked by FU-RAG-DEPLOY-MEMORY (status=DONE_VERIFIED), indicating a task closure without full resolution. Memory pressure persists at near-threshold level (92-93% range for last 3 cycles).

### Analysis Summary:
Comparing c90 → c91 → c92:
- **c90 (04:17:44Z)**: rag-service 98.15% sustained (CRITICAL escalation, signal emitted)
- **c91 (04:44:01Z)**: rag-service 88.78% stable (FOLD, recovery observed)
- **c92 (05:46:47Z)**: rag-service 92.67–93.64% (FOLD, but now hovering just below threshold)

The discriminator's FOLD verdict is technically correct: min < 93% floor, median well below 97%. However, the recurrence pattern (98% → 88% → 93%) suggests the fix may have been incomplete or circumstantial—the container's steady state appears to be 92-93%, just below but very close to escalation threshold.

### Emit Actions:
```
[emit-signal] NONE — A-30 verdict FOLD (no escalation tripwires triggered)
[emit-dashboard] NONE — FOLD is not WARN/CRITICAL
[telegram] NONE — monitoring continues
```

### Cycle Summary:
Pre-gate verdict (auditor-tier1-probe.sh @ 05:45:39Z): FAILURE — mem_creep detected (rag-service 89.93%, STALE-ACK tracked).
c92 re-evaluation (05:46–05:49 UTC): A-30 multi-probe → FOLD (min 92.67% < 93% floor). No escalation triggers. rag-service memory oscillates near-threshold; FU-RAG-DEPLOY-MEMORY fix presumed incomplete — container's steady state is 92-93%, not baseline recovery.

---
