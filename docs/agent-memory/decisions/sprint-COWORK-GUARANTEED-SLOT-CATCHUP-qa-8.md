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
