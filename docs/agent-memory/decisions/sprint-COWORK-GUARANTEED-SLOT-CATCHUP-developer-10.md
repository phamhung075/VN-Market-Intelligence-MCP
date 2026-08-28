# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · developer

**Sprint goal:** (continuation file — see -9.md and earlier for header/goal detail)
**Agent:** developer
**Started:** 2026-08-26T13:10:00Z

---

### STEP developer-S131 · developer · 2026-08-26T13:10:00Z
**task-id:** FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ
**what-done:** QA CHANGES_REQUESTED re-dispatch (redispatch_count=1). AC-4: migrated `scripts/orch-cold-evict.sh` (real, always-executing caller, not a flow-doc) onto AC-1's caller-baseline mechanism — captures `HASH_BEFORE` at loop-top (before its own reads) and threads it through as `ORCH_APPLY_CALLER_BASELINE_HASH`. AC-3 threshold=1 finding: kept default (1), documented defensibility in `orch-conservation-check.mjs` header instead of lowering it.
**what-considered:**
- AC-4 disjunct (a) migrate a real caller vs (b) mint a followup row: chose (a) per dispatch's stated preference; `orch-cold-evict.sh` chosen over `drain-signals.js` — it already has its own internal mtime-CAS retry loop (real residual-gap shape: peer write between its own check and orch-apply.sh's own, previously-invisible, self-captured baseline).
- Lowering `CONSERVATION_MAX_UNDECLARED_BACKWARD_MOVES` to 0 (closing AC-3's threshold=1 gap directly): REJECTED — grep-verified 3 live call sites (`qa/flow/main.md` CHANGES_REQUESTED qa->review; `dev-team/flow/main.md` WF-1a BLOCKED self-heal + resume-attempt-bound-exceeded self-heal, both in_progress->backlog) rely on the undeclared tolerance today; none declare via `ORCH_APPLY_DECLARED_BACKWARD_LANE_MOVES`. Lowering to 0 without migrating all 3 (multi-file, cross-agent-type, out of this row's bounded scope) would fail-close every one of those load-bearing self-heals — worse than the residual gap. AC-1 (once callers migrate) is the architecturally correct fix for the single-row case specifically: CAS-hash catches ANY staleness regardless of row count, independent of the lane-rank heuristic.
- AC-5 proof method: PATH-shadowed `mv` on cold-evict's own cold-archive rename call, injecting a peer mutation to the hot fixture in the exact residual window, then `git stash`-reverted just `orch-cold-evict.sh` and re-ran the SAME new test to confirm it silently passed pre-fix (guard was a no-op: peer row clobbered, stale candidate applied) before restoring the fix and confirming it now fires (CAS mismatch, retries exhausted, peer's row survives, this run's own candidate rejected).
**why-decision:** AC-4 needed a real end-to-end caller per the dispatch's explicit preference for disjunct (a); orch-cold-evict.sh is the strongest fit (real residual-gap shape, always executes, already has adjacent CAS infra to extend). AC-3's threshold stays at 1 because the alternative (0) is fail-closed on 3 concrete, currently-relied-upon production paths without a fleet-wide migration this row's scope does not cover — better to document the trade-off than break live self-healing.
**why-change:** Redispatch — QA's 2 findings both addressed directly (AC-4 caller migrated end-to-end with proof; AC-3 threshold explicitly defended in-file, not silently left).
**verify:** `bash scripts/test/orch-cold-evict-tests.sh` → 75/77 (baseline 67/69 + 8 new TEST-13 assertions, all new ones GREEN; the 2 pre-existing FAILs are T7, unrelated/pre-existing). `bash scripts/test/orch-apply-wrapper-tests.sh` → 109/109 unchanged (orch-apply.sh untouched this pass). Fault-injection fires-then-passes proof: pre-fix (git-stashed) run of TEST 13a → all 4 assertions FAIL (guard vacuous); post-fix → all 4 PASS. `bash -n` clean on both shell files; `bun -e` parse-check clean on the `.mjs` comment edit (no functional JS changed, comment-only).
**handoff:** Row stays `review[]`, `status=REVIEW`, `next_agent=qa` (QA-drain terminal shape per dispatch's Terminal Shape instruction — NOT in_progress[], NOT qa[] parked-without-dispatch). `implementation_note` updated to name both fixes precisely + commit SHAs. Files changed: `scripts/orch-cold-evict.sh`, `scripts/test/orch-cold-evict-tests.sh`, `scripts/orch-conservation-check.mjs` (comment-only).

### STEP developer-S132 · developer · 2026-08-26T15:22:00Z
**task-id:** FIX-AUDITOR-NOTEBOOK-COMPOSE-COMMITMSG-MARKER-GATE
**what-done:** Built `scripts/git-hooks/commit-msg` (repo's first commit-msg hook, PILOT-SCOPED to `docs/agent-memory/notebooks/system-auditor.md`) per brief §Child A verbatim, wired into `install.sh` (now 4 hooks), wrote `commit-msg-notebook-compose-marker.test.sh` (5/5 pass), added dev-standards.md CANONICAL pointer. Committed 16e2096bb (impl) + 62da86b34 (board lane-move).
**what-considered:**
- Rejected the pre-commit/COMMIT_EDITMSG rescue explicitly named as a trap in the row's own status_note — corroborated independently (grep: pre-commit references COMMIT_EDITMSG 0 times).
- Regex fidelity: smoke-tested the brief's literal `\[[^]]*(OK|WARN)[^]]*\]` against the real historical shape-4 commit `efe62d83d` BEFORE trusting it — it failed to match (negated-bracket class can't cross the inner `]`). Widened to `\[([^][]|\[[^]]*\])*(OK|WARN)([^][]|\[[^]]*\])*\]`, re-verified against all 4 real shapes + negative controls (bare `[skip ci]`, OK-substring words TOKEN/BROKEN with no brackets) before shipping.
- Safety order: syntax-checked + smoke-tested the hook in a throwaway scratch repo BEFORE running `install.sh` (per the row's explicit safety gate), confirmed exit 0 on every non-reject path first.
**why-decision:** The brief's design was otherwise followed verbatim (warn-default, escape-hatch trailer, PILOT scope) — the one deviation (regex) was load-bearing: shipping the literal brief regex would have false-flagged every future compliant nested-bracket-shape commit, the exact false-positive-in-the-detection-direction failure mode this task exists to avoid on the other axis.
**why-change:** No change to task scope/shape; regex fix is a bug found+closed during implementation, documented in the row's status_note and the CANONICAL pointer, not silently absorbed.
**verify:** `bash scripts/git-hooks/commit-msg-notebook-compose-marker.test.sh` → 5/5 PASS (verbatim case names: marker-all-4-shapes / no-marker-warn / no-marker-reject / escape-hatch-under-reject / non-notebook-noop). `bash scripts/git-hooks/pre-commit.test.sh` → 15/15 unchanged (no regression). `install.sh` re-run → 4 symlinks confirmed (`pre-push pre-commit post-commit commit-msg`) via `ls .git/hooks/`.
**handoff:** Row moved `in_progress[]`→`review[]`, `status=REVIEW`, `next_agent=qa`, `.head` reset idle, same orch-apply write (62da86b34). AC-2 (live WARN on next real notebook commit) explicitly flagged NOT YET OBSERVED in status_note — no commit touched `system-auditor.md` since hook install; most recent one (`56f41ab1c`) predates it. Do not mark this AC satisfied without a real post-install observation.

### STEP developer-S133 · developer · 2026-08-28T23:35:00Z
**task-id:** FIX-PREPUSH-SIZELINT-6-OFFENDERS
**what-done:** Added a current size-justification header to each of the 6 pre-push size-lint offenders (bctcScalarAggregator.ts 1207L, ocr_backends.py 690L, ocr_orientation.py 235L, ocr_worker.py 579L, page_rasterizer.py 251L, pek_engine_adapter.py 1299L) — commit b4e885a64, +6L net; size-lint --check PASS (0 offenders, 1457 scanned).
**what-considered:**
- Re-baseline all 6 via `--update` (precedent 5944172e0 for one file)
- Refactor/split the 6 files under the 120L threshold
- Add current size-justification headers (the gate's "carries a valid header → PASS" rule)
**why-decision:** Per-file commit history proved the growth is legitimate reviewed feature work, not bloat; headers are the gate's sanctioned documented-debt mechanism, precedented in both zones (financialFiguresRules.ts, ordinal_grid.py 1210L), durable (survive --update), and do not ratchet the baseline or silently grandfather the NEW offender (ocr_orientation.py) the way --update would.
**why-change:** no change from plan
