# Developer — Notebook

**Last updated:** 2026-07-21 | **Cycle:** FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (sprint FLOW-PRICE-ALPHA-LOOP)

## Session 2026-07-16 — UC-GCP-P4 (dev-team BOUNDED-1 auto-pickup, zone `cross-service/`) — IN_PROGRESS→REVIEW

**Task:** `git-ci-publish-P4` (CONFIRMED) — every push (even doc/notebook/orch-state-only, ~68% of commits) paid the full `pnpm --filter vn-market check` tsc (~94s wall-clock, over the commit-mutex 90s TTL), stranding the fleet on unrelated red and letting a peer `task_claim` win mid-push.

**Actions taken:** `scripts/git-hooks/pre-push` now loops ALL stdin ref lines, computes `git diff --name-only <remote>..<local>` per line, and skips the full tsc only if NO line matches `^(apps|packages|scripts)/.*\.(ts|tsx|js|mjs|json)$` or root `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` (docs/ excluded). All 4 mandatory hardenings: (a) fail-open full tsc if `git diff` fails, guarded inside an `if` so it never hits the bare `set -e` abort; (b) all-zero local-sha (branch-delete) lines skipped; (c) ANY code-touching line across multiple stdin refs forces full tsc (drains all stdin, no early break); (d) root dependency files added to the code-touching set. Zero-remote-sha (new branch) always runs full tsc.

**Verification:** `bash -n` + `shellcheck` clean (one SC2034 on the intentionally-unused `remote_ref` field silenced inline — documents the 4-field stdin protocol). 9 simulated stdin scenarios against a throwaway repo + fake-pnpm stub: doc-only→skip/no-call, code-touching→full-tsc/call, fail-open (bogus remote sha)→full-tsc, new-branch (zero remote sha)→full-tsc, branch-delete (zero local sha)→skip, multi-line doc+code→full-tsc (ANY-rule), `PRE_PUSH_SKIP_TSC=1`→skip untouched, no-pnpm-on-PATH→WARN untouched, root `package.json`→full-tsc. All matched spec.

**Board:** Moving `task_board.in_progress[UC-GCP-P4]` → `task_board.review[]` (status REVIEW, next_agent=qa) + `.head`/`.task_board.head` synced to idle, via `orch-apply.sh`.

**Scope discipline:** Touched ONLY `scripts/git-hooks/pre-push` (sole in-scope file) + `docs/WORK.md` one-liner + this notebook + decision journal. Shell-only hook edit, no `.ts` touched — no tsc/full-suite run needed per the task's own verification bar. Did not touch commit-mutex TTL/SKILL.md — the residual code-touching-push mutex-overrun (~94s > 90s TTL) is an explicit out-of-scope follow-up per the brief.

Zone health: `scripts/git-hooks/` pre-push tsc gate — path-filter live, escape hatch + no-pnpm WARN branches intact; no other drift observed | HEALTHY

## Session 2026-07-16 — FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE (dev-team lead, cross-service/, subsumes FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE) — IN_PROGRESS→REVIEW

**Task:** `is_plan_only`/`is_non_dev_next_agent_unrouted` in `scripts/devteam-backlog-promote-bounded1.jq` read ONLY `$detail_items[.id]` (backlog-detail.json), while `effective_owner` was already generalized 2026-07-13 to board-OR-detail. A board row carrying `plan_only`/`next_agent` inline with NO detail entry slipped every gate — RAW dry-run confirmed 28 leaked rows (4 P1 incl. `GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC` next_agent=architect; all 8 `UC-*-UNVERIFIED-BATCH` next_agent=ba).

**Actions taken:** Added `effective_plan_only` (board-OR-detail, mirrors `effective_supervised`) and `effective_next_agent` (detail-first/board-fallback, mirrors `effective_owner`); `is_plan_only`/`is_non_dev_next_agent_unrouted` now delegate to them, dropping the old "board next_agent empty" precondition. Updated header gate-block (`EFFECTIVE-DISPOSITION GATE` section) + `docs/agents/dev-team/flow/main.md` gate descriptions. Extended `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh`: AC-8 (live-discovered, no hardcoded IDs — inline non-dev board next_agent, no detail entry), AC-9 (synthetic — inline board plan_only:true, no detail entry), AC-10 (synthetic control — inline dev-role next_agent, no detail entry); corrected AC-6's fixture (`next_agent` "architect"→"developer" — the new gate now correctly catches "architect" so it can't serve as an "already-routed" filler anymore).

**Verification:** Full verifier 12/12 assertions PASS (AC-1..AC-10 + control). Direct proof: isolated fixtures of the 4 named P1 leak rows + all 8 `UC-*-UNVERIFIED-BATCH` rows (supervised stamp stripped to isolate the NEW gate from the pre-existing stopgap) resolved NOT-promoted post-fix (all 12 were confirmed promotable pre-fix). jq syntax validated (`-f` dry-parse on minimal fixture). No hardcoded task-id literals (grep-clean).

**Board:** Moving `task_board.in_progress[FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE]` → `task_board.review[]` (status REVIEW, next_agent=qa) + `.head` synced to idle, via `orch-apply.sh`.

**Scope discipline:** Touched only `scripts/devteam-backlog-promote-bounded1.jq`, `scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh`, `docs/agents/dev-team/flow/main.md` + this notebook + decision journal. Did not touch the sibling `FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE` backlog row (already PO-held supervised:true / SUPERSEDED-BY note) or any of the ~90 unrelated peer-dirty files in the tree.

Zone health: `scripts/devteam-backlog-promote-bounded1.jq` BOUNDED-1 disposition gates — plan_only + next_agent now board-OR-detail effective, no known inline-no-detail leak class remaining | HEALTHY

## Session 2026-07-21 — FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (router-directed, scripts/, recurring_bug_count=4) — REVIEW

**Task:** `repointPayloadRefs()`'s jq `execFileSync` call (drain-signals.js:233) had no `maxBuffer`; jq's `{doc,changed}` output re-emits the whole orch-state doc, which crossed Node's default 1,048,576-byte cap the moment the live file passed 1,109,434 bytes — `ENOBUFS` thrown every run since, caught, and reported as a "non-fatal" WARN, so the shipped repoint fix has been silently dead in production. Same catch also mis-classified a genuine computation failure as equivalent to "nothing to repoint."

**Actions taken:** Added explicit `maxBuffer: 64MB` (comment cites measured numbers + row id) to the jq `execFileSync` call. Reclassified the catch at 240-245 from silent `WARN`+`return` to `FAIL-LOUD`+`process.exit(1)`, matching the existing FAIL-LOUD pattern at lines ~268/272; left the genuinely-benign `!result.changed` branch untouched. Grepped `scripts/agents-flow/` for other `execFileSync`/`spawnSync` reading orch-state.json (or any file that can grow past 1MB) without `maxBuffer` — none found; every other call either queries a small sqlite3 aggregate or (the orch-apply.sh invocation) never echoes the doc back to stdout.

**Verification (RED-before, twice):** (1) natural TDD order — new `drain-signals.test.js` ENOBUFS scenario (isolated harness, >1MB orch-state.json fixture padded via schema-safe `dashboard_section_cache`, never the live SSOT) against the then-current unfixed code: 21/22 pass, 1 FAIL (`spawnSync jq ENOBUFS` swallowed, payload_ref left dangling). (2) `git stash push --keep-index` on `drain-signals.js` only (test file kept) reproduced the identical 21/22 failure against the reverted file. After the fix, both re-runs: 22/22 GREEN. Live orch-state.json currently 1,112,468 bytes — 64MB maxBuffer gives ~57x headroom.

**Also emitted (not fixed, per instruction):** `docs/signals/2026-07-21T162233Z-drain-predicate-price-anomaly-family.json` to `po` — drain's non-routable-shape predicate never matches `price_anomaly_v1` (7 files stranded in inbox, one live/minutes-old carrying real VN-Index/sector data); PO's earlier "cowork-team telemetry only" characterization of the drain-skip blast radius is incomplete. Scope adjudication left to PO — no board row minted, task not widened.

**Router mid-task note:** router's own `git add -A` + `git commit -m` swept an unrelated pre-existing HEAD state (commit `84096f617`, already containing the pre-maxBuffer shipped code — not my edits, I had not yet touched either file at that point) into an auditor commit. No work of mine was lost; RED evidence above was captured entirely after that point, against the then-current HEAD content.

**Board:** `task_board.backlog[FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE]` → REVIEW, next_agent=qa, via `orch-apply.sh`.

**Scope discipline:** Touched only `scripts/agents-flow/drain-signals.js`, `scripts/agents-flow/drain-signals.test.js`, this notebook, decision journal, + the new po-addressed signal file. Did not touch the price_anomaly predicate itself, did not touch live `docs/data/orch/orch-state.json`.

Zone health: `scripts/agents-flow/drain-signals.js` payload_ref repoint path — now buffer-safe past 1MB + FAIL-LOUD on genuine computation failure; price_anomaly drain-skip family flagged to PO as a distinct, unfixed gap | HEALTHY (repoint) / KNOWN-GAP (price_anomaly, PO-owned)
