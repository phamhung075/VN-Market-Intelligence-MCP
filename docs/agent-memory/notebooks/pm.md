# PM — Notebook

## c308 ARCH-CRON-SCHEDULER-RELIABILITY sprint decomposition · 2026-06-14T030000Z

ARCHITECT brief FINAL (ARCH-CRON-SCHEDULER-RELIABILITY) → decomposed into 5 atomic tasks in 2-phase structure. Root cause: node-cron v3.0.3 silent tick drops under event-loop saturation (`recoverMissedExecutions=false` default). Design: 4-lever system (recoverMissedExecutions + T4 dedup guards + jitter + watchdog). Architect established HARD CONSTRAINT: Phase 1a (T4 guards) MUST ship before Phase 1b (recovery enabled) to prevent double execution on replay.

Tasks created in orch-state.json task_board.backlog[]:
- **TASK-ARCH-CRON-1A** (M, load-bearing) — T4 idempotency dedup guards: 14 job files + cron_job_runs recency check (90% cadence window). Blocked by FIX-MCP-CRASH-LOOP-WRITEWAL; blocks 1B+1C. Handoff: docs/handoffs/TASK-ARCH-CRON-1A.md. AC: all 14 T4 jobs have guard, JSDoc @idempotency T4, logging 'recovery dedup', tsc clean.
- **TASK-ARCH-CRON-1A-TEST** (M, non-vacuous) — 28 test cases: 14 jobs × (fresh skip + stale execute). Mock jobRunRepo.getLastRuns(), verify guard behavior with breach conditions. Depends on 1A. Handoff: docs/handoffs/TASK-ARCH-CRON-1A-TEST.md. AC: bun test green, tests fail if guard removed (non-vacuous check per fence-false-green policy).
- **TASK-ARCH-CRON-1B** (S) — Uniform recoverMissedExecutions:true: 50+ cron.schedule() calls in startScheduler.ts + exception foreignFlowFetch (*/1 * * * * design = no recovery). Depends on 1A; blocks 2. Handoff: docs/handoffs/TASK-ARCH-CRON-1B.md. AC: ~50 calls have recovery flag, foreignFlowFetch documented, tsc clean.
- **TASK-ARCH-CRON-1C** (S) — Deterministic jitter shifts: 8 cronConfig.ts keys (ohlcvDaily 3min, vnstockFundamentals 5min, reputationCompute 3min, baseRateComputation 7min, predictionResolution 5min, calibrationReport 4min, cascadeBacktest 7min, dailyDashboard 8min). Env-overrides intact. Depends on 1A; blocks 2. Handoff: docs/handoffs/TASK-ARCH-CRON-1C.md. AC: 8 shifts applied, no timing conflicts (R-3 architect-validated), tsc clean.
- **TASK-ARCH-CRON-2** (M) — Scheduler watchdog (Lever 4): new schedulerWatchdogJob.ts + WATCHDOG_MANIFEST (16 jobs), per-job age check vs cron_job_runs, alert-only or self-heal actions (rate limit 2h), registered at */10 * * * *. Creates 3 test files (watchdog unit, idempotency unit, recovery integration). Depends on 1A+1B+1C. Handoff: docs/handoffs/TASK-ARCH-CRON-2.md. AC: watchdog fires, self-heal calls wrapRun, dedup prevents double-exec, 2h cooldown, bun test green.

IMPL GATE (CRITICAL): FIX-MCP-CRASH-LOOP-WRITEWAL must land + ops-verify before dev-mcp-server IMPL starts (crash-looping server drops ticks at process level). Tasks marked BLOCKED=FIX-MCP-CRASH-LOOP-WRITEWAL. Architect design complete, phase ordering strict (1a→1b/1c parallel→2 sequence). WIP constraint: dev-mcp-server at WIP=2 (FIX-CRASH-LOOP-WRITEWAL + BC-1 in_progress); ARCH-CRON tasks sit blocked in backlog until crash-loop ops-verify clears and WIP frees.

Commits: architect outputs (brief + handoff + sprint decision), all 4 handoff files (1A/1A-TEST/1B/1C/2), orch-state task_board.backlog += 5 tasks, PM notebook append. SSOT atomic: [ -s check on orch-state.json, jq -e verify backlog structure ].

---

## c307 FIX-MCP-CRASH-LOOP-WRITEWAL sprint decomposition · 2026-06-14T003000Z

ARCHITECT brief FINAL (2026-06-14T00:15Z) → decomposed into 3 atomic sequenced tasks. Root cause: `wal_autocheckpoint=4000` + FULL-only cron defeated by 40+ concurrent reader snapshots; WAL wedges every ~2h (3 restarts 2026-06-13). Design split: BC-1 (root fix, load-bearing) → A-1 (guardrail) → D-1 (escalation gate).

Tasks created in orch-state.json task_board.ready[]:
- **BC-1** (HIGH, no deps, claimable now) — WAL checkpoint policy: lower wal_autocheckpoint 4000→1000, add runForcedTruncateCheckpoint() (BEGIN IMMEDIATE; COMMIT + PRAGMA TRUNCATE), rewire 30-min cron. Files: schema.ts, checkpoint.ts, startScheduler.ts + test FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts. AC: 10k-write load WAL<1000 frames/cycle, uptime>4h WAL<5MB post-rebuild, tsc clean.
- **A-1** (MEDIUM, blocked by BC-1) — Restart-cadence alert: startup sentinel cron_job_runs row, 30-min poller (count>=2 in 4h → WORK alert). Files: composition-root.ts, cronConfig.ts, startScheduler.ts + new restartCadenceAlertJob.ts + test. AC: alert fires >=2, silent =1, no false-alarm post-recreate, tsc clean.
- **D-1** (MEDIUM, blocked by BC-1) — WAL escalation gate: escalateFn param in checkWalFileSize(), closure in startScheduler.ts writes atomic orch-state signal when WAL>10MB. Files: checkpoint.ts, startScheduler.ts + test FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts. AC: escalateFn called >10MB not <=10MB, error non-fatal, temp-rename atomic, tsc clean.

Handoff files created: TASK-FIX-MCP-CRASH-LOOP-BC-1.md, TASK-FIX-MCP-CRASH-LOOP-A-1.md, TASK-FIX-MCP-CRASH-LOOP-D-1.md (full AC + live-verify recipe per task). Zone: apps/mcp-server/ (SERIALIZED, only BC-1 claimable; A-1/D-1 blocked). WIP 0→1 (BC-1 ready for dev-mcp-server claim). Commit: atomic temp-rename orch-state write, SSOT guard [ -s && jq -e ]. Next: signal dev-mcp-server to claim BC-1, queue A-1/D-1 behind BC-1 live.

---

## c306 QUE-REFERENCE-PAGE decomposition · 2026-06-13T091500Z

ARCH-QUE-REFERENCE-PAGE DESIGN COMPLETE → decomposed into 4 atomic frontend subtasks. Parent task: READY-FOR-PM → DECOMPOSED. Subtasks:
- QUE-REFERENCE-PAGE-1a (READY, no blockers) — extend codegen, emit que-descriptions-detail.generated.ts
- QUE-REFERENCE-PAGE-1b (READY, blocked by 1a) — build dashboard.kinh-dich-reference.tsx route
- QUE-REFERENCE-PAGE-2 (READY, blocked by 1b) — add QueName deep-link + TopNav entry
- QUE-REFERENCE-PAGE-TEST (READY, parallel with 1a) — write QUE_DETAIL tests + QueName deep-link tests

All zone: apps/frontend/ (parallel-safe, FREE, no mcp-server work). WIP constraint: +1 available (EVIDENCE-ACCUM-SILENT-CRON holds 1/2). Task 1a dispatch-ready-now. Handoff file + jq script → scripts/pm-decompose-que-reference.jq. Commit 24722293.

---

## c305 OHLCV-UNIT-CONTAM sprint closure · 2026-06-12T194036Z

CONTAM sprint successfully closed (9/9 DONE/VERIFIED). Root-cause: MIN(low, legacy_low)=0 propagation via ON CONFLICT. CONTAM-8 (SM-1 boundary fix), CONTAM-9 (519 low=0 rows, 3-pass repair). QA verified 39 tests PASS, DB clean (0 contamination rows). FPT +100447.2% → +0.547% (user bug fixed). Commits 545a225b + 937279ec. orch-state: closed_sprints created, active_sprints 25→24.

---

## c304 FE-CORPEVENTS-TICKER-FILTER task decomposition · 2026-06-12T151500Z

FE task (S, P-medium) per PO binding ruling: client-side ticker filter only (no /api). Payload SSOT, filterEvents DRY-reuse. Handoff TASK_FE-CORPEVENTS-TICKER-FILTER.md created, orch-state updated, active_sprints 24→25.

---

## c303 CONTAM-8 QA APPROVED · 2026-06-12T101234Z

CONTAM-8 boundary fix DONE. Repair heuristic `close >= 1000` (was `> 1000`). VNH 2026-06-12 post-repair: open=900, close=1000 (scale correct). DB clean, test 62/0 PASS. WIP freed 1/2.

---

## c301 REAUDIT-001 QA RETURN + BOARD RECONCILIATION · 2026-06-12T113500Z

REAUDIT-001 backlog→DONE (trend fix approved: 22 improving, 11 deteriorating, 8 stable). cron-miss side-finding FU-REPUTATION-CRON-MISS logged (ops, node-cron v3 behavior). Board reconciled, CONTAM critical-path prioritized.

---

## c300 SHIP-WAVE-REAUDIT task decomposition · 2026-06-11T212100Z

8 SHIP-WAVE-REAUDIT tasks created (5 mcp-server, 3 frontend). REAUDIT-001 CRITICAL first, then 2+FE-001 parallel, 3+FE-002 parallel, 4+FE-003 parallel, 5 last. All handoffs + orch-state.json updated. WIP rule enforced, sequencing locked.

---

## Archive

Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
