# System Audit Dashboard

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

## Anomaly: A-12 · api-gateway health endpoint CURL_ERR
**Severity:** WARN | **Date:** 2026-07-21 | **Status:** OPEN  
**Location:** api-gateway service (4000/health endpoint)  
**Details:** Health endpoint returned CURL_ERR (connection failed or timeout from probing host)  
**Impact:** Health aggregation for downstream services may be stale; affects cowork agent liveness detection  
**Root cause:** Transient network issue or api-gateway process CPU stall; correlates with recurring A-12 pattern since 2026-07-20  
**Zone owner:** dev-api-gateway  
**Last reported:** 2026-07-20T06:12:10Z (dedup 7d)  
**Mitigation:** Check api-gateway logs; restart if stall persists  

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
