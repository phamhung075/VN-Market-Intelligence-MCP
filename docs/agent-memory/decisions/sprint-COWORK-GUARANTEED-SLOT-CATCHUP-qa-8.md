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
