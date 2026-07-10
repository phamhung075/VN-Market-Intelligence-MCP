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
