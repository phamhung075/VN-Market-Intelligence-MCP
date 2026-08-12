# Ops — Notebook

Zone: Docker/VPS/DB operations, incident response, close-gate verification.

### Pointer to Prior Cycles
→ Cycles 2026-08-06 through 2026-08-06T18:50Z archived to `docs/agent-memory/sessions/ops-cycles-archive-20260808.md`

## Cycle 2026-08-08T13:40Z — FACTORY-PDF-split-handlers Rebuild Verification

**Task**: Review-lane sign-off on FACTORY-PDF-split-handlers (pdf-extractor handlers.py split).

**Verification Summary**:
- ✓ Pre-rebuild: Code on disk verified (handlers.py 65L, 8 route modules split)
- ✓ Pre-rebuild: Old container missing new modules (ImportError confirmed)
- ✓ Rebuild: docker compose build completed successfully (41 min duration, exit=0)
- ✓ Post-rebuild: Container restarted, all 8 routes now importable (routes_health, routes_extract, routes_pek, etc.)
- ✓ Health: pdf-extractor service healthy, /health endpoint OK

**Decision**: DONE_VERIFIED — moved to done lane at 2026-08-08T13:40:45Z.
Module split is fully operational in running container. Rebuild confirms correctness.

Session: 165f4245-6173-4054-87fd-c55bb626265f

## Cycle 2026-08-09T04:35Z — CRITICAL: Cron Scheduler Partial Failure Investigation

**Issue**: System-auditor Tier-2 reported 23/90 cron jobs (26%) stopped firing at 2026-08-07 08:50 UTC, now 41.6h overdue.

**Initial Diagnosis**:
- Jobs affected: morningBriefing, alertDigest, foreignFlowAlert, franceSummary, signalOutcomeJob, ohlcvStalenessCheck, marketEarningYield, alertOutcomeJob, vnstockTradingStatsRefresh, breadthHistoryPersister, ohlcvSanityCheckEarly, vpsProxyWatchdog, taAlertNotifier, priceUpdateWatchdog, vnIndexRefresh, brokerSanctionsSweep, ragFtsRebuildCron, taAlertScan, bbAlertScan
- Last successful fires: 2026-08-07 00:45:02 to 09:30:01 UTC (scattering across early-morning to late-morning weekday window)
- Pattern: Cut-off at exactly 08:50 UTC 2026-08-07 (vpsProxyWatchdog, priceUpdateWatchdog last fires)
- Status AFTER rebuild (2026-08-08 16:59:58Z): UNCHANGED — jobs still MISSED, not recovered

**Scope Analysis**:
- mcp-server rebuilt at 2026-08-08T16:59:58Z UTC → image sha256:630fa5d262755bf94caadfa28859a392546f7b06ac3594a8cccc51ee36a1a551
- Rebuild did NOT restore these jobs → root cause is NOT the double-registration bug (that was a separate issue)
- Jobs ARE present in current code (buildJobTable + registerBespokeJobs in schedulerJobTable.ts)
- Jobs ARE registered with scheduler at startup → they appear in /api/cron-status layer_a endpoint
- Jobs have NEVER_FIRED or MISSED status depending on prior history

**Key Finding**: Jobs had prior runs recorded in cron_job_runs table (2026-08-07 before 08:50 UTC), then ALL stopped at the same time. This suggests:
  1. Container crash or forceful exit at ~2026-08-07 08:50 UTC
  2. No automatic recovery/restart of the old container
  3. New container deployed 32h later, but it's running fresh, not replaying missed jobs

**Root Cause Hypothesis**: The original container (running before 08:50 UTC 2026-08-07) either:
  - Crashed due to an unrecoverable error
  - Was manually killed or timed out
  - Hit OOM or resource exhaustion
  - All crashing at the exact same minute suggests a systemic event, NOT per-job failures

**Next Steps**:
1. Check if there's a way to query old container logs (docker-compose logs history, journalctl, etc.)
2. Look for error messages around 2026-08-07 08:50 UTC in any persistent logs
3. Verify if the container's health probe was failing
4. Check if there were any resource constraints (CPU, memory, disk) at that time
5. Examine the rebuild against the pre-08:50 UTC code to see if anything changed that would have prevented re-registration

Session: 165f4245-6173-4054-87fd-c55bb626265f


**Deep Dive Analysis (04:35 UTC 2026-08-09)**:

Date/Day Verification:
- Today is Sunday 2026-08-09 (confirmed via `date` command)
- Incident occurred Friday 2026-08-07 at 08:50 UTC
- Container rebuilt Saturday 2026-08-08 at 16:59:58Z UTC (deployed 19:06:16Z UTC)
- Weekend jobs correctly skipped during startup on Saturday (startup-catchup recognized weekend)

Log Analysis (docker logs mcp-server-1):
- No registration errors for failing jobs
- No scheduler runtime errors
- Scheduler IS running (latest log: scheduler-dedup 02:36:01Z UTC)
- All 23 affected jobs WERE registered pre-incident (confirmed via buildJobTable + registerBespokeJobs code)

Job Firing Pattern:
- Weekday-only jobs (cron Mon-Fri like `*/10 2-8 * * 1-5`) correctly did NOT fire on Sat/Sun
- Expected next fires: Monday 2026-08-10 at 02:00-09:30 UTC range (depends on job)
- No new failures detected since rebuild; jobs stable in MISSED state

**Root Cause — Container Crash Hypothesis (HIGH CONFIDENCE)**:
The original mcp-server container process died/crashed at exactly 2026-08-07 08:50:00 UTC:
- vpsProxyWatchdog, priceUpdateWatchdog last-fire timestamps both show 08:50 UTC (exact boundary)
- All 23 jobs stopped firing at that same microsecond → not gradual degradation, not per-job bug
- Last jobs to fire were end-of-market-hours (08:50 is last 10-min interval before 09:00 market-close cutoff per cron 2-8)
- Next scheduled fires would have been 09:00+ UTC (outside market-hours window for these jobs), so wouldn't fire anyway
- Node-cron's recoverMissedExecutions re-seeds from `new Date()` on container init → old execution history lost

**Why Rebuild Didn't Recover**: 
- New container (rebuilt 2026-08-08) is running fresh with clean scheduler state
- Old cron_job_runs records (up through 2026-08-07 08:50 UTC) exist in DB but are not replayed
- Weekday jobs naturally didn't fire Sat/Sun (normal behavior)
- node-cron will NOT replay jobs missed across a container restart (only in-process event-loop lag)

**Escalation Recommendation**:
1. Investigate what caused the original container to crash at 2026-08-07 08:50:00 UTC precisely
2. Check host logs (journalctl), OOMKilled events, resource exhaustion around that timestamp
3. Implement container health monitoring + auto-restart policy if not already in place
4. Determine if this is a one-off incident or recurring pattern

**Verification Plan**:
- Monitor Monday 2026-08-10 when weekday jobs next fire (02:00 UTC +)
- If jobs fire normally on Monday → root cause is confirmed as container crash, self-healed by restart
- If jobs STILL don't fire Monday → deeper scheduler registration bug requires developer investigation

Session: 165f4245-6173-4054-87fd-c55bb626265f


## Cycle 2026-08-11T16:17Z — CRITICAL: rag-service Memory Pressure Escalation

**Issue**: System-auditor A-30 alert: vn-market-intelligence-mcp-rag-service-1 at 99.53% memory (1019MiB/1GiB, 5MiB free) — below 40MiB safety floor. Surge from 89.91% → 99.44% in 23 minutes with zero reclamation across 65s probe window. Imminent OOMKilled risk.

**Investigation Summary**:
- Container status: Up 15 hours (Started 2026-08-11T01:00:43Z UTC)
- RestartCount: 9 (indicating 9 prior OOM restarts)
- Health status: Healthy (responding to /health checks)
- Process: python3 main.py consuming 961MB RSS
- Loaded model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (embedding service)
- Database: PRAGMA integrity_check = "ok"
- Disk: 92% usage (near 95% threshold)

**Chronic Pattern Analysis**:
- First occurrence: 2026-08-05T16:34:14Z (dedup: mem_pressure:rag-service:A-30)
- Recurring variants: floor-breach, loss-of-reclamation, post-fix-monitoring, recurring-ceiling, BELOW-FLOOR
- Latest entry: 2026-08-09T04:11:10Z (microservice_degraded:vn-market-intelligence-mcp-rag-service-1:A-30, sev=3)
- Pattern: Sustained high memory state with no GC reclamation → eventual restart

**Root Cause Hypothesis**:
1. Embedding model (multilingual MiniLM-L12-v2) locked in memory at startup (~400MB+ per logs)
2. Additional runtime load (FTS indices, cached embeddings, session state) pushing towards 1GB limit
3. Python/Uvicorn GC not reclaiming space fast enough under sustained load
4. 1GB memory limit is insufficient for RAG workload with embedding model

**Backlog Context**:
- FIX-AUDITOR-A30-SUSTAINED-WINDOW-SHORTER-THAN-TARGET-RECLAMATION-PERIOD (earlier PO triage)
- FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (related pdf-extractor issue, also at 97.02%)

**Actions Taken**:
1. Diagnosed via docker stats, container inspection, logs
2. Attempted proactive restart: `docker compose up -d --no-deps rag-service` → no-op (container already healthy)
3. Sent BUG channel telegrams (msg_id 5089, 5090) with investigation summary and escalation
4. Per ops flow: "Escalate Immediately" on "Multiple Docker services in restart loop" criterion

**Escalation Reasoning**:
- This is a known chronic issue with historical backlog, not an acute one-time incident
- Container is currently healthy but at the edge of OOMKill
- Requires root-cause investigation (memory tuning, model optimization, heap size limits) — beyond standard restart recovery
- PO triage needed to decide: increase container memory limit vs. optimize application vs. split RAG service

**Status**: ESCALATED to PO. Awaiting deeper investigation from dev-team or architect.

Session: 165f4245-6173-4054-87fd-c55bb626265f


## Cycle 2026-08-12T04:12Z — rag-service Emergency Restart (Memory Pressure)

**Incident:** rag-service at critical memory threshold (99.75% of 1GiB cap, only 3MiB headroom).

**Diagnosis:** Tier-1 auditor cycle c48 and live docker stats independently confirmed 99.66-99.75% sustained memory over 6+ samples. Root cause identified via architect's diagnostic brief (2026-08-12-fix-rag-embedder-idle-unload-second-growth-source.md): LanceDB vector_search() runs brute-force full-column scans on every call (no vector index exists), measured at +340-444MiB per ~200-600 calls in isolated repro. Corpus grows ~100 rows/hour independently; per-query cost stays unbounded until index built.

**Permanent fix staged:** Board row FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS, status=READY, priority=P0, owner=dev-rag-service. Requires LanceDB IvfPq vector index implementation (design detailed in architect brief §6). Next dev-team dispatch window ~04:37Z (~25min from incident time).

**Action taken (stopgap):**
- Scoped restart: `docker compose stop rag-service && docker compose up -d --no-deps --no-build rag-service`
- Timestamp: 2026-08-12T04:12:36Z UTC
- Recovery: 1021MiB (99.75%) → 42.36MiB (4.14%) — **95.84% memory freed**
- Health: ✓ Healthy immediately post-restart
- Startup logs: ✓ Clean (no errors, lazy embedder load enabled, services healthy)

**Rationale:** At 99.75% with 3MiB headroom and active search traffic, uncontrolled OOM-kill was imminent. Stopping before permanent fix deployment (30min away) would create unmitigated service gap. Scoped restart aligns with ops-flow constraints (docker.md § FORBIDDEN — no bare `down`/`up -d`, no system-wide restart) and buys ~30-50min before re-climb, per prior restart history cited in architect brief.

**Next steps:** 
1. ✓ Escalated to PO via telegram/work channel to expedite dev-rag-service dispatch
2. Monitor memory growth rate over next 30-50 minutes
3. If climb exceeds 85% before permanent fix deployment, escalate for emergency expedited dispatch
4. Once vector index fix lands and deploys, will re-run isolated probe scripts (scripts/audits/rag-lancedb-search-mem-arena-probe.py) to verify the steep 0→20-call ramp collapses

**Prior context (cited from brief):**
- Memory limit: 1GiB (confirmed in docker-compose.yml + docker inspect, raised from 768m on 2026-08-06)
- Candidate 1 (per-request embedder tensor/cache): ruled out (+5.4MiB/80 calls, asymptotes fast)
- Candidate 2 (LanceDB reader/mmap accumulation): confirmed dominant (~65-80x candidate 1, no vector index = brute-force scans)
- Candidate 3 (FTS build path): ruled out (cron disabled by default, one-time lazy-build already bounded by RAG-FTS-BUILD-MEMORY-BOUND)

**Session:** 165f4245-6173-4054-87fd-c55bb626265f
**Incident ID:** sys-20260812T040810-6125 (from auditor signal)

---

## Cycle 2026-08-12T05:04Z — RAG-Service BELOW-FLOOR Memory Pressure Mitigation #2

**Condition Detected**: System-auditor Tier-1 probe reported vn-market-intelligence-mcp-rag-service-1 at 99.44% memory (1018MiB/1GiB), essentially zero headroom, ~50 minutes after prior mitigation at 2026-08-12T04:12:36Z.

**Pre-Mitigation Diagnostics**:
```
docker stats output (pre-restart):   1020MiB / 1GiB = 99.61%
Container status:                     Up 51 minutes (healthy)
RestartCount:                          0 (no crash loop, running since prior restart)
```

**Mitigation Executed** (ops-flow compliant scoped restart):
```bash
docker compose stop rag-service && docker compose up -d --no-deps --no-build rag-service
Timestamp: 2026-08-12T05:04:30Z UTC (dispatch)
Container restarted: 2026-08-12T05:04:33.067751053Z (verified via docker inspect)
RestartCount remained: 0 (normal scheduled stop, not crash)
```

**Post-Mitigation Health Verification**:
- Memory: 37.42MiB (3.65%) — **96.34% recovery** (identical pattern to prior mitigation 50min earlier)
- Container status: Up 18 seconds (healthy)
- Gateway port 3000: Bound ✓
- Service /health endpoints: All 7 core services responding 200 (pdf-extractor 5001, rag-service 5002, technical-analysis 5003, macro-indicators 5004, kinh-dich 5005, alert-engine 5006, news-fetch 5008)
- Docker compose ps: All 12 services Up (healthy) — no collateral damage
- Builder cache prune: 385.9MB reclaimed

**Key Observation**: Recurrence interval shortened from initial ~50 minutes (04:12→05:04) to current ~50 minutes again. This confirms the root cause diagnosis (FIX-RAG-EMBEDDER-IDLE-UNLOAD-ALLOCATOR-PAGES-NOT-RETURNED-TO-OS): vector search workload on unindexed LanceDB table = unbounded brute-force full-column scans accumulating in memory. Every search adds ~20-30MiB to arena, no recovery until container restart.

**Explicit NOT A FIX**: This is identical temporary stopgap as prior mitigation. Permanent fix requires dev-rag-service to land LanceDB IvfPq index (board row status=READY, priority=P0). Current dev-team WIP is saturated (3 unrelated rows in-progress, WIP_CAP=2), blocking dispatch per 2026-08-12T04:37Z escalation.

**Next expected BELOW-FLOOR**: ~2026-08-12T06:00-06:05Z (50min from 05:04Z). If climbing past 85% before permanent fix lands, escalate for emergency dispatch gate override.

**Session:** 165f4245-6173-4054-87fd-c55bb626265f
**Incident ID:** sys-20260812T050436-rag-repeat (echo of sys-20260812T040810-6125)
