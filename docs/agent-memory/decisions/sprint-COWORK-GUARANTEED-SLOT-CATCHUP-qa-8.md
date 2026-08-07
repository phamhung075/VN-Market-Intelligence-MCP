# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Not reopened for this row — cold-evict signal age-gate direct-commit verify riding the same dev-team Review-Lane QA-Drain batch; separate sub-agent instance (own file, mirrors qa-5/qa-6/qa-7 pattern) to avoid a concurrent-write collision with sibling QA sub-agents drain-verifying other rows in parallel.
**Agent:** qa
**Started:** 2026-08-06T21:53:00Z

---

### STEP qa-S1 · qa · 2026-08-06T21:53:00Z
**task-id:** FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of commit `d963b487b` (ANDs `$sig_cutoff` age term into `signal_queue.rows[]` terminal eviction).
**what-considered:**
- Row carries a `po_qa_hold_20260801T0432Z` sequencing hold: sign-off blocked until child `FIX-COLDEVICT-MALFORMED-TS-CATCH0-EVICTS-FRESH-SIGNAL-ROWS` (discriminator-gap fix) lands, else `catch 0` silently defeats this row's own new age gate for any non-second-precision `.ts`.
- Checked ancestry: child commit `f0644c14a` IS on main AND is a direct descendant of this row's own `d963b487b` (55min later, same day) — hold's condition satisfied in the live code, not waved through. Read the combined code (`orch-cold-evict.sh:353-373` normalizer + `:515-519` predicate call site) to confirm they compose, not merely coexist.
- Re-ran `scripts/test/orch-cold-evict-tests.sh` myself: 53/53 PASS (TEST 9 this row, TEST 10 child, T1-T8 regression-clean). Live `--dry-run` against real `orch-state.json`: 0 signal evictions, matching AC-3.
- `git show --stat` confirms 2/4 claimed files touched; other 2 (preflight.sh, SKILL.md) correctly untouched — grep-confirmed no other `TERMINAL_SIGNAL_STATUSES` call site, SKILL.md's 24h already correct pre-fix (HSC-7 2026-06-26).
**why-decision:** APPROVED, DONE_VERIFIED. PO hold independently verified satisfied against live main HEAD (not trusted from either row's prose); full regression suite + live dry-run both green.
**why-change:** none — verdict matches scope. Flagged (not fixed, out of scope) for next reviewer: sibling child row itself still sits `status=REVIEW`/`next_agent=qa` on the board — separate task-id, board bookkeeping only, its code is already live and re-verified working here.

### STEP qa-S2 · qa · 2026-08-07T00:00:00Z
**task-id:** TASK_601
**what-done:** Reviewed `951ddfdba` (already on main, no branch) — coordinationStore.ts gcExpiredLocks Phase-1 SELECT gains `AND task_id NOT LIKE 'cron-registration:%'`.
**what-considered:**
- Read Phase-2 DELETE (lines 590-601) directly: no task_id filter at all — deletes ALL expired rows unconditionally, so an expired cron-registration:* row still GCs, just silently. No AC-3a test exists yet (correctly deferred to TASK_603 per handoff scope).
- Both doc comments (ORPHAN_EMIT_ALLOW_LIST block ~449-458, inline Phase-1 ~512-517) updated with matching rationale to cron:*/dev-team-cron-singleton.
- `git show --stat`: 1 file, 11 insertions only — no unrelated changes. tsc clean (0 errors), mock-guard PASS, DDD/secret greps clean. Independently re-ran claimed scoped tests (FU-LOCKSTORE-EXPIRED-GC + task-lock-coordination-store): 54 pass/0 fail/163 expect(), matches handoff exactly.
**why-decision:** APPROVED, DONE_VERIFIED. AC-1 holds under direct code read + independent re-run, not trusted from handoff prose.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S3 · qa · 2026-08-07T00:00:00Z
**task-id:** TASK_602
**what-done:** Reviewed `86b31eccd`+`a5fa7bf7c` (already on main) — tasksMdJanitorJob.ts KNOWN_LEGIT_PREFIXES += "cron-registration:"; FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts +4 assertions.
**what-considered:**
- Read `isKnownLegitPattern`: `-singleton` suffix branch is a separate `endsWith` check (line 209); "cron-registration:" landed in KNOWN_LEGIT_PREFIXES (the `startsWith` prefix array, line 199) — correct branch confirmed by reading, not trusting prose.
- Did NOT trust the stash-claim in prose: independently reverted just the one array line (scoped edit, not full `git stash` — repo has unrelated dirty files), ran the test file myself → reproduced 27 pass/3 fail RED exactly; restored, re-ran → 30 pass/0 fail GREEN exactly. Also confirmed `"cron:"` alone does NOT match `cron-registration:*` (5th byte differs) so the 3 positive assertions are genuinely load-bearing, not coincidentally already-true.
- `git show --stat` on both commits: only the 2 claimed files (+ orch-state/handoff bookkeeping in a5fa). tsc clean, mock-guard PASS.
- Hard constraint: grepped both commits' `--name-only` — no touch to `docs/agents/system-auditor/handlers.md` or `audit-dimensions.md` (agent-father's zone); confirmed via `git log -1` those files' last touch predates this row.
**why-decision:** APPROVED, DONE_VERIFIED. AC-2 (prefix branch) + AC-3b (non-vacuous, empirically reproduced RED/GREEN myself) hold.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S4 · qa · 2026-08-07T01:30:00Z
**task-id:** TASK_603
**what-done:** Direct-commit verify (`review[]` row, full handoff, commit `814182608` already on main) of final gate task: AC-3a test, AC-4 full suite, AC-6 deploy, AC-5 doc-sync confirm.
**what-considered:**
- AC-3a: did NOT trust the developer's RED/GREEN prose. Independently reverted the `cron-registration:%` WHERE-clause line myself in `coordinationStore.ts` → scoped run 45 pass/1 fail RED, exact negative-control test failing (matches claim) → restored → `git diff --quiet` byte-identical to HEAD, confirmed → 46 pass/0 fail GREEN.
- AC-4: ran the full suite myself (`bun test`, 473.80s) rather than trust the two self-reported runs: 15157 pass/40 skip/44 fail/48043 expect() — pass/skip/fail counts match developer's Run 1 exactly (48043 vs claimed 48041 expect() calls, 2-call delta, consistent with the same documented order-dependent flaky floor that explains their own Run1-vs-Run2 delta). Grepped all 44 failing test names + awk-isolated the `task-lock-coordination-store.test.ts` block: zero overlap with coordinationStore/task_locks/cron-registration/tasksMdJanitorJob/isKnownLegitPattern/gcExpiredLocks. tsc clean, mock-guard PASS (test-file-only diff).
- AC-6: container `vn-market-intelligence-mcp-mcp-server-1` image = `sha256:115700a86e65...` (matches claim + router's prior independent check), healthy, created `2026-08-06T23:21:39Z` (~7min before this check) — all 11 peer containers show unchanged multi-day/week "Created" timestamps, confirming single-service rebuild only, no fleet down/up. `docker-compose.yml` git log shows no commit from this task.
- AC-5: grepped `git show --stat`/`git diff <c>~1..<c>` for both agent-father files across all 4 named commits — zero touches in any; `git log -1` on both files shows last actual edit 2026-07-18/2026-07-25, well before this task.
**why-decision:** APPROVED, DONE_VERIFIED for TASK_603. All 4 self-reported claims independently reproduced/confirmed, not accepted at face value. Parent row `FIX-CRON-REGISTRATION-PREFIX-NOT-EXCLUDED-ORPHANEMIT-AND-D4-R1B` flipped `READY`→`DONE_VERIFIED` in the same cycle per handoff's explicit "Handoff to QA" instruction — sequencing constraint (brief §4.4) now satisfied, unblocks router's held agent-father Lane-1 dispatch.
**why-change:** none — verified exactly what the row scoped. Minor discrepancy noted (not blocking): my full-suite expect()-call count (48043) differs from developer's Run 1 (48041) by 2 — within the documented flaky floor, pass/skip/fail counts identical.

### STEP qa-S4b · qa · 2026-08-07T02:10:00Z
**task-id:** FIX-COLDEVICT-MALFORMED-TS-CATCH0-EVICTS-FRESH-SIGNAL-ROWS
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of 3 commits — `f0644c14a` (fix+test), `a753beb52` (docs), `38d21a3bc` (journal) — all on main ancestry, `git show --stat` matches the row's claimed `files[]` exactly.
**what-considered:**
- Read the actual diff: `coldevict_normalize_ts_variant`/`coldevict_ts_epoch_or_oldest` normalize minute-precision + fractional-second `.ts` BEFORE parse; null/genuinely-unparseable still falls to epoch-0 via `// 0` — traced the branches myself, AC-2 poison-row convention preserved, not a polarity flip.
- Ran `scripts/test/orch-cold-evict-tests.sh` myself: 53/53 (was 47/47), exact match. Independently confirmed non-vacuous: reverted just the predicate to the pre-fix `catch 0` form (scratch copy) → TEST 10 failed exactly 2/53 as claimed (fresh malformed-ts rows wrongly evicted); restored, `git diff` clean, 53/53 again. `run_cold_evict` invokes the real script against a fixture copy, not a jq-only mock — satisfies baseline_pass's "real script" requirement.
- AC-4: `git show a753beb52` diff matches claim verbatim (drain-signals.md 48h/archive[] → 24h+script+cold-file; SKILL.md `ts` pinned to `%Y-%m-%dT%H:%M:%SZ`). AC-5: `dev-20260801T035943` absent from live `signal_queue.rows[]`, present in `docs/data/orch/archive/2026-08.json`. No TS/production files touched — DDD/mock-guard N/A (Smart-Skip).
**why-decision:** APPROVED, DONE_VERIFIED. AC-1..AC-5 + baseline_pass independently reproduced against the real script, not accepted on note prose alone.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S5 · qa · 2026-08-07T02:10:00Z
**task-id:** FIX-SWEEPGUARD-SAMEFILE-DETECTOR-UNSTAGED-PATH-FALSE-POSITIVE
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`) of commit `1c9b55d4d` (gates `_detect_samefile_pathspec_only_divergence()` on `real_blob != HEAD:$f`, adds T13).
**what-considered:**
- Row's own `desc` carries a sequencing clause written at creation (2026-08-01): "QA MUST NOT sign AC-3 off clean" until sibling `FIX-SWEEPGUARD-SAMEFILE-HUNK-PATHSPEC-ONLY-SEMANTICS-NONGOAL-AND-DETECTOR` (commit `66e850138`) lands. Dispatch prompt repeated this as still-live. Did NOT take either at face value (feedback_dispatch_prompt_inherits_stale_fence_prose_verify_live_config) — live-queried the board: sibling id is absent from every non-terminal lane AND from qa[]/done[]/done_verified[]; found it only in `docs/data/orch/archive/2026-08.json` (`done_tasks`) with `status: DONE_VERIFIED`, `commit_sha: 66e850138`. Cross-confirmed via `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-6.md` STEP qa-S6 (2026-08-06T21:47:24Z): QA independently verified `66e850138` there already, including live-reran-13/13 and explicitly reasoning about this row's own T13 as a genuine follow-up (not a regression signal). Sequencing gate is satisfied by prior work, not a live blocker.
- Board-location note: dispatch prompt stated the row is in `task_board.review[]`; live query shows it is actually in `.task_board.qa[]` (status `QA`, matches this flow's own Direct-Commit-Verify input spec) — not in `review[]` at all. No duplicate row found (`review[]+qa[]` combined id-count = 1). Non-blocking metadata inaccuracy, noted for the record only.
- Did not trust the commit message's "13/13 PASS" or AC-1/AC-4 prose: re-ran `bash scripts/git-hooks/pre-commit.test.sh` live myself → 13/13 PASS, T11 (peer-staged same-file hunk) still fires with the exact `SAME-FILE DIVERGENCE`/`f11.txt` stderr assertion, T12 (ordinary `git add`+commit) still silent, T13 (new, unstaged pathspec commit) silent. Read the test source (T11/T12/T13 bodies) to confirm the PASS/FAIL predicates are non-vacuous (T11 asserts stderr non-empty + exact content; T12/T13 assert stderr strictly empty) — not just trusting the printed banner text. Read `pre-commit:650-700` directly: the new `[ "$real_blob" = "$head_blob" ] && continue` gate (line 673) is live in source, sits after the still-present dead-code fail-open check (line 662, left as historical comment per the row's own note), confirming AC-1 structurally. Diffed the architecture-brief commit to confirm the §2.7 unstaged-path-carve-out addendum text is real (AC-4).
**why-decision:** APPROVED, DONE_VERIFIED. Commit `1c9b55d4d` real, on main ancestry, touches all 3 claimed `files[]` exactly (`git show --stat`). AC-1/AC-2/AC-3/AC-4 all independently re-verified from raw sources, not from the row's own prose. No production TS/Go touched (bash+test+doc only) — `bun test`/`tsc` N/A, `mock-guard.sh --files` on all 3 paths → "No production source files to scan. PASS." DJ-GATE-1: this entry itself satisfies the gate.
**why-change:** none from plan — verify-committed jump ran as specced; flagged the stale sequencing-clause and stale board-location claim in this row's own prose/dispatch as context, resolved rather than blocking on either.
