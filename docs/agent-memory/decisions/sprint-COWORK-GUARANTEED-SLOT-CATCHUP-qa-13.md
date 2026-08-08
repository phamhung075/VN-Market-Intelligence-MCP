# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** COWORK-GUARANTEED-SLOT-CATCHUP
**Agent:** qa
**Started:** 2026-08-08T16:36:00Z

---

### STEP qa-S1 · qa · 2026-08-08T16:36:00Z
**task-id:** FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`). Row's own `commit_sha` (8b415f6a2) FAILED `git merge-base --is-ancestor` against main; `git fsck --unreachable` confirmed it a dangling object — router's dispatch note flagged this exact provenance detail as worth re-checking.
**what-considered:**
- Traced real landing commit via `git log -- embedder.py`: `b85b524f1`, same author/message, committer-date ~56min after the dangling commit's author-date (Stage-1c retry re-apply, matching the row's own dev_implementation_note). Diff byte-identical (+8L header only) — confirms re-applied, not missing work. Corrected `commit_sha` as part of the lane-move, not a rework request.
- `b85b524f1` confirmed on both local main and origin/main ancestry (genuinely pushed). Header text + `wc -l`=175 match claim exactly. `size-lint-baseline.json` genuinely untouched (AC2 honored).
- Re-ran RAW: scoped `size-lint-justification.sh --check` (embedder.py only) PASS 0 offenders; `pytest -k embedder` 17/17; full rag-service suite 175/175; `mock-guard.sh` PASS; comment-only diff, DDD/security greps trivially clean.
- Local full-repo `--check` shows 2 offenders but working tree carries an UNRELATED peer's dirty uncommitted `transport.ts` (same pollution as sibling qa-S16 app_factory.py verify, prior journal file). Live CI (`gh run view 31266835487`, headSha=b744d509e=current main HEAD) shows size-lint failing on exactly 1 file: `coordinationStore.ts` (separate row). embedder.py absent from both lists.
**why-decision:** APPROVED, DONE_VERIFIED — AC1-AC3 fully met under independent re-run; AC4's literal CI-job==success blocked solely by the separate coordinationStore.ts row, out of this row's scope (same precedent as qa-S12/qa-S16 this sprint).
**why-change:** commit_sha corrected 8b415f6a2→b85b524f1 in the same write; no code rework requested.

### STEP qa-S2 · qa · 2026-08-08T16:35:07Z
**task-id:** FIX-EMITSIGNAL-E3-RC1-OPAQUE-FATAL-DROPS-DETECTOR-FINDING
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of `bbf3d907f` (`scripts/emit-audit-signal.sh` + `scripts/emit-audit-signal.test.sh`), on main ancestry, `git show --stat` matches exactly the 2 files this fix scoped.
**what-considered:**
- AC-1 (diagnosability): confirmed `_orch_apply_invoke()` now does `ORCH_APPLY_STDERR=$(bash "$ORCH_APPLY_SH" 2>&1)` instead of discarding stderr; `_e3_write_row()` greps `^\[orch-apply\] (ABORTED|ERROR):` and threads the reason into BOTH the `e3-write-failed`/`e3-cas-exhausted` marker and `_send_orphan_bug_telegram`.
- AC-2 (correctness, 3-way split): cross-checked the grep pattern `^\[orch-apply\] ABORTED: validator exit` against live `scripts/orch-apply.sh:141` text — exact match. Validator-abort routes to `continue` (CAS-retry lane, rc left at true 1, not overwritten). Confirmed stamping-abort (:164) and conservation-abort (:184) both lack "validator exit" so both fall through to the fatal `else` — matches AC's named "keep CONSERVATION-abort fatal" plus the 3-way split description.
- AC-3: extended `emit-audit-signal.test.sh` T32 (validator-abort race, retries+recovers) + T33 (conservation-abort, stays fatal, reason propagates). Did NOT trust the commit message's RED/GREEN claim — checked out `bbf3d907f^`'s `emit-audit-signal.sh` into the live tree, reran suite: T32 4/4 FAIL, T33 2/6 FAIL (the 2 AC-1 reason-propagation checks) = 12/123 fail, confirming genuine RED at parent. Restored HEAD file (`git diff` clean after), reran: 123/123 pass, confirming GREEN at HEAD.
- `bash -n` clean, `shellcheck` only pre-existing SC1091 info (unrelated). `mock-guard.sh --files scripts/emit-audit-signal.sh` → PASS (bash, not a mock-guard scan target). No `apps/` TS touched (zone `cross-service/`) — `bun test`/`tsc` structurally N/A, matches WORK.md changelog claim.
**why-decision:** APPROVED, DONE_VERIFIED. All 3 ACs independently re-verified against live code + a genuine RED-then-GREEN re-run I performed myself, not the row's own prose or commit message.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S3 · qa · 2026-08-08T16:37:00Z
**task-id:** FIX-CI-SIZELINT-SCHEMA-TS-DEFLAKE-REGRESSION-372L
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`), recurring-bug P1 extra scrutiny. Derived commit `6ca2a0c65` via `git log -- schema.ts` (row carried no explicit `commit` field), on main ancestry, `git show --stat` matches schema.ts exactly; `size-lint-baseline.json` (row's 2nd claimed file) deliberately untouched — correct per AC2, not a gap.
**what-considered:**
- Diff shows REAL extraction, not a 3rd trim: full function bodies (HUT/1869b/VCB/BACKFILL_079/1489/1490 post-init block + migrateForeignFlowColumns/backfillDailyForeignFlow) relocated verbatim to 2 new files (79L/69L, both <120L, no justification header needed). schema.ts 372L→261L, 75L real headroom under 336L baseline — the exact recurrence pattern (daaef1d21's comment-trim, 2nd occurrence within 8h) NOT repeated.
- `size-lint-baseline.json` genuinely untouched (schema.ts entry still 336; commit stat touches only the 3 .ts files) — AC2 honored.
- Re-ran RAW: `size-lint-justification.sh --check` (mine) → schema.ts absent from offenders (2 present: coordinationStore.ts + local-dirty transport.ts, neither is schema.ts). `tsc --noEmit` 0 errors — dev's "blocked in worktree" excuse did NOT reproduce here. Scoped 172/172 pass across all 13 files importing extracted/re-exported fns incl. 1527-schema-slices.test.ts's explicit re-export assertion. CI's own per-file-isolation bun-test job on head b744d509e (descendant) = 15072 pass/40 skip/0 fail — far above the cited 9408/348 floor. mock-guard PASS, DDD/secret greps clean.
- busy_timeout-first PRAGMA (getDb) + WeakSet identity guard (`_initializedDbs`): diff shows ZERO touch to either block — byte-identical, both live deflake/leak fixes survived untouched (AC4 behavior-preservation).
- Found an ACTUAL fully-green CI run on a direct descendant (31145178420, head 06bf314e0, 2026-08-07T03:42Z): ALL 21 jobs incl. size-lint=success AND bun test=success — literal AC5 met. Current CI red is the separate already-tracked coordinationStore.ts/checkForeignFlowGap.ts row (FIX-CI-SIZELINT-COORDINATIONSTORE-BASELINE-1388L, READY/P0), same out-of-scope precedent as qa-S1 embedder.py this sprint.
**why-decision:** APPROVED, DONE_VERIFIED — genuine root-cause extraction breaks the recurrence, not a 3rd disguised trim; AC1-AC4 hold under independent re-run, AC5 literally satisfied on a post-fix green run.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S4 · qa · 2026-08-08T16:37:30Z
**task-id:** FIX-CI-SIZELINT-BCTCREFINED-PROJECTION-BASELINE
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`). Row's own `commit_sha:36fe87c31` FAILED `git merge-base --is-ancestor` (dangling object, `git fsck --unreachable` confirmed); traced via `git log --all --grep` on the `Task:` trailer to the real landing commit `ed0df780d` — identical `git patch-id`, same author/timestamp/subject, diff byte-identical modulo commit-hash header (routine rebase-hash-change artifact, same class as qa-S1 embedder.py this sprint). Corrected row's `commit` field to `ed0df780d`.
**what-considered:**
- AC1: header present in first-10-line window, `size-justification: 242L`; `wc -l` on the file = 242 exactly, matches.
- AC2: `git show --stat ed0df780d` = exactly 1 file changed (+8/-0, comment-only) — `size-lint-baseline.json` genuinely untouched, matching AC2's explicit "do NOT --update" instruction.
- AC3/AC4 literal full-repo RC=0/CI-job==success not met (1 remaining offender, `coordinationStore.ts`, separate READY row `FIX-CI-SIZELINT-COORDINATIONSTORE-BASELINE-1388L`, created 2026-08-08T00:01Z AFTER this fix landed 2026-08-07T01:36Z) but this row's OWN file confirmed clear two independent ways: (a) `git worktree add --detach HEAD` clean-tree scan — 1 offender only, coordinationStore.ts; (b) live CI `gh run view 31266835487` (headSha=HEAD b744d509e) size-lint job log — same single offender, getBctcRefinedTool.ts absent from both. A local dirty (uncommitted) peer `transport.ts` also surfaced as a false 2nd offender on the raw working tree — excluded, confirmed peer-WIP pollution via clean-worktree + live-CI cross-check (same pollution pattern as qa-S1/qa-S3).
- Re-ran RAW: `bun test FIX-GET-BCTC-REFINED-NO-PROJECTION-PARAM.test.ts` 7/7 pass, 50 expect() (exact match to dev claim); `bun tsc --noEmit` 0 errors; `mock-guard.sh --files getBctcRefinedTool.ts` PASS; diff is comment-only (8 insertions, 0 deletions) → DDD/security greps trivially clean, zero behavior change.
**why-decision:** APPROVED, DONE_VERIFIED — this row's own file genuinely cleared (AC1/AC2 fully met, AC3/AC4 met at the row's correct per-file scope); the still-red shared size-lint CI job is attributable entirely to the separate, already-tracked `FIX-CI-SIZELINT-COORDINATIONSTORE-BASELINE-1388L` row (same precedent as qa-S1/qa-S3 this sprint).
**why-change:** corrected row's `commit` field from dangling `36fe87c31` to the real landing commit `ed0df780d`; no other change from plan.
