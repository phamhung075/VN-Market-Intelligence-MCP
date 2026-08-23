## Task Report TASK-CRON-LIVENESS-PROBE-TESTS
changed: [scripts/agents-flow/cron-marker-liveness-probe.test.sh (new, 425L, 87 assertions)]
commit: 2c9998018 (direct to main — no task branch, project-wide "NO branches" policy; shared commit with sibling row TASK-CRON-LIVENESS-PROBE-SCRIPT, verified independently by a concurrent qa session)
tests: 87 pass / 0 fail (fully mocked, zero real ps/stat/network) | tsc: N/A (bash zone, no .ts touched, no tsc script at repo root) | ddd: N/A (bash zone) | security: PASS (no process.env, no hardcoded secrets) | mock-guard: PASS (0 findings — `.sh` outside `.ts/.tsx/.py/.go` scan scope, compensated with manual read)
verdict: APPROVED — vc-approved (DONE_VERIFIED)

### Verification method
Direct-Commit Verify (`verify-committed` JUMP-TO, row arrived correctly in `task_board.qa[]`/`status: QA`). `git merge-base --is-ancestor 2c9998018 main` → yes. `git show --stat 2c9998018` confirms the commit touches the row's claimed file `scripts/agents-flow/cron-marker-liveness-probe.test.sh` (shared commit also carries the sibling `.sh`, a `docs/policies/dev-standards.md` CANONICAL pointer, and a `docs/WORK.md` entry — all confirmed present).

### False-green check (test-specific bar per dispatch note)
This fleet has a documented false-green history — a passing suite that never exercised the defect. A clean 87/87 rerun alone does not establish that; independently reproduced the mutation test the row's `review_note` claimed, on a disposable scratch copy (originals never touched):
1. Copied `cron-marker-liveness-probe.sh` + `.test.sh` to `/private/tmp/.../scratchpad/`.
2. Mutated the copy: hoisted the O2 (transcript-mtime) check ABOVE the O1 (pid-triple) check in `run_probe()`'s verdict block — the exact class of defect that caused the real 8h10m incident (any O2-primary design returns LIVE for a corpse whose transcript happens to be fresh).
3. Ran the UNMODIFIED test file against the mutant probe: **3 F1 assertions went RED** — `verdict got='LIVE' want='DEAD'`, `action got='no_op' want='release_and_register'`, `exit got='0' want='1'` — 84 passed / 3 failed, `OVERALL: FAIL`.
4. Confirms F1 genuinely exercises the O1-outranks-O2 ordering and is not vacuous — a suite that passed both before and after the fix would have proven nothing.

Re-ran the real (unmutated) suite independently: `bash scripts/agents-flow/cron-marker-liveness-probe.test.sh` → 87/87 PASS, matches the row's own claim exactly. F1 (2026-08-23 corpse, false-LIVE direction) and F2 (live standalone, false-DEAD direction) both present and both pass under the same spec, satisfying the parent row's stated thesis.

Not OOM-class (liveness-oracle fix, no memory/crash claim) — Durability Gate N/A. Not BCTC-class — Eval Gate N/A.

### Actuation
Verdict landed via the flow's `FIX-QA-VC-LANEMOVE` jq/`orch-apply.sh` block: dry-ran first against a fixture (`ORCH_APPLY_LIVE_FILE_OVERRIDE`), confirmed exit 0, then executed live: `.task_board.qa[] -> .task_board.done_verified[]`, `status: QA -> DONE_VERIFIED`, `verification.raw_probe` written in the same write, `next_agent` key deleted (not nulled, per `orchStateSchema.ts:208` `z.string().optional()`). Self-verify passed: row in `done_verified[]` with `status==DONE_VERIFIED`, no `next_agent` key, `verification.raw_probe.tool` present; absent from `qa[]`.

Sibling row `TASK-CRON-LIVENESS-PROBE-SCRIPT` (same commit, claimed in the same batch) was verified independently by a concurrent qa session — not re-verified or moved here per dispatch scoping. Post-write confirmed both landed with no CAS collision, both now `DONE_VERIFIED`.

Decision journal: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-26.md` STEP qa-S163.
