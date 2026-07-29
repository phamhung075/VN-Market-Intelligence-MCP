# System Audit Dashboard

## Anomaly: B-06 · vn-bctc-fetch VPS proxy route stale
**Severity:** CRITICAL | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** VPS vinahost (125.212.251.27) — vn-bctc-fetch service (BCTC PDF fetcher)
**Details:** VPS proxy bctc route (get_vps_proxy_health probe) last push 2026-07-28T08:23:22Z (18+ hours stale). Corroborated via get_vps_proxy_health: `bctc | last push 2026-07-28 08:23:22 | Status ok | 24h pushes 0 | 24h errors null | Stale? YES`. Other six VPS routes (vn-sbv-fetch, vn-news-fetch, vn-foreign-flow, vn-price-fetch, vn-macro-indicators, vn-eod-fetch) report healthy or idle status and periodic push activity.
**Impact:** BCTC PDF fetching pipeline is design-event-driven (quarterly earnings season only); off-season silence is normal. The 18h+ stale push age indicates no BCTC work triggered since 08:23Z (last push over earnings window); cannot distinguish between healthy idle and fetch failure without queue inspection.
**Root cause:** Event-driven; off-season silence expected. BCTC Healthy-Idle Gate (Tier-2 B-05 check) gates on `queue=0 AND host-up` — that evaluation lives in Tier-2 scope and is not re-run here (PLAN-ONLY constraint: no Tier-1 re-run of Tier-2 checks).
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T02:32:58Z (signal sys-20260729T023259-496f, system-auditor -> po, dedup_key=data_stale:vps-bctc-proxy:B-06)
**Mitigation:** BCTC pipeline is off-season idle (no active queue, healthy VPS host). Evidence-attach to FIX-BCTC-SLA-THRESHOLD-360 (context: earnings-window-dependent SLA mode handles inter-quarter quiet periods). No immediate action required.

---

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

## Anomaly: A-30 · mcp-server memory >93% no-reclamation tripwire TRIPPED
**Severity:** CRITICAL | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** mcp-server container (vn-market-intelligence-mcp-mcp-server-1)
**Details:** Tripwire `>93% sustained with ZERO reclamation dips over 180s` TRIPPED at 2026-07-28T21:50:21Z–21:53:20Z. 12-sample window: 94.37%→94.23%→94.70%→94.62%→95.37%→95.16%→95.39%→95.40%→96.32%→96.28%→96.06%→95.97% (all >93%, largest downward move 6 MiB vs 62-64 MiB genuine reclamation earlier). VmHWM/VmRSS gap collapsed from ~180 MiB to 5,860 kB; RSS at 99.8% of its own high-water. **Qualifying evidence (post-cycle)**: after audit cycle, memory climbed to 98.25% (highest of night), then reclaimed 66 MiB and 30 MiB in two genuine GC dips; VmHWM touched 3,148,684 kB (ceiling at 3,145,728 kB / 3GiB cap); VmRSS/HWM gap reopened to 252 MiB (wider than 180 MiB benchmark). Server remained responsive (:3000/health 200 @ 1.954ms), OOMKilled=false, RestartCount=2 unchanged. Mechanism: 180s audit window sat on RISING EDGE of sawtooth with period >180s; "zero dips on rising edge" is structurally guaranteed regardless of reclamation health. Discriminator weakness: cannot separate `reclamation lost` from `sampled during climb`. What survives: VmHWM at cap + sustained 95-98% occupancy + genuine dips when period crosses 180s = memory leak, already tracked FIX-MCP-MEMORY-CODE-LEAK (BACKLOG).
**Impact:** Pre-cap warning. Process has reached its ceiling and is reclaiming just enough to avoid OOMKilled. At current trajectory, cap exhaustion possible within hours if workload sustains.
**Root cause:** FIX-MCP-MEMORY-CODE-LEAK — recurring leak documented as "accumulates ~87% in 12h despite fresh start at 5%" (PO escalation 2026-07-22).
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-28T21:54:25Z (signal sys-20260728T215425-23ef, dedup_key=microservice_degraded:mcp-server:A-30-TRIPWIRE-TRIPPED, CRITICAL Telegram sent)
**Mitigation:** Folded to FIX-MCP-MEMORY-CODE-LEAK (HIGH priority). Board's "tripwire UNtripped → no escalation" directive no longer applies; tripwire transition is the discriminator. PLAN-ONLY: no restart (not a fix, re-leaks next cycle), no rebuild, no ops escalation.

---

## Anomaly: A-12 · api-gateway health endpoint WARN applied to known benign transient
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** api-gateway service (4000/health endpoint), tier1-probe.sh run 2026-07-28T21:37:21Z
**Details:** Single-probe CURL_ERR observed at 21:37:21Z (--max-time 3). This is NOT a false observation. Mechanism: api-gateway's /health endpoint logged `latency_ms=3006` at ~21:37:56Z — 6ms over the probe's 3000ms cap (confirmed via internal request log). This class of transient is KNOWN and TRACKED under SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP (10+ prior occurrences; devteam corroboration 2026-07-25: "genuine intermittent api-gateway latency transient, not a real outage, not a probe-side FP"). **Defect**: WARN-OUTAGE severity was applied to a known benign latency spike. Coordinator's post-cycle 8x HTTP 200 verification (all <7ms) is consistent with a transient latency spike having passed, not with "nothing happened". Container: RC=0, 13d uptime never restarted, Health=healthy, docker healthcheck exits=0.
**Impact:** Severity mismatch (benign transient signalled as outage) unnecessarily escalates a recurring timing anomaly into the critical queue.
**Root cause:** FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE marked DONE (to prevent benign health transients re-emitting as fresh signals) but post-fix we see the same class. Indicates incomplete fix scope or regression. A-20 multi-probe discriminator exists for pdf-extractor; A-12/general health lacks equivalent N-consecutive debounce guard per tier1-probe.md line ~55.
**Zone owner:** dev-api-gateway
**Last reported:** 2026-07-28T21:40:04Z (signal sys-20260728T214004-6369, dedup_key=microservice_degraded:api-gateway:A-12, WARN Telegram sent)
**Mitigation:** Evidence attach to SPIKE-DASHBOARD-TIER-HEALTH-CURL-ERR-FLAP (architect, plan-only). Related: FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE (post-fix regression), FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (completes A-20/A-30 parity).

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

## Anomaly: B-12 · sbv_fx stale 32min
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** sbv_rates/sbv_fx
**Details:** sbv_fx data stale 32 minutes (expected cadence 30 min, last fetch 2026-07-29T10:00Z)
**Impact:** SBV forex rates unavailable — impacts macro carry-trade signals
**Root cause:** VPS proxy latency or network issue
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T10:33:44Z (signal sys-20260729T103337-13e5, system-auditor -> po, dedup_key=data_stale:sbv_fx:B-12, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-01 · sbv_fx stale 48 minutes (SLA: 30m)
**Severity:** CRITICAL | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** data_source/sbv_fx
**Details:** FX rates fetch age 48 minutes, exceeds SLA threshold of 30 minutes
**Impact:** Foreign exchange data stale; affects market context and macro signal accuracy
**Root cause:** Unknown delay in FX data fetch pipeline
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T14:35:11Z (signal sys-20260729T143446-2c78, system-auditor -> po, dedup_key=data_stale:sbv_fx:B-01, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-06 · VPS services unhealthy (2/4 down)
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** infrastructure/vps_proxy
**Details:** vn-bctc-fetch and vn-sbv-fetch services unhealthy; last BCTC push 2026-07-28 08:23:22
**Impact:** BCTC and SBV data extraction blocked; 167 pending BCTC jobs cannot be processed
**Root cause:** VPS host unavailable or network connectivity issues
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T14:35:11Z (signal sys-20260729T143456-2973, system-auditor -> po, dedup_key=data_stale:vps_proxy:B-06, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-05 · BCTC queue stale with 167 pending jobs
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** data_source/bctc_discover
**Details:** Queue has 167 pending/failed items; VPS service unhealthy; last push 2026-07-28 08:23:22
**Impact:** Financial statement extraction blocked; Q3 BCTC filings cannot be processed
**Root cause:** Upstream VPS service unavailable blocking queue processing
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T14:35:12Z (signal sys-20260729T143457-16cc, system-auditor -> po, dedup_key=data_stale:bctc_discover:B-05, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-06 · market_messages table: 0 rows in last 3 hours
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** mcp-server/market.db/market_messages
**Details:** No rows in market_messages table for the last 3 hours
**Impact:** Market messaging pipeline may be stalled or broken
**Root cause:** Unknown — possible pipeline failure or data loss
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T18:34:53Z (signal sys-20260729T183438-0c12, system-auditor -> po, dedup_key=data_freshness:market_messages:C-06, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-06 · VPS bctc proxy route: 34+ hours stale
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** VPS vinahost — vn-bctc-fetch service
**Details:** VPS proxy bctc route last push 2026-07-28T08:23:22Z (34+ hours stale). Service unhealthy. BCTC queue: 167 pending items.
**Impact:** BCTC PDF extraction pipeline blocked by unhealthy VPS service
**Root cause:** VPS service unreachable or network latency high
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T18:34:53Z (signal sys-20260729T183440-1d23, system-auditor -> po, dedup_key=data_stale:vps_proxy:B-06, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---
