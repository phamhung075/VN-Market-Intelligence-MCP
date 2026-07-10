# Decision Journal — Sprint BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP · developer

**Sprint goal:** Fix scripts/orch-cold-evict.sh's zero-coverage of task_board.backlog[] (+ sibling flat lanes) — root cause of terminal-status rows permanently stranding in backlog[] instead of moving to the cold archive; 135 live coherence warnings driven by this gap.
**Agent:** developer
**Started:** 2026-07-10T00:00:00Z

---

### STEP developer-S1 · developer · 2026-07-10T00:00:00Z
**task-id:** D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND
**what-done:** Extended scripts/orch-cold-evict.sh with a new Pass-1 category scanning flat lanes {backlog,review,qa,in_progress,ready} for terminal-status rows; cold sink = dormant `.backlog_detail[]`; added `--exclude-ids` safety valve; wrote scripts/test/orch-cold-evict-tests.sh (27/27 GREEN).
**what-considered:**
- only path: brief §5/§8 (D4 row) prescribed exact target — extend existing script (not fork), reuse `.backlog_detail[]` (not `archive/backlog-detail.json`, a different file per architect's correction), reuse TERMINAL_SET definition already mirrored by TERMINAL_SPRINT_STATUSES.
**why-decision:** TERMINAL_TASK_STATUSES kept as its own env var (byte-identical default to TERMINAL_SPRINT_STATUSES) rather than aliasing, to match the script's established one-tunable-per-category convention (TERMINAL_SPRINT_STATUSES / TERMINAL_SIGNAL_STATUSES) without introducing a new status-set definition.
**why-change:** no change from plan.

### STEP developer-S2 · developer · 2026-07-10T00:05:00Z
**task-id:** D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND
**what-done:** Test 5 (conservation guard) implemented as a paired control (direct orch-apply.sh call, no bypass, on the equivalent post-eviction candidate — proves genuine rejection) + the real script run (bypass baked in — proves it still succeeds through the new path), mirroring orch-apply-wrapper-tests.sh's SHRINK-ALLOWED pattern.
**what-considered:**
- only path: orch-cold-evict.sh always sets ORCH_APPLY_ALLOW_SHRINK for every write it makes (existing design, one call site for all 6 eviction categories) — cannot toggle the bypass off inside the script itself without touching unrelated code, so the control test calls orch-apply.sh directly instead.
**why-decision:** proves the guard is genuinely engaged for THIS shape of change (backlog-lane shrink), not vacuously passing, while confirming the script's existing bypass still propagates correctly to the new eviction category.
**why-change:** no change from plan.

### STEP developer-S3 · developer · 2026-07-10T00:10:00Z
**task-id:** D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND
**what-done:** Manual live-run + regression smoke test (fixture with done[]/done_verified[]/active_sprints[]/sprint_goal.entries[]/signal_queue rows populated alongside new terminal backlog/review rows) confirmed all 5 pre-existing eviction categories still function unchanged alongside the new 6th category. Did NOT run against the live docs/data/orch/orch-state.json (D1's job).
**what-considered:**
- only path: R-HIGH-1 (brief) flags this as the sole SSOT eviction script — regression proof was mandatory before considering the change safe to hand off.
**why-decision:** fixture-only verification per standing rule against live-file test execution.
**why-change:** no change from plan.

### STEP developer-S4 · developer · 2026-07-10T20:15:00Z
**task-id:** D1-BACKLOG-HYGIENE-SWEEP-EXECUTE
**what-done:** Attempted live sweep. Read D0's `triage_result` field directly — found it holds ONLY aggregate counts (73/4/11) + 2 named exceptions, NOT the full per-row bucket lists PM's notebook claimed exist. Confirmed via `git show 26ffe7567` (D0's commit touched only its own board row + pm.md, no per-row annotation) + repo-wide grep (no other artifact). Dry-run (`orch-cold-evict.sh --dry-run --exclude-ids FIX-BCTC-BANK-SUMMARY-MAPPING`) showed 55 rows would auto-evict on 1-of-15 known protections. Did NOT run live — flipped D1's own row BACKLOG→BLOCKED with a status_note documenting the gap + remedy, committed (`d45c03f1a`).
**what-considered:**
- Guess the missing 14 IDs from context clues — rejected: router explicitly forbade guessing; matches R-CRIT-1.
- Re-derive D0's full triage myself (Tier 2 mechanical pass over the 55-row pool) — rejected: that is D0's MEDIUM-HIGH-risk judgment task, out of D1's scope, and router narrowed D1 to eviction-only this cycle.
- Run eviction anyway, accept the risk — rejected: architect brief already proved (Exception 1) this exact label class silently ships a live-reproducing P1 defect to the archive.
**why-decision:** halting with a documented, falsifiable finding (concrete dry-run numbers + git-verified provenance) is safer and more useful to the sprint than a live mutation built on an incomplete input; matches standing "no fake data / verify SERVING value" class of lessons.
**why-change:** D1 could not proceed to execution as scoped — root blocker is upstream (D0's persisted output), not a defect in D4's tooling (D4 itself worked correctly in dry-run).

### STEP developer-S5 · developer · 2026-07-10T21:45:00Z
**task-id:** D1-BACKLOG-HYGIENE-SWEEP-EXECUTE
**what-done:** Retry. D0B (`98d26dc01`) persisted the full 15-item `triage_result.exceptions[]` to both D0 and D0B `done_verified` rows. Re-verified live (both rows, exactly 15 entries each: 1 confirm-terminal/4 exclude/10 relabel) before trusting the router's restated 4-item exclude list — matched exactly. Flipped D1 `BLOCKED→BACKLOG`. Dry-run then live `orch-cold-evict.sh --exclude-ids <4 ids>`: evicted 2 done[] + 15 done_verified[] + 55 flat-lane rows (54 backlog + 1 review) to `archive/2026-07.json`, + 2 signal rows + 1 signal-archive row. Conservation-guard OK (task_total 545→473, delta exactly matches evicted count; signal_total 2→0), verified both via the internal `orch-apply.sh` check and a standalone re-run against pre-change HEAD. Post-write: confirmed all 4 excludes still hot (absent from cold), enumerated all 55 evicted IDs and confirmed zero overlap with the exclude set. Coherence warnings 72→16. Committed `42e565c7b`.
**what-considered:**
- Trust the router-restated exclude-ids list verbatim without re-reading the live field — rejected: router explicitly required independent re-confirmation (same discipline as the S4 block), and a genuine drift exists in D0's row (relabel_count:11 field vs 10 actual array entries) proving the row's aggregate metadata isn't 100% self-consistent, so trusting a summary/restatement without reading the array itself would be exactly the failure class that caused S4's block.
- Also flip the confirm-terminal row (`FACTORY-INTERFACE-split-server-ts`) or relocate the 10 RELABEL rows in this same pass, since the data is now available — rejected: router explicitly re-confirmed eviction-only scope for this cycle; scope creep risk outweighs the minor efficiency gain of doing it all in one pass.
**why-decision:** re-verifying the now-complete exceptions[] independently (not just accepting D0B's/router's claim it was fixed) preserves the exact discipline that caught the original gap; running dry-run before live, and cross-checking that the exclude flag is genuinely load-bearing (not vacuous) before trusting the live run, keeps the same falsifiability standard as S4.
**why-change:** upstream blocker (D0's incomplete persisted data) is now resolved by D0B; D1 proceeds exactly as originally scoped, no plan change needed.

### STEP developer-S6 · developer · 2026-07-10T22:30:00Z
**task-id:** D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING
**what-done:** Confirmed depends (D3/D2.5/D1) all DONE_VERIFIED and live `bun scripts/orch-validate.mjs` at 0 coherence warnings before touching code. Flipped `scripts/orch-validate.mjs` Stage-1b from warn-print-only to hard-fail (`process.exit(2)`), matching the Stage-1c/1d pattern exactly. Negative-path proof: throwaway fixture (IN_PROGRESS status in backlog[]) → exit 2, confirmed non-zero, correct error message. Re-ran against live orch-state.json post-flip → still exit 0. Updated `orchStateSchema.test.ts` (the one test hard-coding the old warn-only contract → new exit-2 test; +1 new happy-path test; 3 stale comments fixed) — 104/104 GREEN. `orch-apply-wrapper-tests.sh` 31/31 GREEN, `TASK-FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT.test.ts` 5/5 GREEN. Closed SHG-2/3/4/5 → DONE_VERIFIED via `devteam-close-task-done-verified.jq` (one `orch-apply.sh` write each, sequential).
**what-considered:**
- Silently patch `orch-cold-evict.sh`'s `--exclude-ids` to also force-relabel excluded rows to a lane-coherent status (would fix the discovered 8/27 test regression in `orch-cold-evict-tests.sh`) — rejected: that script carries its own R-HIGH-1 flag (sole-SSOT eviction), the correct fix requires an actual design decision (force-relabel vs. Stage-1b exception list vs. something else) that is not D5's mandate, and real-world risk is confirmed LOW (no cron invokes it; D1's live exclusions were already lane-coherent via a different mechanism). Reported the finding instead of hiding or force-fixing it.
- Close SHG-2/3/4/5 on the router's note alone without independently re-reading each row's own note/blocked_reason and cross-checking the original architecture-brief AC — rejected: router's own instruction explicitly required checking each row's scope before assuming; did full due-diligence (git log for the original completion commits, grep for the 7 SHG-3 write-path wire-ins, live null-id-sprint count for SHG-4) before closing, matching the "no rubber-stamp close" language already baked into each row's own blocked_reason.
- Silently ignore the causally-confirmed `orch-cold-evict-tests.sh` regression (8/27) since it was outside the literal Step-6 instruction scope (which named only orch-validate.mjs/orchStateSchema tests) — rejected: discovered via due-diligence grep of other `orch-validate.mjs` consumers; matches "detect then reduce debt" + "no fake data" standing culture to surface a real, git-stash-confirmed regression rather than stay silent because it wasn't explicitly asked for.
**why-decision:** each of the 3 above followed the same principle — fix exactly what was scoped, verify thoroughly before closing anything adjacent, and report (never hide) anything discovered outside scope rather than either force-fixing it (risk of a bad unreviewed design decision on a flagged high-risk script) or staying silent (risk of a known regression shipping unflagged).
**why-change:** no change from D5's own scoped plan; the cold-evict finding is new information surfaced during Step 6 regression-checking, reported as a recommended follow-up task, not absorbed into this task's scope.
