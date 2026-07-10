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
