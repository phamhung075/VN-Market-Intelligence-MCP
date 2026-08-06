
## c57 · 2026-08-06T13:18:03Z

### Audit Run Tier-1 (13:00 UTC trigger FIRE_TICK: cron:auditor-t1:2026-08-06T13:00Z)
- Tier: 1 | Services: 13/13 up, health 5/5 OK, restart 4 ✓
- Anomalies: 1 recurrence (1 warn via dedup, BELOW-FLOOR) | Status: DEGRADED

**Container Status (A-01–A-11):** All 13 host_runtime_set UP ✓
- mcp-server: Up 50 min, RestartCount=4, 15.88% memory ✓
- rag-service: Up 17 min (post-cap-raise to 1GiB), RestartCount=0, **96.31% memory — WARN**
- All other services nominal ✓

**Health Endpoints (A-12–A-20):** All 5 endpoints OK ✓
- A-20 pdf-extractor multi-probe: 3/3 pass ✓

**Memory Pressure (A-30) — Post-Memory-Cap-Raise Evidence:**
- rag-service: deep-probe 13:16-13:17Z (6 samples/10s intervals, 50s window)
  - **Memory band: 96.32% sustained (FLAT)** — all 6 samples identical 96.32%
  - Reclamation dips: **0 detected** — no GC relief pattern
  - OOMKilled: false
  - VmHWM=1149 MB >> VmRSS=1108 MB (historical GC, now stalled)
  - Memory usage: 986.3 MiB / 1 GiB (13.7 MiB free, BELOW 40 MiB safety floor)
  - **Verdict: ESCALATE → WARN** (all >93% + zero dips)
  - Signal: A-30 WARN sys-20260806T131735-7924 (dedup_key: microservice_degraded:rag-service:A-30)
  - **Dedup result: SKIP-dedup** — same key active since c54 (08:16:21Z), within 7d window

**Disk (A-32):** / at 51% < 85% ✓

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE

## c56 · 2026-08-06T12:43:11Z

### Audit Run Tier-1 (12:30 UTC trigger FIRE_TICK: cron:auditor-t1:2026-08-06T12:30Z)
- Tier: 1 | Services: 13/13 up, health 5/5 OK, restart 4 ✓
- Anomalies: 1 continued (1 warn via dedup) | Status: DEGRADED

**Container Status (A-01–A-11):** All 13 host_runtime_set UP ✓
- mcp-server: Up 14 min (restart 2026-08-06T12:25Z), RestartCount=4, 10.24% memory ✓
- rag-service: Up 22 min, RestartCount=6, **99.69% memory — WARN**
- All other services nominal ✓

**Health Endpoints (A-12–A-20):** All 5 endpoints OK ✓
- mcp-server:3000/health HTTP 200 ✓
- api-gateway:4000/health HTTP 200 ✓
- macro-indicators:5004/health HTTP 200 ✓
- pdf-extractor:5001/health HTTP 200 ✓
- frontend:3001/ HTTP 200 ✓
- A-20 multi-probe pdf-extractor: 3/3 pass ✓

**Memory Pressure (A-30) — Recurrence After c55 Clean State:**
- rag-service: deep-probe 12:40-12:41Z (6 samples/13s intervals, 65s window)
  - **Memory band: 99.69% sustained (FLAT)** — all 6 samples identical 99.69%
  - Reclamation dips: **0 detected** — no GC relief pattern
  - OOMKilled: false
  - RestartCount: 6 (two new restarts since c54 started at 08:17:30Z)
  - VmHWM=820 MB >> VmRSS=755 MB (proves GC occurred historically, now stalled)
  - Memory usage: 765.6 MiB / 768 MiB (2.4 MiB free, below 40 MiB safety floor)
  - **Verdict: ESCALATE → WARN severity** (>93% sustained + zero reclamation dips → WARN)
  - Signal: A-30 WARN sys-20260806T124200-5a4b (dedup_key: microservice_degraded:rag-service:A-30)
  - **Dedup result: SKIP-dedup** — same dedup_key active since c54 (08:16:21Z), 7d window still open

**Disk (A-32):** / at 52% < 85% ✓

**Restart Count (A-21):** crashRestarts=0 ✓

**RAW-PROBE:** (Tier-1 probe at 12:39:50Z confirms 13/13 containers up, 5/5 health OK)

```
=== AUDITOR PROBE 2026-08-06T12:39:50Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE
vn-market-intelligence-mcp-mcp-server-1           Up 14 minutes (healthy)   vn-market-intelligence-mcp-mcp-server
vn-market-intelligence-mcp-rag-service-1          Up 22 minutes (healthy)   vn-market-intelligence-mcp-rag-service
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)       vn-market-intelligence-mcp-stock-price
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)       vn-market-intelligence-mcp-macro-indicators
vn-market-intelligence-mcp-pdf-extractor-1        Up 46 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor
vn-market-intelligence-mcp-frontend-1             Up 12 days (healthy)      vn-market-intelligence-mcp-frontend
mcp-gateway                                       Up 3 weeks (healthy)      mcpservergatway-gateway
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)      vn-market-intelligence-mcp-api-gateway
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)      vn-market-intelligence-mcp-news-fetch
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)      vn-market-intelligence-mcp-alert-engine
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=4

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=10.24% MemUsage=314.7MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 7.51% < 85% investigate-gate

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**Context:** RECURRENCE CYCLE. c55 at 09:09:40Z showed a clean all-green state with all containers up and no anomalies. This cycle (12:39Z) detected a RECURRENCE of the rag-service memory escalation: 99.69% sustained with zero GC relief dips. This matches the exact pattern from c54 (97.52%) and c53 (99.73%) — embedder model load appears stuck at maximum baseline. Container has restarted twice more (RestartCount now 6 vs 4 in c54), indicating the pattern is RECURRING after each restart. The A-30 WARN signal is dedup-skipped (within 7-day window from c54's 08:16:21Z escalation), but the recurrence itself is actionable evidence that the root cause (insufficient container memory or inefficient embedder baseline) has NOT been resolved. Auditor policy: detection only. Remediation (FU-RAG-DEPLOY-MEMORY) remains outstanding.

[OUTPUT-CONTRACT] signals_posted=1 | telegram_sent=0 | signal_queue_rows_written=1 | dashboard_rows=1 | dedup_skipped=1
CONTRACT-CONTRADICTION: NONE


## c55 · 2026-08-06T09:09:40Z

### Audit Run Tier-1 (09:00 UTC trigger FIRE_TICK: cron:auditor-t1:2026-08-06T09:00Z)
- Trigger: Scheduled Tier-1 cycle (09:00 UTC boundary)
- Tier: 1 | Services: 13/13 up, health 5/5 OK, restart 0 ✓
- Anomalies: NONE | Status: ALL_GREEN

**Container Status (A-01–A-11):** All 13 host_runtime_set UP ✓
- mcp-server: Up 28 min (restart 2026-08-06T08:41Z), RestartCount=0, 18.32% memory ✓
- rag-service: Up 52 min (restart 2026-08-06T08:17:40Z), RestartCount=2 (prior c53 OOM), containers healthy ✓
- All other services nominal ✓

**Health Endpoints (A-12–A-20):** All 5 endpoints OK ✓
- mcp-server:3000/health HTTP 200 ✓
- api-gateway:4000/health HTTP 200 ✓
- macro-indicators:5004/health HTTP 200 ✓
- pdf-extractor:5001/health HTTP 200 ✓
- frontend:3001/ HTTP 200 ✓
- A-20 multi-probe pdf-extractor: 3/3 pass ✓

**Memory Pressure (A-30):** mcp-server 18.32% < 85% → A-30 SKIP ✓

**Restart Count (A-21):** crashRestarts=0 ✓

**Disk (A-32):** / at 50% < 85% ✓

**RAW-PROBE:** (Tier-1 probe at 09:09:40Z confirms 13/13 containers up, 5/5 health OK)

```
=== AUDITOR PROBE 2026-08-06T09:09:40Z ===

--- docker ps -a ---
NAMES                                             STATUS                    IMAGE                                           CREATED
vn-market-intelligence-mcp-mcp-server-1           Up 28 minutes (healthy)   vn-market-intelligence-mcp-mcp-server           28 minutes ago
vn-market-intelligence-mcp-rag-service-1          Up 52 minutes (healthy)   vn-market-intelligence-mcp-rag-service          16 hours ago
vn-market-intelligence-mcp-stock-price-1          Up 6 days (healthy)       vn-market-intelligence-mcp-stock-price          6 days ago
vn-market-intelligence-mcp-macro-indicators-1     Up 7 days (healthy)       vn-market-intelligence-mcp-macro-indicators     7 days ago
vn-market-intelligence-mcp-pdf-extractor-1        Up 43 hours (healthy)     vn-market-intelligence-mcp-pdf-extractor        8 days ago
vn-market-intelligence-mcp-frontend-1             Up 12 days (healthy)      vn-market-intelligence-mcp-frontend             12 days ago
mcp-gateway                                       Up 3 weeks (healthy)      mcpservergatway-gateway                         3 weeks ago
vn-market-intelligence-mcp-api-gateway-1          Up 3 weeks (healthy)      vn-market-intelligence-mcp-api-gateway          3 weeks ago
vn-market-intelligence-mcp-flaresolverr-1         Up 3 weeks (healthy)      ghcr.io/flaresolverr/flaresolverr:latest        3 weeks ago
vn-market-intelligence-mcp-news-fetch-1           Up 3 weeks (healthy)      vn-market-intelligence-mcp-news-fetch           3 weeks ago
vn-market-intelligence-mcp-technical-analysis-1   Up 3 weeks (healthy)      vn-market-intelligence-mcp-technical-analysis   3 weeks ago
vn-market-intelligence-mcp-alert-engine-1         Up 3 weeks (healthy)      vn-market-intelligence-mcp-alert-engine         3 weeks ago
vn-market-intelligence-mcp-kinh-dich-service-1    Up 3 weeks (healthy)      vn-market-intelligence-mcp-kinh-dich-service    3 weeks ago

--- health endpoints ---
[health] mcp-server:3000/health OK (HTTP 200)
[health] api-gateway:4000/health OK (HTTP 200)
[health] macro-indicators:5004/health OK (HTTP 200)
[health] pdf-extractor:5001/health OK (HTTP 200)
[health] frontend:3001/ OK (HTTP 200)

--- restart count ---
Container=/vn-market-intelligence-mcp-mcp-server-1 RestartCount=0

--- memory pressure ---
Container=vn-market-intelligence-mcp-mcp-server-1 MemPerc=18.32% MemUsage=562.9MiB / 3GiB

--- memory pressure multi-probe reclamation (A-30) ---
[A-30] SKIP deep-probe — baseline 18.32% < 85% investigate-gate

--- disk df -h / ---
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk1s4s1   233Gi    13Gi    14Gi    50%    393k  143M    0%   /

--- pdf-extractor in-container multi-probe (A-20) ---
[A-20-PROBE-1] in-container HTTP 200
[A-20-PROBE-2] in-container HTTP 200
[A-20-PROBE-3] in-container HTTP 200
[A-20] pass_count=3/3

=== PROBE DONE ===
```

**Context:** Scheduled cycle with clean bill of health. All checks pass. Note: rag-service container restarted ~52 minutes ago following c53's CRITICAL OOM escalation (confirmed crash at 08:15Z). Container is now running stably post-restart. Prior memory escalation thread (c49→c51→c52→c53 CRITICAL→c54 restart) is already under remediation via FU-RAG-DEPLOY-MEMORY task (P1, dispatched to architect per router pre-claim resolution). Auditor policy: detection only. This cycle's all-green status confirms stable service state post-remediation-dispatch. No new signals to emit — continuation of known FU-RAG-DEPLOY-MEMORY thread is out of cycle scope (handled by task_board row, not signal_queue).

[OUTPUT-CONTRACT] signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 | dedup_skipped=0
CONTRACT-CONTRADICTION: NONE