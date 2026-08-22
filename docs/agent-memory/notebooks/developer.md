# Developer — Notebook

**Last updated:** 2026-08-22T19:35:51Z | **Cycle:** FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER (P1 M, cross-service/, ready[] direct pickup, session 02594cce)

## Session 2026-08-22T19:35:51Z — FIX-CI-GATES-INVISIBLE-TO-PREPUSH-DOCS-PATH-FILTER (cross-service/, developer, P1 M, ready[] direct pickup per architect brief 2026-08-05, session 02594cce)

**Task:** root-cause fix for 30 consecutive CI-red runs — `scripts/git-hooks/pre-push` ran only `tsc`+`rebuild-raw-verify-check.sh`, gated behind `CODE_TOUCHING_REGEX` which excludes `docs/`; 2 of 3 real CI-red incidents (`9af50bb26` CLAUDE.md, `3ce726a6e` docs/agents/po/flow/sprint-kickoff.md) landed on exactly the paths that regex excludes, so `size-lint`/`task-claim-owner-session-lint`/`tool-registry-parity` — all enforced separately in CI — never ran locally on a docs-only push. Architect brief (2026-08-05) pre-measured AC1 (~19.5-20s combined, well inside the 90s commit-mutex TTL) and specified the exact hook-diff shape; this cycle implemented it verbatim.

**Fix:** added `run_doc_shaped_checks()` to `scripts/git-hooks/pre-push` — runs all 3 checks UNCONDITIONALLY, placed before `PRE_PUSH_SKIP_TSC` (correcting that guard's name — it now only skips tsc/rebuild-raw-verify, not the whole hook, closing a second unintended escape hatch). `tsc` + `rebuild-raw-verify-check.sh` untouched on the existing regex gate.

**Tests:** new `scripts/git-hooks/pre-push.test.sh`, 4 scenarios (isolated mktemp scratch-repo idiom mirroring `pre-commit.test.sh`'s `new_repo()`, real audit scripts copied in so each resolves its own `git rev-parse --show-toplevel` correctly): T1 doc-only clean push runs+passes all 3, tsc skipped; T2 a failing task-claim-lint fixture (same shape as the real `3ce726a6e` incident) on an otherwise docs-only push still BLOCKS; T3 code-touching push still runs all 3 AND still invokes tsc (stub-pnpm sentinel); T4 bun-absent WARN+skip of parity only is fail-open (isolated from T2's failure since `run_doc_shaped_checks()`'s sequential `|| return 1` short-circuits before the bun branch on an earlier failure — noted in the test file, not overclaimed). 4/4 pass, `shellcheck` clean on the hook itself.

**Live dry-run (AC4):** re-ran all 3 checks directly against repo HEAD — all PASS (~21s combined). The 3 symptom rows this row's own fence explicitly excludes credit for (`FIX-CI-SIZELINT-BCTC-1345B-...`/`FIX-CI-PARITY-CLAUDEMD-...`/`FIX-CI-TASKCLAIM-PO-FLOW-...`) had each independently landed by this cycle — confirms local/CI parity is restored, not that this row fixed those 3.

**Docs:** `docs/policies/dev-standards.md` new CANONICAL entry (size-justification header note updated); `docs/WORK.md` one-liner. No handoff file — architect_brief substituted (PO-mint board row, architect designed direct-to-developer per the row's own routing note). Simplicity gate: PASS (Q1-Q4 clean, no excess vs the brief's own spec). Graphify skipped — no Skill-tool binding, same structural gap as prior sessions.

**Closeout:** commits `23c97bbb3` (hook + test + dev-standards.md), `553496834` (WORK.md). No `apps/` TS/Go touched — pure bash, `bun test`/`tsc` N/A. Board `ready[]→review[]`, `next_agent: qa` — row's own `verification_gate` (`dry_run_measured_then_ci_green`) needs a subsequent green CI run on the push that ships this commit; push/commit-mutex is the dispatcher's job (INV-GATEWAY-1), not run by this specialist session (no MCP task_claim/commit-mutex tool grant either).

---

## Session 2026-08-22T17:52:00Z — FIX-AUDITOR-DATA-TIER-NOTEBOOK-WRITE-PATH-UNWIRED (cross-service/, developer, P0 S, ready[] direct pickup, session 02594cce)

**Task:** AUDIT_TIER=DATA had no row in system-auditor's `main.md` §Tier Dispatch (L138-143) and was bound to no notebook-write actuator — DATA cycles hand-wrote the notebook freehand. Two live corrupting commits same day: `22039783e` (DATA sweep) EOF-appended its own section instead of prepending+pruning; `f25dc3d27` (Tier-1, inherited the corrupt file) then destroyed 4 retained sections and duplicated heading `c104`.

**Fix:** (1) `main.md` — added a real `TIER=DATA` §Tier Dispatch row binding it to `notebook (gated) → RETURN`, matching every other tier; corrected the L130 extraction bullet. (2) Necessary corollary, same file: added `elif AUDIT_TIER == "DATA"` to §Step 0d (full-precision `FIRE_TICK`, no boundary — dedup is `db-integrity-probe.sh`'s own SKIP-SPAWN pre-gate) — without it a live DATA cycle would hit the Fail-loud FIRE_TICK guard's FATAL EXIT (regression, not a fix). (3) `cron-db-data-integrity.md` — one clause: notebook write is not hand-authored, main.md's gate/write run unchanged. `scripts/notebook-compose.sh` itself untouched (never the problem, 9/9 tested).

**AC-3 data repair:** re-ran the real `scripts/notebook-compose.sh` actuator against `git show f25dc3d27^:...` (true pre-corruption parent) with the surviving Tier-1 section renumbered c104→c105, retention=3/cap=150 — reproduced this row's own `measured_evidence` replay exactly: `OK sections=3 dropped=3 lines=172`, retaining `c103`/`d4-auto` byte-identical.

**AC-4** verified live: `grep AUDIT_TIER= .claude/commands/crons/*.md` → `{1,2,3,4,5,DATA}`, all now have a Tier Dispatch row. **AC-5** cannot close this cycle by construction (needs 3 real post-ship cycles incl. 1 DATA fire + a `git log --grep=notebook-compose` hit) — flagged on the board row for a later RAW-verify pass, not narrated as done.

**Closeout:** 3 commits — `35be008d0` (notebook repair, separate+first per AC-3), `a7262f6e9` (main.md + cron doc), `cb255145d` (board `ready[]→review[]`, next_agent=qa). No `apps/` TS/Go touched — pure flow-doc + prompt-doc + notebook-data fix, `bun test`/`tsc` N/A. Graphify skipped (no Skill-tool binding, same structural gap as prior Task-tool-spawned cycles).

---

## Session 2026-08-15T13:25:57Z — FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR (cross-service/, developer, P0 S, review[] SECONDARY-Drain sign-off triage, session 632721c2)

**Task:** stale `review[]` row (branch:null, direct-commit, same precondition as PRIMARY QA-Drain, `next_agent=developer` so SECONDARY-Drain routed it here) — take next action per own judgment: DONE_VERIFIED / rework / reassign / BLOCKED. Router flagged an open question: RAW-check whether a companion `-2026-08-14`-suffixed id already implements this row's AC-1/AC-2/AC-3, do not assume duplication either way.

**RAW-verified, not trusted from the row's own status_note prose:** searched orch-state.json (`jq .. | objects | select(.id?==...)`) and `git log --all` for the `-2026-08-14` suffix — it does not exist anywhere. The real fix landed under THIS EXACT task_id: commit `b27ba6507` (2026-08-14T04:17:20+02:00, tagged `Task: FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR` verbatim), 45s before `f08bb1c2d` moved this SAME row IN_PROGRESS→REVIEW. Not a duplicate — this review row IS the review checkpoint for that already-landed commit.

**AC-1** (single-write full drain, no `ORCH_APPLY_ALLOW_SHRINK`): confirmed in code — `orch-conservation-check.mjs`'s `signalTotal()` dropped `pending_triage_inbox`, new `undeclaredInboxDrops()` + `ORCH_APPLY_DECLARED_INBOX_TRIAGED` guard it independently; `dev-team/flow/main.md` Step 1 passes `consumed_ids_csv` as the declaration. ALSO confirmed live in production: 8 real durable-inbox CLEAR commits landed 2026-08-14/08-15 post-fix (44/12/9/33/17/29 envelopes among them), every one a single write, no sub-batching, no bypass — sharp contrast to the pre-fix incidents (29 env/4 writes 08-11, 248 env/4 writes 08-14) this row itself documents. **AC-2** (abort message names the correct path): confirmed verbatim in `orch-conservation-check.mjs` — explicitly says do NOT set `ORCH_APPLY_ALLOW_SHRINK`, names `ORCH_APPLY_DECLARED_INBOX_TRIAGED`. **AC-3** (29-envelope regression, exit 0, no bypass): `INBOX-FULL-DRAIN-DECLARED` in `scripts/test/orch-apply-wrapper-tests.sh`, re-ran the FULL suite live — 89/89 PASS, including that test plus the negative controls (`INBOX-DROP-UNDECLARED-REJECTED` exit 1, `INBOX-DROP-ALLOW-SHRINK-NO-BYPASS` exit 1). All 4 files in the row's `files[]` list confirmed touched, none reverted.

**Disposition:** DONE_VERIFIED. `review[] → done_verified[]` via `scripts/orch-apply.sh`.

**Regression:** `bash scripts/test/orch-apply-wrapper-tests.sh` 89/89. No `apps/` TS/Go touched, no code change this cycle — pure board-state closeout following the `FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE` (`7bdeb606e`) precedent for a review-lane SECONDARY-Drain row whose deliverable was found already-shipped.

**Closeout:** board write only (this cycle), pathspec-scoped commit pending. Decision-journal entry appended to `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer-7.md` (S55). No handoff file (flat `review[]` row, SECONDARY-Drain's own dispatch context is the spec). Router (session 632721c2) held `task:FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR` — released via `task_release` at session close per lock-lifetime convention.

---
