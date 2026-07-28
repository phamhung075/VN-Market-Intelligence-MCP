# System Audit Dashboard

## Anomaly: B-07 · vn-sbv-fetch VPS service unhealthy
**Severity:** WARN | **Date:** 2026-07-28 | **Status:** OPEN
**Location:** VPS vinahost (125.212.251.27) — vn-sbv-fetch service (SBV FX/rates fetcher)
**Details:** `get_vps_service_health` reports vn-sbv-fetch=unhealthy (poll age 2m, VPS uptime=59m — process restarted ~17:33Z). Corroborated via DB read: `sbv_rates` table last row `fetched_at=2026-07-28T17:30:09.775Z` (pre-restart), `is_estimate=1`. All other VPS services healthy or idle (vn-bctc-fetch healthy, vn-news-fetch healthy, vn-foreign-flow/vn-price-fetch idle — market closed).
**Impact:** SBV FX/rates data pipeline not confirmed producing fresh real (non-estimate) values since the VPS-side restart.
**Root cause:** Pre-existing, already root-caused: `storeSbvSnapshot` emits ZERO-VALUE snapshots that the DB guard rejects, recurring post-restart — tracked by FIX-SBV-FETCHER-ZERO-VALUE-EMIT (P1 BACKLOG, dev-macro-indicators). This finding is evidence attachment, not a new mechanism.
**Zone owner:** dev-macro-indicators
**Last reported:** 2026-07-28T18:39:37Z (signal sys-20260728T183937-73b5, system-auditor -> po)
**Mitigation:** No new action — feeds existing FIX-SBV-FETCHER-ZERO-VALUE-EMIT (BACKLOG, unpicked). VPS restart is user-gated, not authorized here (AUD-ND-1 plan-only).

---

## Anomaly: T1-PREGATE-SAMPLE-FREQ · mem_creep pre-gate single-point-sample missed pdf-extractor peak
**Severity:** WARN | **Date:** 2026-07-28 | **Status:** OPEN
**Location:** scripts/agents-flow/auditor-tier1-probe.sh `_check_mem_creep()` (Tier-1 cron pre-gate, distinct from the subagent's own docs/agents/system-auditor/probe.sh)
**Details:** The pre-gate takes exactly ONE `docker stats --no-stream` sample per capped container per invocation (documented by design: "a true trend/creep detector stays a Tier-2/3 job" — but no Tier-2/3 check in flow/main.md implements memory-trend detection for any container besides mcp-server's own within-invocation A-30 deep-probe). Live-corroborated: auditor independently re-ran the identical script at 2026-07-28T17:42Z, ~5.5min after a router-cited 17:36:43Z ALL_GREEN, and got verdict=FAILURE — pdf-extractor at 99.91% MemPerc, unacked (rag-service 99.99% separately acked). Auditor's own 4-sample series 17:40:53Z–17:41:33Z held pdf-extractor at 99.05–99.97%; `/proc/1/status` VmHWM=2619436kB = 99.92% of the 2621440kB (2.5GiB) cap, tesseract=1 (concurrency invariant intact). Same-day prior samples recorded 44.74–45.18% at 17:10–17:16Z — a full trough-to-near-cap swing inside one 30min Tier-1 cron cadence.
**Impact:** A gate this coarse can report ALL_GREEN for an entire cron tick while a real near-OOM condition is live elsewhere in that same 30min window — the automated pre-spawn check cannot be trusted to catch fast-swinging (sub-tick) memory workloads.
**Root cause:** Sampling-frequency/duty-cycle mismatch (loop SCOPE already covers all capped containers per FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE, 2026-07-25 — this is NOT that defect). Distinct also from FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE (that row is the subagent's own mcp-server-only veto-clause tautology). This finding: no multi-sample/trend logic exists anywhere for a fast-swinging non-mcp-server workload.
**Zone owner:** developer (cross-service, scripts/)
**Last reported:** 2026-07-28T17:46:52Z (signal sys-20260728T174652-22a6, system-auditor -> po)
**Mitigation:** Detector-side only — does NOT duplicate business-impact row FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (po-minted 2026-07-28T17:33:25Z, architect/plan_only/supervised), which owns WHY pdf-extractor memory climbs. This row is about WHY the automated pre-gate didn't surface it sooner. Related: FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE, FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE.

---

## Anomaly: SLA-1 · freshnessSlaMonitorJob coverage-map path ENOENT
**Severity:** WARN | **Date:** 2026-07-28 | **Status:** OPEN
**Location:** mcp-server container (apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts:34-36)
**Details:** Job builds a 5-level relative path climb from /app/src/scheduler/system/, resolving to /docs/data/frontend-data-coverage-map.json (ENOENT, confirmed via docker exec ls) instead of the real mount /app/docs/data/frontend-data-coverage-map.json (confirmed present). docker logs --since=6h shows 12 occurrences of "[sla-monitor] coverage-map second pass failed" at ~30min cadence.
**Impact:** The scheduler fires the coverage-map second pass on schedule but is structurally unable to read its own input — it can never observe a real SLA breach and fails toward silence, not false alarms.
**Root cause:** Broken relative-path resolution — one-line fix (correct the climb to match the real /app/docs/data/... mount).
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-28T17:15:55Z (signal sys-20260728T171555-7cb3, system-auditor -> po)
**Mitigation:** Tracked on task_board row FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING (ready, P1) — evidence attached 2026-07-28T17:33Z.

---

## Anomaly: A-30 · mcp-server memory pressure
**Severity:** WARN | **Date:** 2026-07-21 | **Status:** OPEN  
**Location:** mcp-server container (vn-market-intelligence-mcp-mcp-server-1)  
**Details:** Memory pressure at 75.14% (2.254GiB / 3GiB); exceeds 68% anomaly threshold. Trending up: 55.89% → 64.65% → 61.27% → 63.96% → 75.14%  
**Impact:** Sustained high memory utilization may impact performance or trigger OOM kills during peak load  
**Root cause:** Possible memory leak in MCP server or subagent processes; or peak workload during market analysis cycles  
**Zone owner:** dev-mcp-server  
**Last reported:** 2026-07-19T08:11:04Z (dedup 7d)  
**Mitigation:** Monitor memory trend; investigate for leaks if sustained >80%; consider restart if approaches 90%  

---

## Anomaly: A-01 · api-gateway health endpoint CURL_ERR (recurring transient — SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP)
**Severity:** WARN | **Date:** 2026-07-28 | **Status:** OPEN
**Location:** api-gateway service (4000/health endpoint)
**Details:** probe.sh single-probe CURL_ERR (--max-time 3) at 2026-07-28T19:07:5xZ. Corroborated via api-gateway's own internal request log: a `/health` request at 19:07:56.737Z logged `latency_ms=3006` — crosses the probe's 3000ms timeout by 6ms. 5x immediate manual re-checks all HTTP 200 (4-2000ms); docker inspect Health.Status=healthy throughout. Not a new mechanism — 10+ prior occurrences already tracked (SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP, architect, plan-only); devteam corroboration 2026-07-25 concluded this is a genuine intermittent api-gateway latency transient (not a real outage, not a pure probe-side FP) crossing a tight probe timeout.
**Impact:** Health aggregation for downstream services may be transiently stale during the spike window; self-resolves within seconds. Recurring-FAILED-FIX class — the recommended N-consecutive debounce guard is not yet implemented in tier1-probe.md's general Health Endpoints check (only A-20/pdf-extractor has a multi-probe discriminator today).
**Root cause:** api-gateway's /health handler fans out to 9 downstream service checks; latency is highly variable (observed 4ms-3006ms in the surrounding 5min log window) and occasionally exceeds the 3s probe timeout. Root-cause of the latency variance itself not yet diagnosed (SPIKE deliverable, unpicked).
**Zone owner:** dev-api-gateway
**Last reported:** 2026-07-28T19:10:48Z (signal sys-20260728T191048-7f8f, dedup_key=microservice_degraded:api-gateway:A-01, SKIP-dedup — last BUG telegram 2026-07-22T01:41:24Z, still within 7d window)
**Mitigation:** No new action — evidence-attach to open SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP (architect, plan-only). Do NOT restart (AUD-ND-1).

---

## Anomaly: A-11 · pdf-extractor UNHEALTHY
**Severity:** WARN | **Date:** 2026-07-20 | **Status:** OPEN  
**Location:** pdf-extractor container (vn-market-intelligence-mcp-pdf-extractor-1)  
**Details:** Docker health check reports unhealthy status; container marked as unhealthy in docker ps output  
**Impact:** BCTC PDF extraction may be blocked or severely degraded; earnings report processing delayed  
**Root cause:** Likely event loop stall or resource exhaustion (correlates with A-20 multi-probe failure)  
**Zone owner:** dev-pdf-extractor  
**Last reported:** 2026-07-20T02:11:41Z (dedup 7d)  

---

## Anomaly: A-20 · pdf-extractor event-loop stall
**Severity:** WARN | **Date:** 2026-07-20 | **Status:** OPEN  
**Location:** pdf-extractor service (event loop / uvicorn)  
**Details:** In-container health probe failed 0/3 times (HTTP 000 = no response from event loop); host-side proxy ports unreachable from container namespace  
**Impact:** PDF extraction pipeline stalled; BCTC earnings reports cannot be processed or extracted  
**Root cause:** Uvicorn event loop wedged (wedged thread, resource exhaustion, or deadlock); requires container restart to recover  
**Zone owner:** dev-pdf-extractor  
**Last reported:** 2026-07-19T20:46:16Z (dedup 7d)  
**Mitigation:** Container restart may clear event loop stall; escalate to dev-pdf-extractor for investigation  

---
