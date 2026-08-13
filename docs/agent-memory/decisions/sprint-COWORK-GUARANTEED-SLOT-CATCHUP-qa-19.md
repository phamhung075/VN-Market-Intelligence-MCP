# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up firing for elapsed guaranteed slots, or a structured (non-silent) miss.
**Agent:** qa
**Started:** 2026-08-12T17:32:00Z

---

### STEP qa-S95 · qa · 2026-08-12T17:32:00Z
**task-id:** FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null`, no `.commit` field — derived via `git log -- <2 files named in row's own review_note prose>`). Found commit `e9caf2ac3` (2026-07-29T10:58:53Z, ~42min after row's `promoted_at`), on main ancestry, `git show --stat` matches all 5 files the review_note claims exactly (2 job files + 3 test files, incl. the 3rd-file fixture-regression fix it self-disclosed).
**what-considered:**
- Read both diff hunks directly, not trusted from prose: `bctcPdfPullJob.ts` UPDATE now unconditionally sets `reconcile_attempts = 0` on every `pek_triggered` write; `bctcQueueEnricherJob.ts` Arm-2 recycle UPDATE now also sets `attempts = 0` — exact match to the row's title/detail.
- Confirmed `reconcile_attempts` pre-exists in real prod schema (`schema-financial-reports.ts:305-307`, ALTER-guarded) — "no schema migration" claim holds, not just true in the test fixture.
- Re-ran real tests, not trusted from prose: exact 3 touched test files 44/44 pass (incl. the new regression test asserting `reconcile_attempts` resets from a seeded stale 8→0). Widened to all 20 files that actually call `runBctcQueueEnricherJob`/`runBctcPdfPullJob` (superset of claimed "7-file suite") — 196/196 pass, zero regressions on any consumer of the shared UPDATE statements. `tsc --noEmit` clean. `mock-guard.sh --files` PASS on both production files.
- DDD/security greps on the 2 files: infra/application imports present but pre-existing (scheduler layer, file's own doc-comment declares "imports from infrastructure only" — not new from this diff); zero `process.env`/secret hits.
- Did NOT reproduce the claimed full 14906-test/54-fail run — cross-checked plausibility instead via `docs/policies/dev-standards.md`'s CANONICAL `FIX-MCP-SUITE-HEALTH-BASELINE` note (standing order-dependent full-suite red, drifted 40→42 at last doc update; claim's 54 is in the same drifting-red family, not a fabricated number) + my own targeted/widened re-run already proving zero net-new failures on the touched surface.
**why-decision:** vc-approved, DONE_VERIFIED. Zero ISSUE — commit real, all 5 files match, logic matches title/detail verbatim, tests independently re-run (both exact-touched and widened-consumer sets) all green, tsc/mock-guard/DDD/security clean, schema claim verified against real (non-fixture) schema file.
**why-change:** none — verdict matches developer's own claim.

### STEP qa-S96 · qa · 2026-08-13T10:20:00Z
**task-id:** FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP
**what-done:** Direct-Commit Verify (Review-Lane QA-Drain, `branch:null`, row carries no `review_note`/`.commit`/`.files[]` — only `.note` + `reviewed_at:2026-07-29T13:09:41Z`/`reviewed_by:developer`). Derived commit via `git log --grep` on the task id; found `29bdc58cf` (2026-07-29T13:09:14Z, 27s before `reviewed_at` — plausible), on main ancestry.
**what-considered:**
- `git show --stat` matches the commit's own claimed 5 files exactly: `post-cycle.md`(+49L Step 4.4), `main.md`(+6L), new `scripts/devteam-wrapper-autoclose.jq`(129L), new `scripts/audits/devteam-wrapper-autoclose-verify.sh`(224L), `scripts/lib/devteam-eligibility.jq`(+53L, append-only, confirmed no existing def reordered).
- Cross-corroborated against dev-team's own contemporaneous RAW-verify (`bd6f3f013`, same day) — independent second source, not just this commit's own prose.
- Content matches row's `.note` field verbatim: Step 4.4 sweeps `ready[]`/`in_progress[]` for epic-wrapper rows with `all_children_terminal`, auto-dispatches resolved `next_agent`/owner for closeout — exact match to the note's "Fix:" paragraph.
- Independently re-ran `scripts/audits/devteam-wrapper-autoclose-verify.sh` myself (not trusted from prose) — **10/10 PASS**, exact match to claim. Confirmed all 4 new predicates (`normalize_task_status`/`is_terminal_task_status`/`has_hold_reason`/`all_children_terminal`) genuinely present in current `devteam-eligibility.jq` (file has 4 later unrelated feature-appends since, none touching these 4 defs). `tsc --noEmit` clean (no TS surface). `mock-guard.sh --files` on the 3 script files: N/A (jq/sh, not scanned) — non-blocking, no TS/JS production source touched. Zero `process.env`/secret/password/token hits on the 3 scripts.
- Files confirmed still on disk unaltered since the commit; one later commit (`dc2152a10`) touched `post-cycle.md` again but only a single unrelated line (notebook-commit pathspec fix), not the Step 4.4 section.
**why-decision:** vc-approved, DONE_VERIFIED. Zero ISSUE — commit real, files match exactly, implementation matches the row's own `.note` description verbatim, verifier independently re-run 10/10, no security/DDD/tsc issues, second independent source (dev-team's own same-day RAW-verify) corroborates.
**why-change:** none — verdict matches prior review's own finding.

### STEP qa-S97 · qa · 2026-08-13T10:30:00Z
**task-id:** SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME
**what-done:** Direct-Commit Verify (Review-Lane QA-Drain, `branch:null`, no `.commit`/`.files[]` field — derived via `git log --grep` on task id + file-path search on the new test file's own name). Found commit `2ae2c19d1` (2026-07-29T18:08:50+02:00), on main ancestry.
**what-considered:**
- `git show --stat` matches all files `review_note` claims: `agentSignalStore.ts`(+93L new `getBroadcastSignals`), `getCycleBootstrap.ts`(+25L new `getInboxSignals` merge+dedup), new `SPIKE-BOOTSTRAP-BROADCAST-CATALYST-CONSUME.test.ts`(173L), `get_cycle_bootstrap.md`(+7L) — plus its own notebook/journal/board-state commit companions, no extra production files.
- Diff read directly, not trusted from prose: `getBroadcastSignals(db)` is genuinely non-consuming (`WHERE to_agent='all' AND expires_at > now()`, zero `status` filter, zero UPDATE); `getInboxSignals()` unions it with `getSignals()`'s consuming result, dedup by id, sorted — exact match to claim. Cross-corroborated against dev-team's own contemporaneous RAW-verify (`19424a2c2`, same day) which independently re-derived the same root cause from source.
- Re-ran tests myself: new test file **5/5 pass** (exact match). Re-derived the "targeted 12-file suite" via grep on `getSignals\|getBroadcastSignals\|getCycleBootstrap\|getInboxSignals` across `__tests__/` → 12 pre-existing + the new file = 13; ran the 12 pre-existing alone: **103/103 pass** (claim said 87/87 — count mismatch, but 0 fail either way, same non-blocking prose-miscount class as cycle-682/TASK_2006's suite-glob mismatch, not a fabrication — file composition likely drifted over the intervening 2 weeks of unrelated commits touching the same store). Full 13-file run (incl. new test): 108/108. `tsc --noEmit` clean. `mock-guard.sh --files` PASS on both production files. DDD: `getCycleBootstrap.ts`'s infra import is pre-existing (same import line present before this diff, only the import LIST widened) — not a new violation. Zero `process.env`/secret hits.
- Live health probe (port 3000, running container): `toolCount=183` vs claim's `184` — container is a stale/later-drifted deployed image (2+ weeks of intervening deploys), not evidence against THIS diff (diff touches zero tool-registration files, only internal store/usecase helpers) — non-blocking.
- Did not reproduce the full 14901-test run — CANONICAL `FIX-MCP-SUITE-HEALTH-BASELINE` reading applies (targeted/merge-gate suite is the correct bar, not repo-wide); my own targeted re-run already proves zero net-new failures on the touched surface.
**why-decision:** vc-approved, DONE_VERIFIED. Zero ISSUE — commit real, files match, root-cause+fix logic verified directly from source (not prose), new regression test green, targeted suite 0 fail (count mismatch non-blocking), tsc/mock-guard/DDD/security clean, second independent source corroborates.
**why-change:** none — verdict matches developer's own claim; router's CI-red note (separate, unrelated pre-existing issue on current HEAD, 2 weeks after this commit) confirmed NOT connected — this commit's own targeted suite is clean.

### STEP qa-S98 · qa · 2026-08-13T11:05:00Z
**task-id:** FIX-ORCHSTATE-CONSERVATION-GUARD-QA-LANE-BLIND
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`, no `.commit`/`.files[]` on the row) — derived commit via `git log --all -- scripts/orch-conservation-check.mjs`, found `9b39ed5cc` carrying exact `Task:`/`AC:` trailers matching this id; on main ancestry (`merge-base --is-ancestor` exit 0).
**what-considered:**
- Read the live file directly (not row prose): `FLAT_TASK_LANES` (line 139) includes `'qa'`; header-comment formula (lines ~19-27) lists `+ length(qa)` matching the array exactly — code==doc satisfied. `dev-standards.md`'s CANONICAL block never enumerates lanes literally (grep-confirmed), so the commit's claim "no dev-standards edit needed" holds.
- Re-ran the real negative control myself, not trusted from commit prose: `bash scripts/test/orch-apply-wrapper-tests.sh` → 75/75 PASS, incl. `QA-COLLAPSE` (qa[] wiped 50→0, live=60 total, exit 1 rejected, fixture byte-unchanged) and `QA-APPEND-HAPPY` (normal qa[] append, exit 0, length+1) — both ACs directly exercised live, not read from prior notebook claims.
- A later unrelated commit (`cc7e86829`, FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE) extended the same header comment further — confirmed `'qa'` survived that extension intact (still present in both array and prose).
- No TS touched (only `.mjs`/`.sh`/`.md`); mock-guard PASS (no production source under its scan scope); ran `apps/mcp-server` `bun tsc --noEmit` anyway as a broader regression check — clean, 0 errors.
**why-decision:** vc-approved, DONE_VERIFIED. All 3 acceptance clauses independently re-verified live (qa-collapse aborted, additive write unaffected, code/doc lane-set parity) — not the row's own prose (row carried none — no `review_note`/`status_note` at all, pure derivation from git history + live-file re-read).
**why-change:** none — verdict matches the row's deliverable/acceptance exactly.

### STEP qa-S99 · qa · 2026-08-13T11:02:38Z
**task-id:** FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null`, no `.commit`/`.files[]`/`.owner`) — derived commit via `git blame` on `repointPayloadRefs()`/`movedRefs`: `84096f6170` (bundled under an unrelated peer subject "fix(auditor-tier1): skip obsolete socat-bridge plist", sibling `0e28eed23`), on main ancestry. Independently re-ran `node scripts/agents-flow/drain-signals.test.js` → 51/51 PASS incl. the exact 3-assertion gate + ENOBUFS regression; `mock-guard.sh` PASS; no DDD/secret hits; `tsc` N/A (plain `.js` outside any tsconfig scope).
**what-considered:**
- MAJOR FINDING: `git log --all --grep="FIX-DRAIN-PAYLOADREF"` + `docs/data/orch/archive/2026-07.json` show this exact task-id was ALREADY implemented, QA-APPROVED, DONE_VERIFIED and round-2 re-gated on **2026-07-21** (double QA pass, `qa_regate_round2_by=qa`), then cold-evicted to archive. The live `qa[]` row's `review_note` is a **verbatim duplicate** of the archived row's `review_note` (word-for-word). Traced the duplicate's provenance: row re-entered `review[]` via a 2026-07-29 "un-strand stale row" board commit (`21d4c1809`), sat there ~2 weeks, then today's QA-Drain claimed it as if new.
- Considered treating this as CHANGES_REQUESTED/re-litigation vs. accepting: the underlying code fix is real, durable, and independently re-verified live at HEAD today (not stale) — no functional defect exists to fix. Chose APPROVED/DONE_VERIFIED (genuinely re-verified, not rubber-stamped) over blocking, since blocking would just re-run an already-closed loop with no code change possible.
- Flagged the task-id-collision/re-mint class as a board-hygiene issue in the row's own status_note for PO/router follow-up (not a QA-owned fix — task breakdown is PM's job, board hygiene is PO's).
**why-decision:** Fix genuinely present + tested live (51/51, exact gate assertions), commit real and on main — nothing left to block on. Duplicate-mint is a bookkeeping defect, not a code defect; approving avoids wasted re-dispatch of already-closed work while surfacing the collision for board-hygiene follow-up.
**why-change:** Verdict content differs from a routine pass — added the duplicate-provenance finding to status_note (not present in either prior QA pass, since neither knew about the other's re-mint) — everything else (fix correctness) matches the original 2026-07-21 double-QA verdict.

### STEP qa-S100 · qa · 2026-08-13T12:03:31Z
**task-id:** FACTORY-GUARD-CI-SIZELINT-IMPL
**what-done:** Direct-Commit Verify (Review-Lane QA-Drain, `branch:null`, row carries no `.commit`/`.files[]`/`.owner`) — derived commit via `git log --all` on the 3 new files named in `.note`: `22cd084d4` (2026-07-29), on main ancestry, `git show --stat` touches exactly the 5 claimed files (+`docs/WORK.md`).
**what-considered:**
- Ran the shipped smoke test myself: `size-lint-justification.test.sh` 6/6 PASS (all 4 DoD cases + 2 controls). Did not stop there — built my OWN independent fixtures (separate dir, not the test's) for new-offender/baseline-grown-past-tolerance/shrink-drop cases + a bare `--check` on live repo: all 4 reproduced identically (rc=1/1/0/dropped-from-baseline as expected) — not trusting dev's own test alone (feedback_router_verify_raw_not_badges).
- `bash scripts/audits/size-lint-justification.sh --check` on live repo: PASS, 0 offenders, scanned 1384 (repo has grown since the 665-entry baseline; ratchet still holds — no drift). CI corroboration: `size-lint` job green on 4 most-recent main-push CI runs (incl. today's), even though the aggregate `CI` workflow is currently red from 2 unrelated jobs (`bun test`, `task-claim-owner-session-lint`) — not this task's scope.
- No TS/production source touched (`.sh`/`.json`/`.yml`/`.md` only) — `bun test`/`tsc` structurally N/A; `mock-guard.sh --files` on the shell script → PASS "no production source files to scan" (correctly out of its `apps/*.ts|py|go` scan scope). dev-standards.md CANONICAL pointer present at line 1084, matches script usage exactly.
**why-decision:** vc-approved, DONE_VERIFIED. All 6 DoD items independently reproduced on my own fixtures (not just the shipped test), CI job green across multiple runs, doc pointer present, zero ISSUE.
**why-change:** none — verdict matches developer's own claim, verified fresh not from prose.

### STEP qa-S101 · qa · 2026-08-13T14:15:00Z
**task-id:** FE-PG-_INDEX-FRESH-FIX
**what-done:** Direct-Commit Verify — re-ran everything myself: commit `3184247ab`(+docs `969360919`) on main ancestry, diff matches claim exactly (dashboard._index.tsx loader wiring + new 6-case unit-test file). Backend `data_asof` field confirmed live (`marketDigestHandler.ts:71,169`). Re-checked live `:3001` container per task's own PENDING-REBUILD-recheck instruction.
**what-considered:**
- MAJOR FINDING: local `node_modules` (pnpm-resolved) had drifted off the committed `bun.lock` — produced a false esbuild "Host version mismatch" service crash AND a false-positive 30-test TopNav Router-context cascade across 6 files, unrelated to this task (TopNav.tsx last touched 06-30/07-02, weeks before this fix). `bun install --frozen-lockfile` (CI-parity, matches `.github/workflows/ci.yml`) made both vanish — confirms env drift, not a code regression.
- Post-reinstall: targeted 6/6 new unit tests GREEN; full suite 2183 pass/2 fail (exact same pre-existing QUE-TOOLTIP failures the 07-29 RAW-verify already confirmed unrelated); tsc clean; mock-guard PASS.
- Live `:3001`: `docker inspect` Created=2026-07-24 (predates this 07-29 commit); `curl /dashboard` shows no freshness/stale markup — PENDING-REBUILD deploy-gap still open, same class as sibling rows, ops-owned not a code defect.
**why-decision:** APPROVED, DONE_VERIFIED. Code fix genuinely correct + independently re-verified live (tests/tsc/mock-guard/backend field), not rubber-stamped from prose. Only outstanding gap (container rebuild) is ops-owned, explicitly out of this row's scope per task framing.
**why-change:** New finding vs. 07-29 note — host `node_modules`/`bun.lock` drift was masking 30 unrelated failures as false regressions; flagged separately (bug channel), not folded into this verdict.
