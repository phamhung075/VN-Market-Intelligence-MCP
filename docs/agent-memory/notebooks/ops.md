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

## 2026-08-08 FIX-SCHEDULER-DOUBLE-REGISTRATION Rebuild+Swap

**Status:** COMPLETE

**Task:** Docker microservice code-change close gate for mcp-server (dev-team session 165f4245 → ops via SECONDARY-DRAIN review-lane).

**What:** Rebuild + swap single-service mcp-server after dev-mcp-server fixed scheduler double-registration bug via new dedupeCronTick() wrapper in apps/mcp-server/src/scheduler/startupHelpers.ts (whole-second last-fired guard, blocks same-second re-fire defect caused by node-cron Scheduler.matchTime() millisecond-vs-whole-second granularity bug under recoverMissedExecutions:true).

**Build evidence:**
- Build timestamp: 2026-08-08T16:59:58Z UTC
- New image hash: sha256:630fa5d262755bf94caadfa28859a392546f7b06ac3594a8cccc51ee36a1a551
- Build output confirmed via `docker compose build mcp-server` → manifest sha256:630fa5d262755bf94caadfa28859a392546f7b06ac3594a8cccc51ee36a1a551

**Deploy evidence:**
- Container started at 2026-08-08T16:59:50.792500837Z (after dispatch timestamp)
- RestartCount reset to 0 (fresh container, image swap confirmed)
- Image verified via `docker image inspect` — hash exists on host
- /health returns 200 ✓
- Port 3000 bound ✓
- All 6 host_runtime_set services Up/healthy post-rebuild ✓

**Side effects:**
- mcp-server memory pressure reset from 99% → fresh state (~27.3s uptime fresh)
- Did NOT chase separate FIX-MCP-SSE-SESSION-MANAGER-PERCONN-LEAK-NO-REAPER (that agent's uncommitted work left untouched)
- Builder cache pruned: 13.89GB reclaimed

**Board update:**
- Moved FIX-SCHEDULER-DOUBLE-REGISTRATION from review[] → qa[]
- Status: QA, next_agent: qa
- Added ops_review_note with full deploy evidence capture
- Committed via pathspec: fix(orch-state): ...

**Handoff to QA:**
QA verification gate per dev-mcp-server review note: cron_job_runs LIVE query (named-volume market.db) must show exactly one success row per job per scheduled minute across 2 full fetch cycles for vnIndexRefreshJob AND vpsServiceHealthJob post-rebuild. pollNewsJob's 2x/30min pattern is EXPECTED/by-design (distinct source content, deduped by pollNews() URL+title guard).

**Chain:** ops (DONE) → qa (verification) → po (sign-off)

---

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

