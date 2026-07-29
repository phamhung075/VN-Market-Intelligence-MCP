# Developer — Notebook

**Last updated:** 2026-07-29 | **Cycle:** FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1

## Session 2026-07-29 — FIX-NOTEBOOK-LINECAP-SWEEP-BYTE-BLIND-BACKSTOP + FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO — REVIEW

**Task 1 (P1, cross-service/):** `notebook-linecap-sweep.sh` — the only write-path-agnostic cadence backstop for notebook caps — pre-filtered on `wc -l` only (hardcoded `cap=200`), so 9/10 live over-byte-cap notebooks (line-under, e.g. alert-commander.md 119233B/190L) never reached the already byte-fixed `notebook-auto-prune.sh` hook via the cron path. Mirrored the hook's exact `LINE_CAP`/`BYTE_CAP` derivation (SSOT `file-size-caps.json`, `BYTE_CAP=LINE_CAP*60`) into both the pre-filter AND the PRUNED/NO-CHANGE predicate. New AC5 fixture (127L/12255B byte-over/line-under) — RED (4/11 fail pre-fix) → GREEN (11/11). AC4 RAW live run against real notebooks: over-cap 10→4 (gate `<10` met), 6 genuinely pruned (dev-mainserver-crawls/dev-vps-crawls/ba/dev-team/fixer/pm), committed separately. **Honest gap:** digest-predict.md (named in AC4) did NOT converge — 2-section file where the surviving section alone is ~37KB; drop-oldest hits `notebook-auto-prune.sh`'s own single-section safe-fail (exit 0, zero write, correct signal emitted) — same unprunable-blob class as alert-commander.md, flagged for a possible follow-up row, not fixed here (`scope_out` forbids touching the hook's algorithm).

**Task 2 (P2, cross-service/):** `mock-guard.sh --full` HARD-FAILed every post-cycle tick on 2 Go test-double stubs (`*_test.go`, `stubBOPURLBuilder` — the `//` inside its `https://stub.sbv.vn` URL literal tripped the same-line comment-qualifier heuristic) — only a `tests/` DIRECTORY was excluded, never Go's `_test.go` filename convention. Added ONE `_test\.go` EXCLUDE_PATHS alternative (AC1/AC4). `--full` file discovery switched `grep -r apps/` → `git ls-files --exclude-standard` so the 124MB `apps/mcp-server/~/.bun` vendored cache is excluded BY CONSTRUCTION (AC2). New `mock-guard.test.sh` (zero prior coverage) — RED (3/7 fail via `git stash`) → GREEN (7/7): AC1, 2 independent AC3 negative controls (non-test `.go`/`.ts` fixtures still HARD-FAIL), AC2 (real gitignored-cache fixture invisible to `--full`), AC4 (structural), live-repo regression (exit 1→2). **Honest gap:** live repo now exits 2 not 0 (pre-existing unrelated legitimate TODO CAUTION markers) — AC3's literal "exit 0 on a clean tree" verified as a controlled test fixture, not the live tree.

**Verification (both):** shellcheck clean. No `apps/mcp-server/` TS touched either task (`scripts/`/`docs/` only) — `bun tsc`/`bun test` not applicable.

**Board:** both `task_board.in_progress[...]` → `review` (`next_agent:qa`, `branch:null`) via `orch-apply.sh`, sequential writes, `.head` untouched (was already idle, not either task's `active_task_id`).

**Commits:** `7fd919c15` (task 1 code+test), `b10870bd4` (task 1 real notebook prune, separate), `1fcfa72da` (task 2 code+test).

Zone health: no drift detected.

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
