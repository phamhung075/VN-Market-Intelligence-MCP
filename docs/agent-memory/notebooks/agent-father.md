# Agent Father — Notebook

## 2026-07-08T20:05Z — FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE (router-dispatched, 6th+ recurrence)

- Task assumed the D4 predicate lives in system-auditor's agent-interpreted flow — router asked me
  to confirm rather than assume. It does NOT: `flow/main.md` Tier-3 pass never reads `handlers.md`
  (zero grep hits for "D4"). D4's REAL live execution is the compiled cron job
  `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` (`runTasksMdJanitorJob`, wired in
  `startScheduler.ts`, fires daily 03:00Z) — `handlers.md`/`audit-dimensions.md` are that code's
  cited spec-of-record, not its execution path. Zone owner for `apps/**` = `dev-mcp-server`;
  agent-father is forbidden from writing production `.ts`.
- What I DID (in-zone): rewrote `docs/agents/system-auditor/handlers.md` (Steps R-1b exclusion
  whitelist + live-concurrent-session guard, R-4b 2-cycle debounce via the notebook's own
  `D4 candidates:` ledger line — no new state file, since system-auditor may write only its
  notebook + signal_queue) and `docs/agents/system-auditor/audit-dimensions.md` (D4-R1b/R4b rows +
  corrected AC-2/AC-3) per the row's own fully-specified `debounce_and_exclusion_spec` +
  `scope_widened`/`class_b_folded`/`recur_20260703T0300` notes. Both files now carry an
  IMPLEMENTATION NOTE flagging the doc/code gap explicitly.
- Verified against REAL production data (not a unit test): live `coordination.db` dump
  (docker exec bun:sqlite) showed 7 currently-held sprint-task locks generating the exact
  2026-07-08T03:00Z noise batch — 5× `esc-datacov:{ACB,HPG,GVR,HVN,MBB}:Q1-2026:ESC-3`,
  `dev-team-cron-singleton`, `cron:dev-team:2026-07-08T02:37Z` — cross-checked against the 14 live
  `sau-d4-*` rows in `orch-state.json .signal_queue.rows[]`. Applied the documented exclusion
  patterns (`esc-datacov:*`, `*-singleton`, `cron:*`) against all 7 real IDs: 100% excluded.
  Negative control (`FACTORY-INTERFACE-sequential-confidence-05-mask`, `TASK_1996`,
  `IND-P1-ROC-MOMENTUM`) confirmed NOT over-broadly excluded — genuine task IDs still evaluated.
- Also found a pre-existing, unrelated doc/code drift while tracing: `handlers.md`'s own
  size-justification comment already claimed an "expired:false filter" D4 false-positive fix was
  applied to Step R-1, but the live code's `listHeld()` calls
  `listHeldTasks({ kind: "sprint-task" })` with NO `expired` argument at all — the doc-claimed fix
  was never carried into code. Flagged inline in both docs for whoever picks up the code task.
- NOT done (out of zone, honest BLOCKED not false-green): did not touch
  `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` (production code, forbidden) and did
  not flip the `orch-state.json .task_board` row to DONE_VERIFIED (`docs/data/orch/orch-state.json`
  is excluded from agent-father's commit zone per FU-AGENT-FATHER-ORCH-SCOPE — task_board writes
  are router/pm's job). The recurring noise will NOT stop until a `dev-mcp-server` code task ports
  Steps R-1b/R-4b into `tasksMdJanitorJob.ts`. Reported BLOCKED (partial) to router with the exact
  target file/function and verified fixture list for a fast pickup.
- Decision journal: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-agent-father.md` S3.

## 2026-07-08T21:45Z — FIX-COWORK-STEP5-BACKSTOP-TRUSTS-STALE-TRIGGER-STATUS (dev-team dispatch, brief `docs/architecture-briefs/2026-07-08-cowork-step5-stale-trigger-status.md`)

- Implemented architect brief §3.1+§3.2 verbatim: `spawn-fanout.md` Step 5.0 `BACKSTOP_SLOTS`/`NO_BACKSTOP_SLOTS`
  re-keyed off dead `trigger_status=="active"` (never resynced post-2026-06-22/23 cloud RemoteTrigger retirement)
  onto live-maintained `_superseded_by==null`; `cowork-schedule.json` split the 9 stale `"active"` slots into
  2 non-overlapping classes — 5 real-trigger slots → `"superseded"` interim value (chef-morning/eod/evening,
  digest-sunday, tnb-audit — distinct from `F1-CLOUD-TRIGGER-DECOMMISSION`'s own gated `"decommissioned"` flip,
  no scope overlap), 4 never-had-a-real-trigger slots → `trigger_status` field removed outright (fb-daily,
  fb-weekend, alert-commander-market/critical).
- All 6 brief §5 DoD checks RAW-verified via jq/grep: L14-15 read `_superseded_by`; zero slots left with
  `trigger_status=="active"`; the 5 real-trigger slots all `"superseded"`; the 4 never-had-one slots all
  `has("trigger_status")==false`; `jq empty` valid; the 2 remaining `trigger_status` refs outside spawn-fanout.md
  (`cowork-master-cron-runbook.md`, `cron-cowork-team.md`) confirmed prose/historical, not executable.
- Board update (`orch-state.json` mint/next_agent=qa): NOT done by me — my own `commit_zone.excluded`
  (init.md) + commit-boundary SKILL.md zone table bar agent-father from `orch-state.json` outside the one
  signal-queue DONE-mark exception (checked: no `signal_queue` row exists for this signal, exception N/A).
  Task text offered "you/PO" as the board-update owner; deferred to that alternative rather than overriding
  my own explicit, currently-enforced zone boundary on a launching agent's instruction (FU-AGENT-FATHER-ORCH-SCOPE).
- Decision journal: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-agent-father.md` S4.

## 2026-07-09T08:46Z — FIX-CLOSEGATE-STEP4-COMMIT-JOURNAL-DISCIPLINE (router-dispatched, brief docs/architecture-briefs/2026-07-09-closegate-step4-atomic-handoff.md §2.2+§2.3)

- Task: 2 recurring-bug fixes at ops's Close Gate Step 4/4b handoff (router had to discover+commit
  ops's uncommitted board+journal artifacts twice — `f4afa0e03`, `b907a8ea6`) + 3 one-off decision-
  journal filenames.
- (2.2) `docs/protocols/docker-deployment-runbook.md`: new `§ Step 4/4b Commit-Gate Invariant` —
  modeled verbatim on agents-architect's own Brief-Commit Invariant (`handlers.md`): explicit-path
  `git add`/`commit`/`git show` self-verify of ops's 3 Close-Gate paths; Step-4 RETURN/report MUST
  carry the commit SHA or is INCOMPLETE; a router/PO cleanup-commit flagged as a defect to report,
  not a recovery path; 3rd recurrence → escalate. `.claude/skills/commit-boundary/SKILL.md` zone
  table: added `ops` row scoped to exactly `notebooks/ops.md` + `decisions/sprint-<id>-ops.md` +
  `orch-state.json` (Close-Gate board+head write only).
- (2.3) Same runbook section: STEP ops-Sn / decision-journal `SPRINT_ID`-resolution enforcement
  line. Folded the 3 named one-off files into `sprint-SYSTEMIC-REMAKE-P1-ops.md` as `STEP
  ops-S1/S2/S5` (chronological insert by their own timestamps) — surfaced + fixed a pre-existing
  duplicate-`S2` numbering bug in that file (relocate-stock-catalog S1→S3, extract-computeDecision
  S2→S4, split-repositories S2→S6). Originals deleted post-fold (content preserved, not lost).
- Board update (`orch-state.json` in_progress→review + `.head` sync): attempted via
  `scripts/orch-apply.sh` (clean isolated diff, orch-validate PASS) then REVERTED — task text
  explicitly asked for it, but my own `commit_zone.excluded` (init.md) bars `orch-state.json` from
  agent-father commits outside the ONE named signal-queue-DONE-mark exception (task_board writes
  are not that exception), matching the S4 precedent of deferring board writes to po/router rather
  than overriding my own zone boundary on a launching agent's instruction. Reported the exact
  validated jq transform for router/po to re-run + commit.
- Decision journal: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-agent-father.md` S5.
