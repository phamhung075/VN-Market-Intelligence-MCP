# Developer — Notebook

**Last updated:** 2026-07-29 | **Cycle:** FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE

## Session 2026-07-29 — FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE — REVIEW

**Task:** BOUNDED-1 auto-pickup, cross-service/. `spawn-fanout.md` Step 5.2 composed the spawn prompt from `slot.flow_path` alone, never reading `slot.trigger_prompt` — digest-daily was the sole slot where the two fields named DIFFERENT files (`flow_path`→`daily-predict.md`, `trigger_prompt`→`main.md`), so every live cowork-dispatcher fire skipped `main.md`'s Step pre-D `DAILY-PREDICT DEDUP GATE` entirely.

**Actions taken:** Step 5.2 now dispatches `slot.trigger_prompt` (composed `flow_path` form is fallback-only), plus a fail-loud pre-spawn check that refuses any slot whose two fields diverge (releases the per-work-item token, logs `errors[]`, `send_telegram(bug)`) — closes the class, not just this slot. Fixed `digest-daily.flow_path` → `main.md` in `cowork-schedule.json` (now agrees with `trigger_prompt`, matches sibling `digest-sunday`). New shared predicate `extractPromptFlowPath()`/`slotEntryPathsAgree()` in `cowork-match-slots.js` (one algorithm, referenced by both the runtime check and the new test — not duplicated). New `cowork-schedule-consistency.test.js`. Corrected a stale decision-comment in `cowork-team/flow/main.md` that still described the pre-fix (buggy) behavior.

**Verification:** RED reproduced directly against `git show HEAD:docs/data/cowork-schedule.json` (real pre-fix content) — new test's live-schedule assertion FAILs exactly on `digest-daily` (8/9); restored → 9/9 GREEN. Confirmed the launchd Layer-B backstop (`cowork-guaranteed-slot-firer.sh`) was never affected — it already read `trigger_prompt` verbatim; grepped it directly to be sure, not assumed. Sibling `cowork-match-slots.test.js` 43/43 and `cowork-catchup-predicate.test.js` 34/34 unaffected (purely additive exports). `bun tsc --noEmit` 0 errors; zero `apps/mcp-server/src/` files touched, no `bun test` delta structurally possible. Did NOT copy the dedup gate into `daily-predict.md` — explicitly forbidden by the row (would create a second claim-gate copy that must stay byte-identical to `main.md`'s). Graphify skipped — env check confirmed no LLM API key (same precondition as 3 prior sessions' hard failures), flagged in WORK.md not silently omitted.

**Board:** `task_board.in_progress[FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE]` → `review` (`next_agent:qa`, `branch:null`), `.head` synced to idle, via `orch-apply.sh`.

**Simplicity gate:** PASS — Q1 clean (every line traces to the deliverable's PREFERRED-general + assertion clauses), Q2 no single-use abstractions (predicate used by both test + doc-referenced), Q3 senior-test clean, Q4 comment density matches sibling `cadence-policy.js`/`cowork-catchup-predicate.js` precedent for this same file.

Zone health: no drift detected.

## Session 2026-07-29 — FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1 — REVIEW

**Task:** BOUNDED-1 auto-pickup, P2, cross-service/. A Tier-1 DEGRADED cycle (06:08:22Z) wrote `docs/data/auditor-tier1-last-healthy.json` despite `main.md:748-755` explicitly gating that write out of Tier-1 — no authorizing step anywhere in the flow produced it, collapsing the file from `{last_healthy_at, checks{6 keys}}` to bare `{last_healthy_at}` and falsely advancing a "healthy" marker on a non-healthy cycle. A prose prohibition alone had already been tried and failed (2nd violation).

**Actions taken:** New `scripts/git-hooks/pre-commit` `_check_auditor_heartbeat_shapes` — runs unconditionally BEFORE the pre-existing sweep-guard mode dispatch, never `GIT_SWEEP_GUARD_MODE`-gated: rejects (commit BLOCKED, loud stderr) any staged tier-1 write that isn't the exact `{last_healthy_at, checks:{6 keys, all "PASS"}}` shape, and any staged tier-2/3 write carrying a `checks` key at all. New `CANONICAL:SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER` in `docs/policies/dev-standards.md`, cited from both writers (`auditor-tier1-probe.sh` header, `main.md` § Tier-2/3 Heartbeat Write — which now also states the resolved semantic split explicitly). Live file repaired by actually running the authorized writer (`bash scripts/agents-flow/auditor-tier1-probe.sh`) — genuine ALL_GREEN, not hand-edited.

**Semantic judgment call (AC4):** the family's one filename says "healthy" but tier-2/3 really means "an audit completed" (fires every cycle regardless of verdict — `auditor-signal-loop-P1`, load-bearing for the SKIP-SPAWN freshness gate). Re-gating tier-2/3 on green was rejected — would starve the heartbeat on a persistently-tracked DEGRADED cycle and recreate the exact spawn-storm that P1 fix closed. Renaming the files/field was rejected — would break `FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL`'s already-planned OH-3.5 reads of these exact paths (sibling row, sequenced with this one). Kept both filenames/fields; made shape (bare vs `checks{}`) the enforced structural signal distinguishing the two semantics. `suppress_heartbeat` NOT ported to Tier-1; `AUDIT_TIER` 2/3 gate at `main.md:750` NOT dropped (both explicitly rejected directions per the sibling row's `.why_the_obvious_fixes_are_wrong`).

**Verification:** New `scripts/git-hooks/pre-commit-auditor-heartbeat.test.sh` — RED (3/6 fail pre-guard) → GREEN (6/6). No regressions: pre-existing `pre-commit.test.sh` 6/6, `auditor-tier1-probe.test.sh` 141/141, both scripts otherwise byte-identical to before. `bash -n` syntax-clean on the hook. Shell/JSON/MD only — no `apps/mcp-server/` TS touched, `bun tsc`/`bun test` not applicable. Graphify: no Skill-tool path available to this spawned agent (same structural constraint as 2 prior sessions today) — flagged in `docs/WORK.md`, not silently skipped.

**Board:** `task_board.in_progress[FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1]` → `review` (`next_agent:po`, `branch:null`), `.head` synced to idle, via `orch-apply.sh`.

**Simplicity gate:** PASS — Q1 clean (every line traces to one of the 6 acceptance criteria), Q2 single-use `_check_auditor_heartbeat_shapes` justified by direct precedent (`write_signal`/sweep-guard dispatch already single-purpose in the same file), Q3 senior-test clean (flat jq predicates, no indirection), Q4 ratio <50% overhead.

**Commits:** `612ee0954` (guard+docs+test), `06f15af0d` (live file repair, separate — data vs code convention).

Zone health: no drift detected.

## Session 2026-07-29 — FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE — REVIEW

**Task:** BOUNDED-1 auto-pickup, docs/data/orch/. detail_ref didn't resolve (no `items[]` entry) — worked from board row's inline fields + own investigation.

**Findings:** `sprint_goal.entries[]`/`task_board.active_sprints[]` eviction verified genuinely 0 — all 18/8 entries non-terminal (active/PLANNING/OPEN, no TERMINAL_SET alias drift), cross-checked against task_board lanes + cold `archive/*.json` closed_sprints/closed_sprint_goals for stale-active evidence — none found. No code change needed; existing predicate already correct.

**Actions taken:** `decision_journal[]` had zero eviction story (architect finding state-data-files-P7). Extended `scripts/orch-cold-evict.sh` with an age-ranked pass (keep 10 newest by parsed `.ts` desc, evict rank≥10 if ts null or >14d old — mirrors `done[]`). Entries have no stable unique id (task_id repeats across decisions) so hot removal is INDEX-keyed and cold-append is content-deduped, not id-set-keyed like every other lane. Confirmed zero live readers of `.decision_journal` (2 write sites only) — safe to age-evict independent of parent-sprint liveness.

**Verification:** new TEST 8 in `orch-cold-evict-tests.sh` (6 assertions: rank-gate, age-gate independent of rank, null-ts eviction, non-contiguous-index correctness, idempotent re-run). Full suite before/after: 27/35 both times (8 pre-existing unrelated failures, flagged not fixed) + 6/6 new T8 green. Live-applied under commit-mutex: `orch-state.json` 2,478,170→2,404,145 bytes (decision_journal 49→10). Conservation guard indifferent as expected (681/133 unchanged).

**Honest gap:** <150KB target NOT reached by this task alone (flagged up front — task_board lanes dominate remaining ~2.4MB). Deferred: P7's optional `orch-validate.mjs` >50 WARNING, `task_board._closed_signals_20260614` legacy-key cleanup — both out of stated scope.

**Board:** `task_board.in_progress[FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE]` → `review` (`next_agent:router`, `branch:null`), `.head` synced to idle, via `orch-apply.sh`.

**Commit:** `b3d9a04eb` (script+test+orch-state.json+archive+decision-journal, single commit, explicit pathspec).

Zone health: no drift detected.
