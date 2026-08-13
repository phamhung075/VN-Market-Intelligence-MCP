# System Audit Dashboard

## Anomaly: A-30 · pdf-extractor-1 memory at 85.11% (boundary condition)
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** mcp-server pod — pdf-extractor-1 container (PDF text extraction service)
**Details:** pdf-extractor-1 at 85.11% of allocated memory, exactly at the A-30 investigate-gate boundary (≥85% threshold). State stable with no OOM events, no recent restarts, no crash signals.
**Impact:** Container approaching saturation point. Sustained operation at this threshold risks memory pressure events during burst workloads.
**Root cause:** PDF extraction workload inherent memory profile; coincident with rag-service memory regression.
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T20:00:00Z (signal 10692, system-auditor -> po, dedup_key=microservice_degraded:pdf-extractor-1:A-30)
**Mitigation:** Monitor via next Tier-1 cycle. If sustained ≥85%, escalate to ops for container resource review (memory cap adjustment or workload distribution).

---

## Anomaly: A-30 · rag-service-1 memory at 90.37% (sustained high, STALE-ACK)
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** mcp-server pod — rag-service-1 container (RAG embedding model service)
**Details:** rag-service-1 at 90.37% of allocated memory (98.6 MiB free), baseline 93.43% from c34 cycle at 2026-08-11T18:40Z. Pattern: sustained high memory (>93%) with zero reclamation dips. ACK entry tracked_by=FU-RAG-DEPLOY-MEMORY has status DONE_VERIFIED (completed 2026-08-08T10:59:52Z), so STALE-ACK correctly expired. VmHWM pinned at 1 GiB cgroup limit, NOT advancing.
**Impact:** Elevated memory persistence aligns with known embedder model design decision (task FU-RAG-DEPLOY-MEMORY approved resident-set ~700MiB for singleton embedder model). Process stable, no OOM, no crash signatures.
**Root cause:** Design outcome — task FU-RAG-DEPLOY-MEMORY made explicit trade-off accepting high baseline memory for embedder model performance.
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T20:00:00Z (signal 10693, system-auditor -> po, dedup_key=microservice_degraded:rag-service-1:A-30)
**Mitigation:** No action required — aligns with task acceptance. STALE-ACK status correctly reflects that task completion removed suppression validity.

---

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

## Anomaly: B-01 · sbv_fx stale 34min
**Severity:** CRITICAL | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** data-fetch/sbv_fx
**Details:** SBV FX data last updated 34 minutes ago, exceeds SLA of 30 minutes
**Impact:** FX rates used in macro analysis stale; valuation signals unreliable
**Root cause:** SBV API or VPS fetch pipeline delayed or stuck
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T22:35:36Z (signal sys-20260729T223454-3b28, system-auditor -> po, dedup_key=data_stale:sbv_fx:B-01, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-06 · VPS proxy bctc stale 38h
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** data-fetch/vps_proxy
**Details:** BCTC PDF pull service stale 38+ hours (last push 2026-07-28 08:23Z), vn-bctc-fetch unhealthy
**Impact:** BCTC quarterly reports not being downloaded; extraction pipeline blocked
**Root cause:** VPS service down or unreachable, network latency, or fetch process failure
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T22:35:37Z (signal sys-20260729T223504-3605, system-auditor -> po, dedup_key=data_stale:vps_proxy:B-06, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-01 · sbv_fx stale 34min
**Severity:** CRITICAL | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** data-fetch/sbv_fx
**Details:** SBV FX data last updated 34 minutes ago, exceeds SLA of 30 minutes
**Impact:** FX rates used in macro analysis stale; valuation signals unreliable
**Root cause:** SBV API or VPS fetch pipeline delayed or stuck
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T22:35:37Z (signal sys-20260729T223454-3b28, system-auditor -> po, dedup_key=data_stale:sbv_fx:B-01, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-06 · VPS proxy bctc stale 38h
**Severity:** WARN | **Date:** 2026-07-29 | **Status:** OPEN
**Location:** data-fetch/vps_proxy
**Details:** BCTC PDF pull service stale 38+ hours (last push 2026-07-28 08:23Z), vn-bctc-fetch unhealthy
**Impact:** BCTC quarterly reports not being downloaded; extraction pipeline blocked
**Root cause:** VPS service down or unreachable, network latency, or fetch process failure
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-29T22:35:38Z (signal sys-20260729T223504-3605, system-auditor -> po, dedup_key=data_stale:vps_proxy:B-06, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-08 · alerts table check C-08 failed
**Severity:** WARN | **Date:** 2026-07-30 | **Status:** RETRACTED (2026-08-06 — see FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP)
**Location:** market.db/alerts
**Details:** 121 alerts triggered in last 24h have no matching `agent_signals` rows (originally mis-stated as "signal_queue" — wrong table name; C-08's join is on `agent_signals.alert_id`, not `signal_queue`).
**Impact:** ~~Missing signals may prevent proper alert routing and status tracking~~ — DISCONFIRMED. RAW-verified 2026-08-05/06 against the live named-volume DB: the orphan count is a pure function of `agent_signals` correlation-stub GC timing (2h TTL, purged only once daily by `cleanExpired()`) crossed with a 24h check window that was mathematically unsatisfiable for `expected=0` — it carries ZERO information about write-path health. Producer-family breakdown showed no producer-specific gap.
**Root cause:** ~~Signal processing pipeline may be delayed or alert-signal mapping broken~~ — this was an agent-narrated, unmeasured hypothesis (confabulation class `feedback_agent_selfreport_metalayer_confabulation`), now DISCONFIRMED. Actual root cause: C-08's 24h alerts window vs the 2h `agent_signals` correlation-stub TTL made `expected=0` unsatisfiable by construction; ALSO an ISO8601 strcmp bypass (`alerts.triggered_at` is T-format, an unwrapped `> datetime('now',...)` over-captured). Fixed in FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP (window rebound to the 2h TTL + `datetime()` wrap on both sides).
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-30T00:35:44Z (signal sys-20260730T003538-10ba, system-auditor -> po, dedup_key=db_integrity_breach:alerts:C-08, WARN Telegram sent)
**Mitigation:** No action required — false positive, detector fixed at source.

---

## Anomaly: B-03 · foreign-flow data stale 189 minutes
**Severity:** CRITICAL | **Date:** 2026-07-30 | **Status:** OPEN
**Location:** foreign-flow/VPS
**Details:** Last fetch approximately 3.15 hours ago; SLA threshold 10 minutes
**Impact:** Real-time market flow data unavailable; critical for order-flow analysis and signal validation
**Root cause:** VPS fetch pipeline delay; may indicate network latency or service degradation
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-30T07:11:33Z (signal sys-20260730T071114-45c7, system-auditor -> po, dedup_key=data_stale:foreign-flow:B-03, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-01 · sbv_fx FX data stale 204 minutes
**Severity:** CRITICAL | **Date:** 2026-07-30 | **Status:** OPEN
**Location:** sbv-vps/SBV
**Details:** Last fetch approximately 3.4 hours ago; SLA threshold 30 minutes
**Impact:** SBV FX and credit flow data unavailable; critical for macro risk assessment
**Root cause:** VPS service may be experiencing network delays; known issue FIX-AUDITOR-SBVFX-SLA-POSTMARKET-TOLERANCE
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-30T07:11:39Z (signal sys-20260730T071120-1bf1, system-auditor -> po, dedup_key=data_stale:sbv_fx:B-01, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-06 · VPS bctc proxy route stale 41+ hours
**Severity:** CRITICAL | **Date:** 2026-07-30 | **Status:** OPEN
**Location:** VPS proxy/bctc-route
**Details:** Last push 2026-07-28T08:23:22Z (41+ hours ago); vn-bctc-fetch service unhealthy
**Impact:** BCTC earnings data pipeline stalled; Q2 earnings window processing blocked
**Root cause:** vn-bctc-fetch service unhealthy; existing issue tracked as FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT
**Zone owner:** dev-mcp-server
**Last reported:** 2026-07-30T07:11:46Z (signal sys-20260730T071126-4b11, system-auditor -> po, dedup_key=data_stale:vps_proxy:B-06, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-OHLCV-VIOLATIONS · daily_ohlcv: 336 records with H=0, L=0 (OHLCV violation)
**Severity:** CRITICAL | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** market.db/daily_ohlcv
**Details:** 336 daily_ohlcv records with high=0 and low=0, violating OHLCV constraint (high must be >= open, close, low). All from 2026-05-15.
**Impact:** Invalid price data affects technical analysis and trading signals downstream
**Root cause:** Data extraction/load bug on 2026-05-15, high/low values missing and written as 0
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T06:52:35Z (signal sys-20260805T065227-25f7, system-auditor -> po, dedup_key=db_integrity_breach:daily_ohlcv:OHLCV_H_L_ZERO, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory 97.83% (below floor)
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service
**Details:** rag-service memory at 97.83% of 768MiB cap (usage: 751.3MiB) — absolute headroom ~16.7 MiB BELOW 40 MiB floor
**Impact:** Container approaching OOM due to sentinel model memory (embedder.py:37-51)
**Root cause:** No release path for sentence-transformers model singleton (FU-RAG-DEPLOY-MEMORY)
**Zone owner:** po
**Last reported:** 2026-08-05T07:42:07Z (signal sys-20260805T074206-2897, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory 99.81% BELOW 40MiB floor
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service/memory
**Details:** rag-service at 99.81% of 768MiB (1.5MiB free, BELOW 40MiB floor threshold)
**Impact:** Service may crash or fail under memory pressure
**Root cause:** Sentence-transformers model singleton with no release path; ~700MiB baseline reached on first embed
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T08:11:34Z (signal sys-20260805T081125-5e0d, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-08 · alerts: 22 orphaned (no agent_signals)
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** RETRACTED (2026-08-06 — see FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP)
**Location:** market.db/alerts
**Details:** 22 alerts triggered in last 24h with no corresponding agent_signals (expected 0). Severity: 1 high, 2 low, 14 medium, 5 warning. Examples: FPT news mention, FRT overbought, price surge alerts.
**Impact:** ~~Orphaned alerts may not trigger proper downstream signal routing or system response~~ — DISCONFIRMED. Age-bucketed LEFT JOIN on the live DB gave a clean split with NO overlap: alerts <=17h old = 18 linked / 0 orphaned; alerts >=18h old = 22 orphaned / 0 linked — the 18h boundary exactly equals the last `cleanExpired()` GC sweep. Orphan status is a pure function of GC timing x alert volume, not write-path health. Producer-family breakdown showed every family present on both sides (no producer-specific gap); `price_alerts`/`alert_engine_records` both hold 0 rows, ruling out an "alert-engine bypasses agent_signals" writer gap.
**Root cause:** ~~Alerts created by alert-engine but not propagated to agent_signals table~~ — this was an agent-narrated, unmeasured hypothesis (confabulation class `feedback_agent_selfreport_metalayer_confabulation`), now DISCONFIRMED. `storeAlerts`/`storeAlertsFromCommander` co-write `agent_signals` synchronously in the same transaction (alertStore.ts) — the write path is healthy. Actual root cause: C-08's 24h alerts window vs the 2h `agent_signals` correlation-stub TTL made `expected=0` unsatisfiable by construction; ALSO an ISO8601 strcmp bypass. Fixed in FIX-AUDITOR-C08-UNSATISFIABLE-TTL-WINDOW-AND-ISO8601-STRCMP.
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T08:19:15Z (signal sys-20260805T081846-1853, system-auditor -> po, dedup_key=db_integrity_breach:alerts:C-08, WARN Telegram sent)
**Mitigation:** No action required — false positive, detector fixed at source.

---

## Anomaly: A-30 · mcp-server memory sustained >93% (loss of reclamation)
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** mcp-server container
**Details:** 6-probe 65s window: min=93.98%, max=94.50%, 0 reclamation dips. VmHWM=2.945GB > VmRSS=2.855GB (prior reclamation confirmed); no new dips observed.
**Impact:** Loss of reclamation pattern suggests GC pressure accumulating; previous cycles showed transient spikes with recovery, this cycle sustained high without relief
**Root cause:** Memory code leak or inefficient GC tuning (mapped to FIX-MCP-MEMORY-CODE-LEAK backlog); possible GC full-collection failures or dead object retention
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T09:12:17Z (signal sys-20260805T091206-591b, system-auditor -> po, dedup_key=mem_pressure:mcp-server:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service-1 A-30: memory 96.91% sustained (23.7MiB free — below floor)
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service-1/memory
**Details:** Sustained memory pressure at 96.91% over 65-second probe window with zero reclamation dips. Free memory 23.7 MiB, below floor threshold of 40 MiB. Loss of reclamation capability indicated.
**Impact:** Service is memory-starved and at risk of OOM. Will likely fail without intervention.
**Root cause:** Code memory leak or inefficient memory usage in rag-service-1. Monotonic degradation trend visible across audit cycles.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-05T10:08:43Z (signal sys-20260805T100834-7723, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-21 · mcp-server A-21 crash restart — 6 crashes in 4h window
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** mcp-server container
**Details:** mcp-server windowed crash count=6 (threshold=2) — crashes at 09:24:37Z, 09:26:59Z, 09:35:07Z, 09:45:41Z, 10:09:54Z, 10:13:07Z
**Impact:** Repeated container restarts indicate underlying stability issue — may impact data freshness if pattern continues
**Root cause:** Unknown — requires investigation; possible memory pressure (rag-service high), I/O issue, or OOM kill
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T10:34:43Z (signal sys-20260805T103434-24be, system-auditor -> po, dedup_key=microservice_degraded:mcp-server:A-21, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure: 97.51% of 768MiB
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory usage: 748.9MiB / 768MiB (97.51%) — critical headroom exhaustion
**Impact:** Approaching OOM kill threshold — service restart risk imminent
**Root cause:** High memory footprint in RAG embeddings cache or vector store operations
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T10:41:15Z (signal sys-20260805T104107-762a, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 95.05%
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory usage 95.05% (38.0 MiB free, below 40 MiB floor threshold)
**Impact:** Service running on critical memory margin; risk of OOM kill if usage spikes
**Root cause:** RAG service embedding model loads consume large VRAM; container memory limit insufficient
**Zone owner:** ai-ml-platform
**Last reported:** 2026-08-05T11:11:40Z (signal sys-20260805T111131-1c02, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory 97.81% (below 40MiB floor)
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory at 97.81% (751.2MiB / 768MiB), 16.8MiB free, below 40MiB floor
**Impact:** Service may become unresponsive or crash under load
**Root cause:** High-memory usage during vector embedding operations; fix in commit 22232ad2b awaiting deployment
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T11:40:53Z (signal sys-20260805T114039-2c07, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 92.07%
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service container
**Details:** rag-service memory at 92.07% (707.1MiB / 768MiB) — above 85% investigate-gate. Container restarted 20 seconds ago following source code fix.
**Impact:** High memory usage may trigger OOM if spike occurs. Service functionality degraded if memory pressure increases.
**Root cause:** Large RAG embeddings/LanceDB index. Fix landed in commit 22232ad2b (clean exit/restart loop), awaiting container rebuild post-QA signoff.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-05T12:11:47Z (signal sys-20260805T121137-606d, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor memory pressure 89-96% (no reclamation)
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** pdf-extractor service
**Details:** Memory usage oscillating 89-96% over 30s with no garbage collection. VmPeak 6.77GB, VmHWM 2.46GB. Approaching 2.5GB container limit. Child process errors logged.
**Impact:** Rapid memory growth without reclamation suggests leak; may lead to OOMKill. Service degraded.
**Root cause:** Possible memory leak in pdf-extractor uvicorn process; child process tracking errors in OCR gateway suggest Tesseract process residue not cleaned.
**Zone owner:** developer
**Last reported:** 2026-08-05T14:34:56Z (signal sys-20260805T143448-6948, system-auditor -> po, dedup_key=microservice_degraded:pdf-extractor:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 95.77%
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service container / memory
**Details:** Memory usage: 95.77% (735.5MiB/768MiB). Multi-probe analysis over 40 seconds: 5 samples all at 95.77% with no reclamation dip detected. Loss of reclamation confirmed.
**Impact:** Container memory approaching limit with no automatic reclamation; may eventually hit OOM if baseline continues
**Root cause:** Potential memory leak in rag-service or insufficient GC tuning; needs investigation
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-05T16:18:51Z (signal sys-20260805T161834-0151, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service critical memory pressure (98.05%)
**Severity:** CRITICAL | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service/memory
**Details:** Memory usage at 98.05% (753MiB/768MiB), only 15MiB free (below 40MiB floor). Escalating trend: 90.62%→95.77%→98.05% over 2 hours. No reclamation observed.
**Impact:** Approaching OOM-kill territory. Service is healthy now but at critical risk. Fix deployed but container not rebuilt.
**Root cause:** Undeployed fix: FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (verified, awaiting container rebuild)
**Zone owner:** dev-infrastructure
**Last reported:** 2026-08-05T16:34:24Z (signal sys-20260805T163415-6b8c, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure — sustained high, no reclamation dips
**Severity:** WARN | **Date:** 2026-08-05 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory 95.74–96.55% over 65s probe window (6 samples, 13s spacing). All samples >93% with zero reclamation dips. Free memory 33MiB.
**Impact:** Unsustainable memory trend with loss of reclamation. Risk of OOM if trend continues.
**Root cause:** Likely memory leak in rag-service or ineffective GC. See feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn and FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (commit 22232ad2b).
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-05T16:43:56Z (signal sys-20260805T164347-372c, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-01 · news source stale 790m
**Severity:** CRITICAL | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** data/news
**Details:** news source stale 790 minutes (expected cadence 30 minutes, last fetch 2026-08-05T19:38:29Z)
**Impact:** Market news updates not refreshing — critical real-time information gap
**Root cause:** News fetch pipeline halted or VPS route unreachable
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T06:41:35Z (signal sys-20260806T064127-78c1, system-auditor -> po, dedup_key=data_stale:news:B-01, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory sustained high (96.50%)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory sustained at 96.50% (741.1/768 MiB) across 6 probes with zero reclamation dips
**Impact:** Potential memory pressure; limited headroom for traffic spikes
**Root cause:** rag-service embedder model load with insufficient GC dip intervals
**Zone owner:** apps/rag-service
**Last reported:** 2026-08-06T07:15:59Z (signal sys-20260806T071552-5539, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: DATA-01 · daily_ohlcv: 336 incomplete OHLCV rows (illiquid)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** market.db/daily_ohlcv
**Details:** 336 rows with high=0, low=0, volume=0 from 34 illiquid tickers (2026-05-15 to 2026-06-12)
**Impact:** Data quality issue affects analytics on illiquid securities; OHLCV calculations may fail or produce invalid results
**Root cause:** Incomplete market data aggregation for HOSE side-listed fund shares; data source provided O/C but not H/L/V
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T07:21:41Z (signal sys-20260806T072127-34b3, system-auditor -> po, dedup_key=db_anomaly:daily_ohlcv:illiquid_ohlcv_incomplete, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: DATA-01 · daily_ohlcv: 336 incomplete OHLCV rows (illiquid)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** market.db/daily_ohlcv
**Details:** 336 rows with high=0, low=0, volume=0 from 34 illiquid tickers (2026-05-15 to 2026-06-12)
**Impact:** Data quality issue affects analytics on illiquid securities; OHLCV calculations may fail or produce invalid results
**Root cause:** Incomplete market data aggregation for HOSE side-listed fund shares; data source provided O/C but not H/L/V
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T07:21:41Z (signal sys-20260806T072127-34b3, system-auditor -> po, dedup_key=db_anomaly:daily_ohlcv:illiquid_ohlcv_incomplete, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained 96.97% memory, zero GC reclamation dips
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory sustained 96.89-96.97% across 105s window with zero reclamation dips, indicating loss of GC relief behavior. Free headroom 22.8MiB below 40MiB floor.
**Impact:** Sustained high memory without GC relief cycles indicates memory pressure. Continued worsening trend (96.50%→96.66%→96.97%) suggests approaching OOM threshold.
**Root cause:** rag-service load exceeds GC efficiency. Known issue: FU-RAG-DEPLOY-MEMORY.
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T08:12:38Z (signal sys-20260806T081141-4071, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service A-30 CRITICAL memory escalation 99.73%
**Severity:** CRITICAL | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container (768 MiB cap)
**Details:** Memory jumped from 96.97% to 99.73% in 5 minutes. Free headroom 2.1 MiB (below 40 MiB safety floor). Meets CRITICAL threshold (>97%). Imminent OOMKill risk.
**Impact:** Service likely to be OOMKilled within minutes. Will cause data pipeline interruption.
**Root cause:** Embedder memory pattern (FU-RAG-DEPLOY-MEMORY). Known residual with no fix yet deployed.
**Zone owner:** ops
**Last reported:** 2026-08-06T08:16:33Z (signal sys-20260806T081622-11ba, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory 97.52-97.55% sustained (no reclamation dips)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory sustained 97.54-97.55% across 6 probes (65s window) with zero reclamation dips — loss of GC relief cycles
**Impact:** rag-service embeddings pipeline at imminent OOM risk; restarts will recur without remediation
**Root cause:** Known residual FU-RAG-DEPLOY-MEMORY: embedder model load pattern causes persistent high baseline memory without GC relief cycles
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-06T09:07:38Z (signal sys-20260806T090729-27b7, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 99.69% sustained
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** docker/rag-service
**Details:** Memory at 99.69% across 6 probes (65s window), zero reclamation dips detected. VmHWM >> VmRSS pattern indicates loss of GC relief.
**Impact:** Sustained high memory with no reclamation = imminent OOMKill risk. Service may restart unexpectedly.
**Root cause:** Embedder model baseline load appears to occupy nearly full 768 MiB container memory allocation. No efficient GC recovery pattern available.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-06T12:42:13Z (signal sys-20260806T124200-5a4b, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory reclamation loss 96.32%
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container (1GiB cap)
**Details:** 6 samples over 50s, all at 96.32% with ZERO reclamation dips. GC relief pattern stalled.
**Impact:** Sustained high memory pressure on RAG service; risk of OOM if memory-consuming operation occurs
**Root cause:** rag-service embedder model baseline consuming full 1GiB cap; no GC relief pattern detected
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-06T13:17:44Z (signal sys-20260806T131735-7924, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory at 97.06% — no reclamation dip
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service
**Details:** Memory sustained at 97.06% across 6 probes (65s window) with zero reclamation dips — loss of garbage collection relief
**Impact:** Persistent high memory limits ability to handle memory spikes; may lead to OOMKill if workload increases
**Root cause:** rag-service memory cap at 1GiB insufficient for current workload; VmHWM/VmRSS indicate historical GC, now stalled
**Zone owner:** dev-core
**Last reported:** 2026-08-06T13:36:17Z (signal sys-20260806T133606-3047, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure (97.06% — no reclamation)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service
**Details:** All 6 samples at 97.06% with zero reclamation dips — memory not being freed
**Impact:** Service may OOM if load increases
**Root cause:** Memory leak in rag-service or inefficient embedding model loading
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-06T13:45:51Z (signal unknown, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory loss of reclamation (97.56% peak)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** container/rag-service
**Details:** All samples >93% with no reclamation dips — loss of reclamation detected
**Impact:** Service running at sustained high memory, unable to reclaim. Risk of OOM.
**Root cause:** Memory leak or inefficient memory usage in rag-service
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T14:13:33Z (signal sys-20260806T141322-01bc, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure CRITICAL (96.69%)
**Severity:** CRITICAL | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory usage 96.69% (990.2MiB / 1GiB) — approaching OOM risk
**Impact:** Service may become unresponsive or crash due to memory exhaustion
**Root cause:** Potential memory leak or inefficient data retention in RAG service
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-06T14:38:30Z (signal sys-20260806T143821-0c09, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 96.69%
**Severity:** CRITICAL | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory usage at 96.69% of 1GiB (990MiB), only 10MiB free — critical memory pressure
**Impact:** Service may be unstable or subject to OOMKill; performance degradation likely
**Root cause:** rag-service consuming excessive memory; possible memory leak or unbounded cache
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-06T14:43:02Z (signal sys-20260806T144250-77d3, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 96.56% — critical load, no reclamation
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory usage 96.56% of 1GiB cap (988.8MiB / 1024MiB), only 35.2MiB free — below 40MiB safety floor. Sustained high memory with zero reclamation dips detected. Repeated occurrence over multiple cycles.
**Impact:** Service at critical memory pressure; approaching OOMKill risk. Continued high load without reclamation cycles indicates potential memory leak or inefficient resource management.
**Root cause:** Known residual FU-RAG-DEPLOY-MEMORY: sentence-transformers embedder model singleton with no release path. Awaiting container rebuild with fix (commit 22232ad2b).
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-06T15:10:52Z (signal sys-20260806T151042-6d28, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-21 · mcp-server crash restarts detected (4 in 4h) — HISTORICAL-RECORD, service recovered
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** HISTORICAL (mcp-server confirmed running/healthy, RestartCount reset as of 2026-08-07 — not an active incident)
**Location:** mcp-server/restart
**Details:** 4 crash restarts within an 8-minute window (2026-08-06T12:17:27Z-12:25:04Z), corroborated via `docker inspect` (RestartCount=4, StartedAt=2026-08-06T12:25:00.296470317Z, matching the last-crash timestamp within 4 seconds)
**Impact:** Was orphaned with zero persistence anywhere (no signal_queue row, no ledger entry, no notebook line) — the analysis-only-exit spawn that surfaced it (system-auditor Tier-1, 2026-08-06T15:02-15:07Z tick) narrated its write loop instead of executing it. Root-caused as occurrence 4 of FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING.
**Root cause:** mcp-server-side crash cause unconfirmed (window has since closed); the write-loop loss is the tracked defect, not a live mcp-server health question.
**Zone owner:** dev-mcp-server
**CORRECTION (this row, 2026-08-07):** the prior version of this row cited signal `sys-20260806T154111-1649` — that id does not exist in `.signal_queue.rows[]` and no dedup-ledger entry was ever written for it (fabricated citation, commit `646229cef0`, same narrate-vs-persist class this fix closes). Re-emitted for real via the E-3 actuator (`scripts/emit-audit-signal.sh --e3-only`) as AC-4 of FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING: **Last reported:** 2026-08-07T01:52:18Z (signal `sys-20260807T015218-7a6a`, system-auditor -> po, type=signal_feedback, e3-only — historical backfill, no Telegram sent by design).
**Mitigation:** None due — historical-record repair only.

---

## Anomaly: A-30 · rag-service memory floor-breach: 98.79% (12 MiB free)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container (1024 MiB cap)
**Details:** rag-service: 98.79% memory usage (1012 MiB / 1024 MiB) — only 12 MiB free headroom remaining
**Impact:** rag-service nearing OOM kill; any additional memory allocation may trigger restart. Absolute headroom floor of 40 MiB breached per FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY.
**Root cause:** Embedder model singleton at ~700 MiB baseline (no release path); compaction/optimize() burst can consume ~20 MiB. Tracked by FU-RAG-DEPLOY-MEMORY (capacity/cap decision) and FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP (compaction failure path).
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T17:15:20Z (signal sys-20260806T171507-1243, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30-floor-breach, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service floor-breach: 97.76% mem
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory 97.76% of 1024MiB (22.9MiB free) breaches 40MiB absolute floor
**Impact:** Service at risk of OOMKill if additional memory pressure occurs
**Root cause:** Persistent high memory footprint, insufficient headroom for buffer/cache
**Zone owner:** dev-ml-service
**Last reported:** 2026-08-06T17:43:46Z (signal sys-20260806T174128-477d, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30-floor-breach, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory floor breach (98.20%, 18.4MiB-free)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service
**Details:** Memory pressure at 98.20% with only 18.4MiB free, below floor threshold of 40MiB
**Impact:** High memory pressure may trigger OOM events or service degradation
**Root cause:** RAG service memory growth / insufficient allocation
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T21:10:19Z (signal sys-20260806T211009-070b, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30-floor-breach, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory 98.83% — below floor (11.8 MiB free)
**Severity:** WARN | **Date:** 2026-08-06 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory usage at 98.83% of 1GiB cap with only 11.8 MiB free, below the 40 MiB enforced floor threshold
**Impact:** Risk of OOM if memory usage increases; container may crash if allocation burst occurs
**Root cause:** Embedder model singleton with no release path occupies ~700 MiB baseline; compaction failure-path documented at ~20 MiB burst
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-06T23:35:39Z (signal sys-20260806T233530-1713, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory floor-breach
**Severity:** WARN | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** rag-service container
**Details:** rag-service at 99.58% of 1GiB cap (1020 MiB), only 4 MiB free; below 40 MiB floor threshold
**Impact:** Tight memory headroom may constrain growth; no immediate crash risk (OOMKilled=false, service stable)
**Root cause:** rag-service allocated 1GiB cap at deployment; requires capacity planning/upgrade
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-07T00:47:57Z (signal sys-20260807T004739-68e2, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30-floor-breach, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure — 97.90% of cap, 21.5MiB free
**Severity:** WARN | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** container/rag-service
**Details:** rag-service container memory usage at 97.90% of its configured capacity with only 21.5MiB free headroom, below the 40MiB floor threshold
**Impact:** High memory pressure indicates risk of OOM (Out Of Memory) condition; container may be unable to allocate memory for emergency operations or workload spikes
**Root cause:** rag-service likely performing extensive embedding model operations or accumulating cached data without sufficient garbage collection
**Zone owner:** ops
**Last reported:** 2026-08-07T01:55:34Z (signal sys-20260807T015525-3080, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-04 · financial_reports: 30 low-confidence extractions in 7d (threshold ≤ 5)
**Severity:** WARN | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** market.db/financial_reports
**Details:** 30 records with extraction_confidence < 0.2 in 7-day window
**Impact:** High noise in extraction pipeline, may require retraining
**Root cause:** OCR/extraction model degradation or mislabeled documents
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-07T03:06:54Z (signal sys-20260807T030558-798f, system-auditor -> po, dedup_key=db_integrity_breach:financial_reports:C-04, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-08 · alerts: 1 orphaned row with no agent_signals (threshold = 0)
**Severity:** WARN | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** market.db/alerts
**Details:** 1 alert with no corresponding agent_signals co-write in 2-hour window
**Impact:** Alert co-write gap or timing issue, may lose signal context
**Root cause:** Alert trigger write not paired with signal co-write
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-07T03:06:55Z (signal sys-20260807T030600-3171, system-auditor -> po, dedup_key=db_integrity_breach:alerts:C-08, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-09 · macro_indicators: stale data (last fetch 2026-08-04 12:13)
**Severity:** WARN | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** market.db/macro_indicators
**Details:** No vietnam macro_indicators rows in 26-hour window (expected ≥3 indicators)
**Impact:** Macro economic data unavailable for signals/analysis
**Root cause:** TradingEconomics API fetch gap or scheduler miss
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-07T03:06:55Z (signal sys-20260807T030603-1e90, system-auditor -> po, dedup_key=db_integrity_breach:macro_indicators:C-09, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30-RAG-SERVICE-ESCALATE · rag-service memory loss-of-reclamation
**Severity:** CRITICAL | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** rag-service container
**Details:** verify-a30 probe: all 12 samples 99.62-99.81%, zero reclamation dips, loss of GC
**Impact:** rag-service at critical memory pressure, risk of OOMKill
**Root cause:** sustained memory allocation without effective garbage collection recovery
**Zone owner:** ops
**Last reported:** 2026-08-07T04:04:16Z (signal sys-20260807T040402-69e8, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30-loss-of-reclamation, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory 99.44%–99.64% sustained (loss of reclamation)
**Severity:** WARN | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory sustained 99.41%–99.64% across 2×65s windows with ZERO reclamation dips. A-30 discriminator verdict: ESCALATE (loss of reclamation). OOMKilled=false, but container teetering at 1 GiB limit. Previous reclamation proved possible (VmHWM=1121MiB) but currently lost.
**Impact:** Service memory pressure increasing; risk of OOMKill if workload increases. Affects rag-service embeddings capability.
**Root cause:** Memory leak or sustained high allocation in rag-service embeddings model. Needs investigation into model loading/usage patterns.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-07T04:50:17Z (signal sys-20260807T044935-3bf0, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30-RAG-SERVICE · rag-service memory: loss of reclamation (99.55%, 4.9MiB free)
**Severity:** WARN | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** host/rag-service
**Details:** All 12 samples over 275s at >99.3% with zero downward reclamation dips — confirms genuine memory pressure, not GC sawtooth. VmHWM >> VmRSS but stuck high.
**Impact:** Container approaching OOM threshold; further memory allocation bursts could trigger OOMKilled. ACK entry now below 40MiB floor (MEM_FLOOR_MIB threshold).
**Root cause:** rag-service embedder model singleton holds ~700MiB baseline with no release path; under capacity constraint with FU-RAG-DEPLOY-MEMORY tracking the fix.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-07T05:21:25Z (signal sys-20260807T052117-0aa8, system-auditor -> po, dedup_key=memory_pressure:rag-service:A-30-loss-of-reclamation, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · mcp-server memory reclamation loss at 98.75% peak
**Severity:** CRITICAL | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** mcp-server container
**Details:** Multi-probe A-30 discriminator: 6 samples over 65s window, all >97.95%, zero reclamation dips. Sustained loss of reclamation at >97% indicates imminent OOM risk.
**Impact:** Imminent out-of-memory risk on core data pipeline service
**Root cause:** Memory leak or allocation bloat in mcp-server code (FIX-MCP-MEMORY-CODE-LEAK)
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-07T05:48:32Z (signal sys-20260807T054825-771b, system-auditor -> po, dedup_key=memory_pressure:mcp-server:A-30-loss-of-reclamation, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory reclamation loss (99.24% sustained)
**Severity:** CRITICAL | **Date:** 2026-08-07 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory pressure sustained at 99.24% (1016MiB / 1GiB) with zero reclamation dips over 30s window — loss-of-reclamation pattern persists, VmHWM indicates prior reclamation possible but currently stuck high
**Impact:** Service approaching OOM condition; risk of uncontrolled termination; data pipeline continuity at risk
**Root cause:** rag-service deployed with insufficient memory allocation for current workload; memory not being reclaimed during GC cycles
**Zone owner:** dev-platform
**Last reported:** 2026-08-07T06:09:39Z (signal sys-20260807T060932-6536, system-auditor -> po, dedup_key=memory_pressure:rag-service:A-30-loss-of-reclamation, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory not reclaimed (96.24%, no GC dip)
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service
**Details:** Multi-probe discriminator over 65s window: all 6 samples at 96.24% with zero reclamation dips. Memory pressure sustained, not released.
**Impact:** rag-service cannot reclaim memory under load. Risk of OOMKilled if trend continues.
**Root cause:** Possible application memory leak or inefficient GC tuning for rag-service container.
**Zone owner:** developer
**Last reported:** 2026-08-08T06:06:01Z (signal sys-20260808T060541-213e, system-auditor -> po, dedup_key=microservice_memory_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: C-06 · market_messages stale (0 in 3h)
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** market.db/market_messages
**Details:** No messages recorded in 3-hour window during VN trading hours
**Impact:** Missing intraday market data feed
**Root cause:** Message ingestion/collection pipeline offline or blocked
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-08T06:25:09Z (signal sys-20260808T062503-66c2, system-auditor -> po, dedup_key=db_freshness_breach:market_messages:C-06, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 96.24%
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service
**Details:** Memory usage 985.5MiB / 1GiB (96.24% of cap)
**Impact:** High memory pressure may cause performance degradation
**Root cause:** rag-service embedder singleton, 768MiB cap, no release path (FU-RAG-DEPLOY-MEMORY)
**Zone owner:** apps/rag-service
**Last reported:** 2026-08-08T06:35:49Z (signal 10496, system-auditor -> po, dedup_key=microservice_memory_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** docker-host/rag-service
**Details:** Memory sustained at 96.32% with no reclamation dip
**Impact:** Service may face OOM if memory pressure increases
**Root cause:** (not yet determined)
**Zone owner:** ops
**Last reported:** 2026-08-08T07:36:31Z (signal sys-20260808T073615-7c33, system-auditor -> po, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory 96.43% sustained (no reclamation dip)
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory sustained at 96.43% (987.4MiB / 1GiB) with no reclamation dip over 65-second probe window. Free memory 36.6 MiB, below 40 MiB floor threshold.
**Impact:** Service at critical memory margin; risk of OOM kill if usage spikes. Loss of reclamation capability indicates memory leak or inefficient usage.
**Root cause:** RAG service embedding model loads with no release path; sentence-transformers model singleton retention
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-08T08:08:32Z (signal sys-20260808T080747-14bb, system-auditor -> po, dedup_key=microservice_memory_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service-1 post-idle-unload-fix: 77.98% memory (idle-unload firing)
**Severity:** INFO | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service container
**Details:** rag-service-1 memory at 77.98% (798.5MiB / 1GiB cap) after restart 2026-08-08T08:11:45Z. Container logs confirm idle-unload mechanism is active: 'Embedding model unloaded after 910s idle (threshold=900s)'.
**Impact:** Container memory below investigate-gate (85%); idle-unload fix is deployed and functioning. No immediate escalation needed.
**Root cause:** Post-deployment monitoring: idle-unload fix (commit 0308514f5) is active and working as designed. Lower reading reflects fresh restart post-fix deployment.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-08T08:35:03Z (signal sys-20260808T083446-4705, system-auditor -> po, dedup_key=memory_pressure:rag-service:A-30-post-fix-monitoring, INFO Telegram sent)
**Mitigation:** Converging to existing task OPS-RAG-SERVICE-REBUILD-STALE-IMAGE-PREDATES-IDLE-UNLOAD-FIX (REVIEW, next_agent=qa). AC-3 (measured reclamation) remains open; methodology gap tracked separately (FIX-RECLAMATION-AC-VERIFIED-IN-COLDSTART-WINDOW-BEFORE-WORKLOAD-LOADS, BACKLOG).

---

## Anomaly: A-30 · rag-service-1 memory 97.01% sustained (below 40MiB floor)
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service-1/memory
**Details:** rag-service-1 memory at 97.01% of 1GiB cap (usage: 993.4MiB) — absolute headroom 6.6 MiB BELOW 40 MiB floor. Sustained high-memory ceiling, recurring issue (4th+ occurrence).
**Impact:** Imminent OOM kill risk. Service near out-of-memory threshold with no reclamation headroom.
**Root cause:** Code memory leak or inefficient memory usage in rag-service-1. Recurring ceiling despite fix attempts.
**Zone owner:** po
**Last reported:** 2026-08-08T09:35:51Z (signal sys-20260808T093529-7c80, system-auditor -> po, dedup_key=mem_pressure:rag-service:A-30-recurring-ceiling, WARN Telegram sent)
**Mitigation:** Monitor for OOM kill; escalate to developer/architect for code-level memory audit and fix.

---

## Anomaly: A-30 · Memory pressure escalation — rag-service BELOW-FLOOR
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service
**Details:** rag-service-1 at 98.53% (1009MiB/1GiB), free headroom 15MiB below critical floor of 40MiB
**Impact:** Approaching OOM risk; tight headroom may not sustain GC cycles
**Root cause:** Embedder model singleton holds ~700MiB baseline per FU-RAG-DEPLOY-MEMORY
**Zone owner:** developer
**Last reported:** 2026-08-08T11:06:15Z (signal sys-20260808T110556-3c5d, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30:BELOW-FLOOR, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · Memory pressure — pdf-extractor WARN threshold
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** pdf-extractor
**Details:** pdf-extractor-1 at 86.36% (2159MiB/2.5GiB), just breached WARN threshold
**Impact:** Elevated memory pressure; monitor for further escalation
**Root cause:** OCR workload (Tesseract) with transient peaks during PDF processing
**Zone owner:** developer
**Last reported:** 2026-08-08T11:06:19Z (signal sys-20260808T110605-1ad6, system-auditor -> po, dedup_key=microservice_degraded:pdf-extractor:A-30:WARN-THRESHOLD, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure — 98.71%
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service
**Details:** Memory usage 1011 MiB / 1 GiB (98.71%) — sustained incident since 2026-08-07T03:35:32Z. Free headroom ~13 MiB, below critical floor.
**Impact:** Container approaching OOM limit. Risk of service degradation or forced restart.
**Root cause:** FU-RAG-DEPLOY-MEMORY memory cap enforcement in place. Current tight headroom reflects deployment state.
**Zone owner:** developer
**Last reported:** 2026-08-08T13:09:17Z (signal sys-20260808T130859-7527, system-auditor -> po, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 98.68% of 1GiB cap
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service container
**Details:** rag-service container at 98.68% (1010MiB / 1GiB) with critically low free headroom (~13MiB available, 40MiB floor breach). Service is healthy (no OOMKilled, no crash restarts) but operating at sustained critical memory pressure.
**Impact:** Container approaching OOM condition; any minor memory spike could trigger OOMKilled eviction.
**Root cause:** FU-RAG-DEPLOY-MEMORY deployment completed; tight headroom reflects memory-cap enforcement during transition to production constraints. Incident is tracked and monitored.
**Zone owner:** po
**Last reported:** 2026-08-08T13:36:50Z (signal sys-20260808T133635-432b, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · mcp-server memory reclamation loss — VmHWM at cap
**Severity:** CRITICAL | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** mcp-server container
**Details:** Memory 89.69% (2.691GiB/3GiB), VmHWM advancing and pinned at cgroup limit; no genuine reclamation dips during probe window
**Impact:** Process approaching OOMKilled boundary; cap exhaustion possible if workload sustains
**Root cause:** FIX-MCP-MEMORY-CODE-LEAK — recurring memory leak, accumulates ~87% in 12h
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-08T14:06:36Z (signal sys-20260808T140623-62a6, system-auditor -> po, dedup_key=microservice_degraded:mcp-server:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory ceiling breach — 96.91% utilization
**Severity:** CRITICAL | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory 992.4MiB/1GiB (96.91%) — BELOW floor (floor=40MiB-free, actual ~7MiB)
**Impact:** Embedder singleton at capacity; vulnerability to OOM on workload spike
**Root cause:** Known recurring: FU-RAG-DEPLOY-MEMORY — embedder singleton, 768MiB cap, no release path
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-08T14:06:37Z (signal sys-20260808T140625-7343, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-06 · bctc-discover VPS stale 101h30m
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** vps/bctc-discover
**Details:** BCTC VPS last push 2026-08-04T08:34:40Z — 101h30m stale
**Impact:** BCTC earnings reports delayed beyond seasonal quota window
**Root cause:** VPS connection down or batch processing halted (not yet diagnosed)
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-08T14:21:25Z (signal sys-20260808T142113-654c, system-auditor -> po, dedup_key=vps_proxy_stale:bctc-discover:B-06, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · bctcReparseJob stale: 57.1% success rate
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** cron/bctcReparseJob
**Details:** bctcReparseJob success rate 57.1% (3 failures out of 7 runs)
**Impact:** Slow BCTC PDF reparse pipeline, potential backlog in enrichment
**Root cause:** Job process instability or resource contention (not yet diagnosed)
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-08T14:21:26Z (signal sys-20260808T142115-1b11, system-auditor -> po, dedup_key=cron_fire_gap:bctcReparseJob:A-29, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · mcp-server-1 memory sustained high (96.84%) with VmHWM advancing
**Severity:** CRITICAL | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** mcp-server-1/memory
**Details:** Sustained 96.84% memory usage (2.905GiB / 3GiB) over 65s probe window with VmHWM advancing from 3052552kB to 3056472kB, pinned at 97.8% of cgroup limit. Median 96.75%, peak 97.43%.
**Impact:** Memory approaching OOM threshold; service may crash or experience severe performance degradation; possible memory leak indicated by VmHWM climbing toward cap
**Root cause:** Possible code memory leak in mcp-server or sustained high-load workload; known issue FU-RAG-DEPLOY-MEMORY tracked status as of 2026-07-29
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-08T16:08:32Z (signal sys-20260808T160824-23c9, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-mcp-server-1:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service-1 sustained memory pressure
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory usage 99.66% sustained high over 65s window (6 probes). Zero reclamation dips. Verdict: ESCALATE (loss of reclamation).
**Impact:** Container memory pressure sustained; no immediate OOMKill or restart, but reclamation mechanism absent.
**Root cause:** Chronic pattern spanning 4 days (11 signals), no durable fix in flight. Likely memory leak or sustained load.
**Zone owner:** infra
**Last reported:** 2026-08-08T17:39:06Z (signal sys-20260808T173849-2d4b, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · vn-market-intelligence-mcp-rag-service-1: 99.72% memory, BELOW-FLOOR
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Container memory usage at 99.72% sustained (99.72% for 65 seconds across 6 probes). Free memory 2.9MiB falls below 40MiB floor threshold. Zero reclamation dips observed.
**Impact:** Service approaching OOM event. Chronic pattern since 2026-08-05 with 11+ distinct ledger entries. Risk of unexpected termination or performance degradation.
**Root cause:** Unknown — memory pressure persists despite no crashes or OOMKilled events. Possible memory leak or accumulating cache.
**Zone owner:** dev-team
**Last reported:** 2026-08-08T18:06:17Z (signal sys-20260808T180600-2ee6, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30:BELOW-FLOOR, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory loss of reclamation
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Deep-probe ESCALATE verdict: 97.41% sustained (all 6 samples identical), 0 reclamation dips, 0 discontinuities, no state changes, no OOMKilled. Container has lost ability to reclaim memory.
**Impact:** Container memory usage is stuck at 97.41% of its 768 MiB limit (26.7 MiB free, BELOW 40 MiB floor). Sustained pressure may lead to future OOM events or performance degradation.
**Root cause:** Loss of reclamation (dip-jitter no longer vetoes this evidence). Stable sustained-high memory, not a crash-cliff (no crash-cliff discriminators present: state_changed=false, oom_killed=false, no discontinuities, vmhwm not advancing).
**Zone owner:** infrastructure
**Last reported:** 2026-08-08T19:36:49Z (signal sys-20260808T193630-348e, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure — sustained >93%
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory usage sustained at 97.50% (6 consecutive samples), below 40MiB floor threshold
**Impact:** Container approaching memory limit; OOM risk if usage continues; may trigger eviction or restart
**Root cause:** Possible memory leak or unbounded buffer growth in rag-service
**Zone owner:** infrastructure
**Last reported:** 2026-08-08T20:12:37Z (signal sys-20260808T201216-7780, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service: sustained high memory 93.82% — loss of reclamation
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory usage steady at 93.82% across 6 probes (65s window), sustained high threshold exceeded
**Impact:** Container at memory limit; risk of OOM kill if workload spikes
**Root cause:** RAG service persistent high memory demand; insufficient headroom for reclamation
**Zone owner:** infrastructure
**Last reported:** 2026-08-08T22:41:07Z (signal sys-20260808T224058-0a62, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service-1 memory pressure sustained high
**Severity:** WARN | **Date:** 2026-08-08 | **Status:** OPEN
**Location:** rag-service-1
**Details:** rag-service-1 sustained memory usage at 93.85% across 6 samples (65s window), VmHWM pinned at cap
**Impact:** Memory pressure may lead to degradation or OOM scenarios
**Root cause:** Memory-intensive processing consuming available heap
**Zone owner:** ops-lead
**Last reported:** 2026-08-08T23:06:33Z (signal sys-20260808T230606-5539, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure escalation
**Severity:** WARN | **Date:** 2026-08-09 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** All 6 memory samples sustained >93% (min 99.10%, median 99.10%) over 65-second window. No reclamation dips or discontinuities detected.
**Impact:** rag-service container is under severe sustained memory pressure, at or beyond practical limits for stable operation.
**Root cause:** Embedder model allocations not fully reclaimed after inference cycles (structural load pattern).
**Zone owner:** system-owner
**Last reported:** 2026-08-09T00:08:15Z (signal sys-20260809T000759-1bd3, system-auditor -> po, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service A-30 memory pressure ESCALATE
**Severity:** CRITICAL | **Date:** 2026-08-09 | **Status:** OPEN
**Location:** rag-service
**Details:** Memory sustained at 95.41% (min=95.42% max=95.42% median=95.42%) — loss of reclamation observed
**Impact:** Container approaching OOM, potential service degradation or restart
**Root cause:** Process memory growth or memory leak in rag-service
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-09T03:36:07Z (signal sys-20260809T033559-177a, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained high memory 97.50%
**Severity:** CRITICAL | **Date:** 2026-08-09 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory at 97.50% of 1GB cgroup limit, all samples sustained >93% (median 97.50%), loss of reclamation
**Impact:** Container under sustained memory pressure; risk of OOM if usage increases further
**Root cause:** FU-RAG-DEPLOY-MEMORY tracked deployment completed (cap 768m→1g); open structural issue is FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH (embedder singleton has no unload path)
**Zone owner:** developer-team
**Last reported:** 2026-08-09T04:11:23Z (signal sys-20260809T041110-2b0a, system-auditor -> po, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure 96.92% sustained
**Severity:** WARN | **Date:** 2026-08-09 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory sustained at 96.92% (>93% threshold) with no reclamation dips observed
**Impact:** Service memory pressure may affect performance; watch for OOM events
**Root cause:** Embedder singleton has no unload path (FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH P2)
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-09T05:06:16Z (signal sys-20260809T050602-15df, system-auditor -> po, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained high memory
**Severity:** WARN | **Date:** 2026-08-09 | **Status:** OPEN
**Location:** rag-service container
**Details:** All 6 samples sustained at 94.13% (>93% threshold), 0 reclamation dips, 0 discontinuities
**Impact:** Container operating near OOM boundary, reduced headroom for temporary spikes
**Root cause:** FIX-RAG-EMBEDDER-IDLE-UNLOAD-PATH (P2, backlog) — embedder singleton has no unload path
**Zone owner:** ops
**Last reported:** 2026-08-09T05:36:35Z (signal sys-20260809T053619-38ad, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory sustained high >93%
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** rag-service memory floor sustained at 96.78% across all 6 deep-probe samples (no reclamation dips, no discontinuities)
**Impact:** Sustained high memory may indicate memory leak or insufficient headroom for garbage collection cycles
**Root cause:** rag-service memory consumption pattern shows sustained floor without expected reclamation; prior STALE-ACK FU-RAG-DEPLOY-MEMORY now reopened
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T12:13:35Z (signal sys-20260811T121235-33fd, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-13 · bctc_vps_queue: 4 stale pending items >72h
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** market.db/bctc_vps_queue
**Details:** 4 BCTC queue items stuck in pending status for >72 hours
**Impact:** Queue backlog may grow; stalled rows may never be processed
**Root cause:** Potential extraction pipeline stall or zombie rows
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T12:18:34Z (signal sys-20260811T121737-2a33, system-auditor -> po, dedup_key=data_stale:bctc_vps_queue:B-13, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · Cron fire-gap: 8 stale, 1 missed of 90 total
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** scheduler/cron
**Details:** 8 stale and 1 missed scheduled jobs detected in cron status endpoint
**Impact:** Service degradation or scheduler lag; affected: vpsProxyWatchdog, taAlertScan, bbAlertScan, taAlertNotifier, priceUpdateWatchdog, vnIndexRefresh, monthlySignalQualityAudit, brokerSanctionsSweep, ragFtsRebuildCron
**Root cause:** Cron jobs falling behind cadence thresholds
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T12:18:35Z (signal sys-20260811T121748-5da0, system-auditor -> po, dedup_key=auditor-a29-fire-gap:tier2-stale, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor memory sustained high
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** pdf-extractor:5001
**Details:** Container sustained at 94.07% memory with zero reclamation dips and VmHWM pinned at cgroup cap
**Impact:** Potential OOM risk if memory demand increases; container unable to reclaim under current load
**Root cause:** High-volume PDF processing accumulation without garbage collection
**Zone owner:** developer
**Last reported:** 2026-08-11T12:36:38Z (signal sys-20260811T123620-4a36, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · bctcReparseJob cron LATE
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron scheduler
**Details:** bctcReparseJob status=LATE per /api/cron-status endpoint
**Impact:** BCTC data reparse cycle may be delayed or missed
**Root cause:** Requires manual investigation — check mcp-server logs and reschedule if needed
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T14:30:02Z (signal sys-20260811T142947-1be1, system-auditor -> po, dedup_key=auditor-a29-fire-gap:bctcReparseJob, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-01 · pipeline-health endpoint unreachable
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** mcp-server HTTP API
**Details:** GET /api/pipeline-health returned connection refused or timeout
**Impact:** Cannot assess per-source data fetch freshness; data pipeline observability lost
**Root cause:** mcp-server service health issue or network connectivity problem
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T14:30:03Z (signal sys-20260811T142949-41ca, system-auditor -> po, dedup_key=endpoint_unreachable:pipeline-health:B-01, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor memory reclamation loss
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** pdf-extractor container
**Details:** Container sustained 96.83% memory utilization across all 6 probes (65s window). VmHWM pinned at cgroup limit with zero reclamation capacity.
**Impact:** Continued pressure on pdf-extraction performance; risk of OOM under spike load.
**Root cause:** Unknown — investigate PDF processing workload or model state bloat.
**Zone owner:** pdf-extraction
**Last reported:** 2026-08-11T15:06:30Z (signal sys-20260811T150558-065d, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor sustained high memory
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-pdf-extractor-1
**Details:** Container memory sustained at 97-98% with zero reclamation capacity; VmHWM pinned at cgroup limit
**Impact:** Risk of OOMKill; reduced headroom for temporary memory spikes
**Root cause:** pdf-extractor container memory limit insufficient for current workload
**Zone owner:** developer
**Last reported:** 2026-08-11T15:38:13Z (signal sys-20260811T153755-3968, system-auditor -> po, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor: sustained 97.29% memory, loss of reclamation
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-pdf-extractor-1
**Details:** MemPerc sustained at 97.29% (min 97.16%, median 97.29%) over 65s observation window. Zero reclamation dips, VmHWM pinned at cgroup limit (2587640/2621440 KB), no discontinuities or state changes. Unable to free memory despite high pressure.
**Impact:** Container cannot reclaim memory; sustained high pressure may lead to OOMKilled or performance degradation.
**Root cause:** Possible memory leak or accumulating buffers in pdf-extractor service; workload exceeds available container memory.
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T16:06:59Z (signal sys-20260811T160638-24f0, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service: 99.44% memory CRITICAL, BELOW-FLOOR
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** MemPerc at 99.44% with only 5.7MiB free (BELOW floor threshold of 40MiB). Essentially at cgroup memory limit with zero headroom for allocation spikes.
**Impact:** Imminent risk of OOMKilled event or service stalls. Memory allocations may fail. System stability at risk.
**Root cause:** Rag-service memory usage exceeds container allocation; possible uncontrolled memory growth or insufficient container memory limit.
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T16:07:06Z (signal sys-20260811T160649-462a, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor sustained high memory
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** pdf-extractor
**Details:** Baseline 96.91% >= 85% investigate-gate. All 6 samples sustained >93%: min=96.96%, median=96.96%, max=97.41%. Zero reclamation dips.
**Impact:** Memory pressure limits capacity; risk of allocation failures under load
**Root cause:** Sustained memory consumption with no GC relief gaps; loss of reclamation capacity
**Zone owner:** dev-pdf-extractor
**Last reported:** 2026-08-11T16:38:09Z (signal sys-20260811T163752-1792, system-auditor -> po, dedup_key=microservice_degraded:pdf-extractor:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor memory sustained high >93%
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-pdf-extractor-1
**Details:** Memory pressure sustained at >93% across 6 probes (min=94.90%, median=94.90%, max=95.25%)
**Impact:** PDF extraction operations may be rate-limited or degraded due to memory pressure
**Root cause:** pdf-extractor workload memory footprint at cgroup limit, loss of reclamation headroom
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T17:06:02Z (signal sys-20260811T170554-3b8d, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor sustained high memory (95.19%-95.89%)
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** pdf-extractor service
**Details:** Container running at sustained high memory with no reclamation capability; VmHWM pinned at 2587640 KB (98.7% of 2621440 KB limit)
**Impact:** PDF extraction tasks may fail or experience severe latency under memory pressure
**Root cause:** PDF processing workload consuming memory at or near cgroup limit; possible memory leak in pdf-extractor or OCR library
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T17:40:53Z (signal sys-20260811T174020-7025, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor memory pressure — sustained 95%+ loss of reclamation
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** pdf-extractor container
**Details:** pdf-extractor baseline 95.91%, all 6 probes >93%. Loss of reclamation pattern (small dips 97.74→95.20, 97.78→95.19 insufficient to recover headroom). VmHWM pinned at 2587/2620 MB.
**Impact:** Container unable to free memory despite GC activity. Indicates memory leak or workload requiring larger allocation.
**Root cause:** Possible memory leak in pdf-extractor service or workload allocation underestimated.
**Zone owner:** dev-pdf-extractor
**Last reported:** 2026-08-11T18:16:29Z (signal sys-20260811T181602-0de9, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory BELOW-FLOOR 99.58% — resource exhaustion
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** rag-service container
**Details:** rag-service baseline 99.58%, all 6 probes flat at 99.58%. Zero reclamation dips. Host-side floor gate (MEM_FLOOR=40MiB) triggered during probe. VmHWM UNAVAILABLE due to host headroom < 40MiB.
**Impact:** Container at absolute maximum capacity with zero flexibility for operational variance. Risk of OOM kill or service instability. Critical resource exhaustion.
**Root cause:** Host memory constrained. Container allocation or workload requires larger memory pool.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-11T18:16:30Z (signal sys-20260811T181604-0404, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · vpsProxyWatchdog stale 9.5h
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/watchdog
**Details:** vpsProxyWatchdog last fired 2026-08-11 08:50:00, 9.5h overdue (threshold 0.3h)
**Impact:** Watchdog not monitoring VPS proxy health — anomalies may go undetected
**Root cause:** Cron scheduler issue or job infrastructure failure
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:23:42Z (signal sys-20260811T182200-3071, system-auditor -> po, dedup_key=auditor-a29-fire-gap:vpsProxyWatchdog, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · taAlertScan MISSED 2625.6h
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/alerts
**Details:** taAlertScan last fired 2026-04-24 08:45:00 (104+ days overdue)
**Impact:** Technical analysis alert scanning completely stalled
**Root cause:** Job infrastructure failure or disabled cron
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:23:44Z (signal sys-20260811T182212-2cf9, system-auditor -> po, dedup_key=auditor-a29-fire-gap:taAlertScan, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · bbAlertScan MISSED 2625.6h
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/alerts
**Details:** bbAlertScan last fired 2026-04-24 08:45:00 (104+ days overdue)
**Impact:** Bulletin board alert scanning completely stalled
**Root cause:** Job infrastructure failure or disabled cron
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:23:48Z (signal sys-20260811T182214-22a0, system-auditor -> po, dedup_key=auditor-a29-fire-gap:bbAlertScan, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · taAlertNotifier stale 9.6h
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/notifications
**Details:** taAlertNotifier last fired 2026-08-11 08:45:01, 9.6h overdue (threshold 0.4h)
**Impact:** TA alert notifications not being sent
**Root cause:** Cron scheduler issue or job infrastructure failure
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:23:59Z (signal sys-20260811T182226-798c, system-auditor -> po, dedup_key=auditor-a29-fire-gap:taAlertNotifier, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · priceUpdateWatchdog stale 9.5h
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/watchdog
**Details:** priceUpdateWatchdog last fired 2026-08-11 08:50:00, 9.5h overdue (threshold 0.3h)
**Impact:** Price update watchdog not monitoring feed — stale data may go unnoticed
**Root cause:** Cron scheduler issue or job infrastructure failure
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:24:02Z (signal sys-20260811T182228-0310, system-auditor -> po, dedup_key=auditor-a29-fire-gap:priceUpdateWatchdog, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · vnIndexRefresh stale 9.4h
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/indexing
**Details:** vnIndexRefresh last fired 2026-08-11 08:55:00, 9.4h overdue (threshold 0.1h)
**Impact:** VN index not being refreshed — data stale by 9+ hours
**Root cause:** Cron scheduler issue or job infrastructure failure
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:24:04Z (signal sys-20260811T182231-76d5, system-auditor -> po, dedup_key=auditor-a29-fire-gap:vnIndexRefresh, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · brokerSanctionsSweep stale 274.4h
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/data
**Details:** brokerSanctionsSweep last fired 2026-07-31 08:00:01, 274.4h overdue (threshold 36h)
**Impact:** Broker sanctions data not being updated — potential stale regulatory info
**Root cause:** Scheduled maintenance or cron configuration issue
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:24:16Z (signal sys-20260811T182245-5113, system-auditor -> po, dedup_key=auditor-a29-fire-gap:brokerSanctionsSweep, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · ragFtsRebuildCron stale 526.1h
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/maintenance
**Details:** ragFtsRebuildCron last fired 2026-07-20 20:15:01, 526.1h overdue (threshold 36h)
**Impact:** RAG FTS index not being rebuilt — search performance may degrade
**Root cause:** Maintenance window or cron scheduler issue
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T18:24:22Z (signal sys-20260811T182247-117e, system-auditor -> po, dedup_key=auditor-a29-fire-gap:ragFtsRebuildCron, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · vpsProxyWatchdog overdue 13.5h
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/vpsProxyWatchdog
**Details:** Last fire 2026-08-11 08:50:00, overdue by 13.5h (expected 0.3h)
**Impact:** VPS proxy watchdog not running, risks missed VPS service failures
**Root cause:** Cron service stalled or misconfigured
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T22:21:25Z (signal sys-20260811T222026-3bae, system-auditor -> po, dedup_key=auditor-a29-fire-gap:vpsProxyWatchdog, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · taAlertScan severely overdue 2629.6h
**Severity:** CRITICAL | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/taAlertScan
**Details:** Last fire 2026-04-24 08:45:00, overdue by 2629.6h (expected 0.4h)
**Impact:** TA alert scanning not running since April, risks missed technical alerts
**Root cause:** Cron service died, never restarted
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T22:21:26Z (signal sys-20260811T222037-4363, system-auditor -> po, dedup_key=auditor-a29-fire-gap:taAlertScan, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · bctcReparseJob late 32.3h
**Severity:** WARN | **Date:** 2026-08-11 | **Status:** OPEN
**Location:** cron/bctcReparseJob
**Details:** Last fire 2026-08-10 14:00:02, late by 32.3h (threshold 36h)
**Impact:** BCTC reparse job delayed, risks stale BCTC data
**Root cause:** Cron delayed or queue backed up
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-11T22:21:26Z (signal sys-20260811T222039-760f, system-auditor -> po, dedup_key=auditor-a29-fire-gap:bctcReparseJob, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service critical memory escalation (99.33% sustained)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** A-30 deep-probe: ESCALATE verdict — all 6 samples sustained 99.33-99.34% with zero reclamation dips. Container at critical capacity with host headroom below 40MiB floor (26.6MiB free, BELOW-FLOOR).
**Impact:** Container operating at memory ceiling with no safety buffer. Risk of OOMKilled state if load increases. Previous cycle had incomplete probe (deferred); this cycle shows complete data with sustained high memory.
**Root cause:** rag-service memory design sustained at >99% utilization; escalation from 86.59% in prior cycle (c41). Dedup-skipped prior alert still applies; this represents NEW escalation crossing floor threshold.
**Zone owner:** devops
**Last reported:** 2026-08-12T00:10:39Z (signal sys-20260812T000945-5619, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service — sustained high memory 94.25%, loss of reclamation
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Deep-probe ESCALATE verdict: all 6 samples sustained at 94.25%, no reclamation occurring
**Impact:** rag-service memory pressure sustained above 93% without reclamation
**Root cause:** Ongoing memory pressure exceeding garbage collection reclamation rate
**Zone owner:** developer
**Last reported:** 2026-08-12T00:36:15Z (signal sys-20260812T003601-7b74, system-auditor -> po, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained memory pressure
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** rag-service
**Details:** 6-sample deep-probe shows all 6 samples at 98.73% memory utilization (sustained high). Container has 12 restarts and was restarted 50 minutes ago. No OOMKilled event detected. VmHWM data unavailable due to host headroom below 40MiB threshold.
**Impact:** Sustained high memory utilization without reclamation dips indicates memory pressure. Container is approaching cgroup limit. Risk of OOM if pattern continues.
**Root cause:** Memory-intensive operations or memory leak in rag-service. Possible accumulation during retrieval operations.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-12T01:07:49Z (signal sys-20260812T010727-7f75, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · bctcReparseJob MISSED (36.4h overdue)
**Severity:** CRITICAL | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** mcp-server/cron-jobs
**Details:** bctcReparseJob last ran 2026-08-10 14:00:02, now 36.4h overdue (threshold 36.0h)
**Impact:** BCTC data processing pipeline blocked — potential earnings document backlog
**Root cause:** Job scheduling or execution error
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T02:22:58Z (signal sys-20260812T022122-1cb1, system-auditor -> po, dedup_key=auditor-a29-fire-gap:bctcReparseJob, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-21-RAG-MEM · rag-service memory escalation: 97.42%
**Severity:** CRITICAL | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** rag-service container
**Details:** Memory at 97.42% (994MiB / 1GiB), free 30MiB. Restart-resistant leak: 86.6%→99.33%→restarted→95.14%→97.42%
**Impact:** Imminent OOM kill risk. Service unresponsiveness or crash within hours.
**Root cause:** Memory leak in rag-service — 3x escalations sent, FU-RAG-DEPLOY-MEMORY task exists but root cause not yet investigated
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-12T02:22:59Z (signal sys-20260812T022211-2842, system-auditor -> po, dedup_key=microservice_memory_leak:rag-service:escalating-post-restart-20260812, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-20 · pdf-extractor high memory: 87.42%
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** pdf-extractor container
**Details:** Memory at 87.42% (2.186GiB / 2.5GiB), free 322MiB. Stable, no restarts.
**Impact:** Approaching critical threshold. Monitor closely.
**Root cause:** High PDF document processing load
**Zone owner:** dev-pdf-extractor
**Last reported:** 2026-08-12T02:23:00Z (signal sys-20260812T022219-6438, system-auditor -> po, dedup_key=microservice_memory_high:pdf-extractor:87.42pct, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained high memory 97.38%
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** rag-service
**Details:** rag-service memory sustained at 97.38% across 6-sample deep-probe window — loss of reclamation (0 dips, 0 discontinuities observed)
**Impact:** Container under persistent memory pressure; sustained high utilization may impact performance and increase OOM risk
**Root cause:** Potential memory leak or suboptimal garbage collection; restart-resistant pattern observed across multiple cycles
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T02:37:49Z (signal sys-20260812T023740-3e00, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · A-30: rag-service 99.68% memory, loss of reclamation, LanceDB root cause confirmed
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory sustained at 99.68% across 6-sample probe window with zero reclamation dips. VmHWM probe skipped due to host-side headroom <40MiB (Amendment B). Container BELOW-FLOOR with 3.3MiB free. Imminent-OOM risk.
**Impact:** rag-service may OOM and restart, impacting knowledge-retrieval-augmented-generation features. Risk increases with continued low request latency filling the working set.
**Root cause:** LanceDB vector_search() brute-force full-column scan without vector index on rag_entries table. Confirmed in architecture-brief 2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-12T04:08:40Z (signal sys-20260812T040810-6125, system-auditor -> po, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained high memory 97.23% (loss of reclamation)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** docker/rag-service
**Details:** sustained high memory 97.23% minimum over 65-second window — loss of reclamation, 0 dips detected
**Impact:** rag-service memory re-climbing post-restart; OOM risk if not resolved
**Root cause:** known vector indexing issue: LanceDB brute-force full-column scan without vector index
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-12T04:37:21Z (signal sys-20260812T043713-660d, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service critical memory + restart cycle
**Severity:** CRITICAL | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** rag-service (vn-market-intelligence-mcp-rag-service-1)
**Details:** Container restarted during audit window; memory peaked at 99.61% of 1GiB limit before restart; now at 3.65% post-restart. Known root cause: LanceDB vector_search() without index performs full-column scans, causing unbounded memory growth cycle every ~50min.
**Impact:** Service availability impacted by recurring restart cycle; data pipeline at risk if vector index not implemented soon
**Root cause:** Missing vector index on rag_entries table; FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS (P0) blocked by dev-team WIP budget
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-12T05:07:28Z (signal sys-20260812T050623-7474, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-29 · Cron fire gaps (7 jobs anomalies)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** cron-scheduler
**Details:** intelligenceCycle LATE (0.3/0.4h), bctcReparseJob MISSED (40.5/36h), 4x STALE >280h, 1x MISSED 1734h
**Impact:** periodic jobs not running: TA/BB alerts offline, monthly audits skipped, RAG rebuild stalled 23d
**Root cause:** cron scheduler failures, possible stale lock or scheduler daemon issue
**Zone owner:** ops
**Last reported:** 2026-08-12T06:31:11Z (signal sys-20260812T063102-52f1, system-auditor -> po, dedup_key=auditor-a29-fire-gap:multi, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service BELOW-FLOOR 99.37-99.98% — LanceDB fix waiting for rebuild
**Severity:** CRITICAL | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** apps/rag-service
**Details:** Container memory sustained 99.37-99.98% across 6-sample deep-probe window. Restarted 31min ago, climb recurred within minutes. Known pattern: unbounded search() brute-force memory growth.
**Impact:** OOM proximity on live service. 4+ A-30 signals in 6 hours, each restart only resets meter. Unsustainable.
**Root cause:** LanceDB vector index not deployed. Code ready on main (commits 4c8c601e6 + a09810aac, 195/195 tests GREEN, board row P0 REVIEW[] since 2026-08-08). Container image built 2026-08-08T08:10:53Z, before fix committed 2026-08-12 08:16:02.
**Zone owner:** po
**Last reported:** 2026-08-12T07:08:47Z (signal sys-20260812T070826-72fc, system-auditor -> po, CRITICAL Telegram sent)
**Mitigation:** Container rebuild to pull LanceDB fix from main. Procedural, no dev work needed. Board row FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS in REVIEW[] lane.

---

## Anomaly: A-30 · rag-service sustained >93% memory pressure
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** rag-service/memory
**Details:** All 6 samples sustained >93% (97.13-97.15%) during 65s window — loss of reclamation pattern
**Impact:** Service approaching OOM risk despite no discontinuities/dips detected; may impact performance under load; host-side floor (40MiB) prevents further investigation
**Root cause:** Lazy-index fix merged but container not rebuilt since before fix landed; VmHWM pinned at cgroup cap indicates high-water mark near limit
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-12T07:36:52Z (signal sys-20260812T073637-71e9, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained >93% memory (99.76% median)
**Severity:** CRITICAL | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** service/rag-service
**Details:** A-30 multi-probe: 99.76% median memory across 6 probes, 99.82% peak. Loss of reclamation detected.
**Impact:** Service operating at memory ceiling with no reclamation — risk of OOMKill or eviction.
**Root cause:** High memory demand from rag-service workload combined with insufficient host capacity.
**Zone owner:** dev-rag-service
**Last reported:** 2026-08-12T09:35:35Z (signal sys-20260812T093525-1b2b, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory recurring (3rd occurrence)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory threshold breach recurred (3rd time). Container restarted 2026-08-12T10:40:47Z, memory dropped from 92.79% to 3.34%. Dedup ledger shows escalating pattern. Underlying lancedb memory architecture issue unresolved.
**Impact:** If pattern continues, service availability risk; memory pressure affects RAG model embedding performance
**Root cause:** LanceDB vector store memory management under RAG embedding load; prior fix (malloc_trim) insufficient
**Zone owner:** ops
**Last reported:** 2026-08-12T10:43:51Z (signal sys-20260812T104338-724f, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30:recurring-unresolved, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: D-CYCLE-2 · Auditor Tier-1 cycle missing — 84h gap (expected: 0.5h)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** auditor/tier-1
**Details:** Last healthy heartbeat was 2026-08-09T01:33:22Z; expected cadence 30 minutes; >3 day gap indicates missed audit cycles
**Impact:** System health not being monitored for Tier-1 container/health checks; risk of undetected runtime failures
**Root cause:** Tier-1 audit cycles have not completed successfully in 84 hours; possible fire-election losses or spawn gate issues
**Zone owner:** system-auditor
**Last reported:** 2026-08-12T13:34:51Z (signal sys-20260812T133441-7e30, system-auditor -> po, dedup_key=auditor-cycle-missing:tier1:2026-08-12T13:30Z, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service memory pressure: 88.54% (>85% threshold)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** rag-service / memory
**Details:** vn-market-intelligence-mcp-rag-service-1 at 88.54% memory usage with 117.4 MiB free of 1 GiB cgroup limit
**Impact:** Service approaching memory limit; potential OOM risk if usage continues to grow or if system memory pressure increases
**Root cause:** Tracked by FU-RAG-DEPLOY-MEMORY (status=DONE_VERIFIED); ongoing memory creep detected across Tier-1 probes
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T13:34:59Z (signal sys-20260812T133432-3b93, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: B-07 · vn-bctc-fetch service unhealthy
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** vps/vn-bctc-fetch
**Details:** VPS fetch service reported unhealthy status in last health poll
**Impact:** BCTC data pipeline at risk; may affect financial report data collection
**Root cause:** VPS service connection or internal state issue
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T14:21:25Z (signal sys-20260812T142118-1332, system-auditor -> po, dedup_key=microservice_degraded:vn-bctc-fetch:B-07, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor memory sustained high (95.23%)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** mcp-server pod — pdf-extractor-1 container
**Details:** Memory sustained above 93% floor (95.23% median) with no reclamation recovery. Escalation trend across 4 cycles: 88.95%→78.16%→93.92%→95.23%. No death indicators, no OOMKilled, state stable.
**Impact:** Container at sustained saturation. Risk of memory pressure events during burst workloads.
**Root cause:** PDF extraction workload memory profile; potential inefficient reclamation or genuine workload growth
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T15:08:28Z (signal sys-20260812T150735-2e4e, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained memory 95.57% (loss of reclamation)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-rag-service-1
**Details:** Memory pressure sustained across 6-probe window. VmHWM pinned at cgroup limit.
**Impact:** Service may face memory allocation delays or eviction
**Root cause:** Sustained high memory utilization without reclamation
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T15:35:49Z (signal sys-20260812T153534-59fc, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor sustained memory 95.36% (loss of reclamation)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** vn-market-intelligence-mcp-pdf-extractor-1
**Details:** Memory pressure sustained across 6-probe window. VmHWM pinned at cgroup limit. Escalating trend observed (88.95%→78.16%→93.92%→95.23%→95.36%).
**Impact:** Service may face memory allocation delays or eviction
**Root cause:** Sustained high memory utilization with escalating trend and zero reclamation
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T15:35:49Z (signal sys-20260812T153538-7fe5, system-auditor -> po, dedup_key=microservice_degraded:pdf-extractor:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor A-30 CRITICAL memory pressure >93%
**Severity:** CRITICAL | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** pdf-extractor container
**Details:** pdf-extractor sustained memory 95.32% max, 95.18% min over 65s window
**Impact:** Service may be evicted by OOMKiller if memory pressure remains sustained
**Root cause:** pdf-extractor container memory usage consistently at/near cgroup limit
**Zone owner:** dev-pdf-extractor
**Last reported:** 2026-08-12T16:05:46Z (signal sys-20260812T160538-57ef, system-auditor -> po, dedup_key=microservice_degraded:pdf-extractor:A-30, CRITICAL Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor sustained high memory (94.52%)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** pdf-extractor
**Details:** Sustained high memory usage 94.49-94.52% across 6-probe window (65 seconds). No state changes or OOMKills detected, but VmHWM pinned at cgroup limit indicates memory pressure.
**Impact:** Memory pressure may impact PDF extraction performance and increase latency for document processing tasks.
**Root cause:** Unknown — requires further investigation of application memory usage patterns and potential memory leaks.
**Zone owner:** dev-lead
**Last reported:** 2026-08-12T16:35:48Z (signal sys-20260812T163525-0051, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor sustained memory 94.97% (loss of reclamation)
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** pdf-extractor container
**Details:** Memory sustained at 94.97% median over 65s window with zero reclamation dips observed. VmHWM pinned at cgroup limit (2587640 KB / 2621440 KB = 98.7%)
**Impact:** Service may be unable to handle memory spikes or scale; eventual OOMKilled possible
**Root cause:** Container memory limit too tight for current workload; needs cgroup limit increase or memory optimization
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T17:05:26Z (signal sys-20260812T170518-5265, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service-1 sustained 96.52% memory
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** rag-service-1 container
**Details:** Memory at 96.52% sustained, no reclamation dips observed
**Impact:** Service at risk of OOM eviction
**Root cause:** High memory consumption from LanceDB operations
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T17:37:39Z (signal sys-20260812T173720-69e0, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · pdf-extractor-1 sustained 94.49% memory
**Severity:** WARN | **Date:** 2026-08-12 | **Status:** OPEN
**Location:** pdf-extractor-1 container
**Details:** Memory at 94.49% sustained, VmHWM pinned at cgroup limit (2587.6/2621.4 MB)
**Impact:** Service at risk of OOM eviction
**Root cause:** High memory consumption from PDF processing operations
**Zone owner:** dev-mcp-server
**Last reported:** 2026-08-12T17:37:45Z (signal sys-20260812T173729-22bd, system-auditor -> po, dedup_key=microservice_degraded:vn-market-intelligence-mcp-pdf-extractor-1:A-30, WARN Telegram sent)
**Mitigation:** No immediate action beyond signal routing.

---

## Anomaly: A-30 · rag-service sustained high memory, loss of reclamation
**Severity:** WARN | **Date:** 2026-08-13 | **Status:** OPEN
**Location:** rag-service container (vn-market-intelligence-mcp-rag-service-1)
**Details:** All 6 probes over 65s window returned 95.23% memory usage; zero reclamation dips detected; VmHWM pinned at cgroup memory limit (1.5GB/1.0GB cap)
**Impact:** Memory pressure sustained without reclamation indicates potential memory leak or ineffective garbage collection; risk of OOMKill if trend continues
**Root cause:** Continued upward trend (89.34% → 94.60% → 95.23%) suggests growth in resident memory footprint; VmHWM pinned indicates recent peak consumption
**Zone owner:** infrastructure
**Last reported:** 2026-08-13T08:46:11Z (signal sys-20260813T084552-622a, system-auditor -> po, dedup_key=microservice_degraded:rag-service:A-30, WARN Telegram sent)
**Mitigation:** Monitor rag-service memory trend across next 3-4 Tier-1 cycles; consider memory profile/heap dump analysis if trend persists or reaches 98%+

---
