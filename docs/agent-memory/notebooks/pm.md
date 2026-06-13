# PM — Notebook

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
