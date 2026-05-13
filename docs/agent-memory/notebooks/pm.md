# PM — Notebook

**Last updated:** 2026-05-13 | **Sprint:** c82

## Current state

- WIP: 0 / 2 (In Progress: none; headroom available)
- Backlog HIGH: 1895a Phase 5 worktree-merge-protocol (architect design)
- Todo: 1900c-health-probe (LOW), 1899a-bloomberg-test-split (S), 1862c-E/F (OPS), 1881a/1888c/d/g/l/1890a/1897b-carry (Backlog), JANITOR-{011,014,020}, TASK-BCTC-3 (Backlog)
- Done: 9 recent (1903a-stale-resolved-c82 + 1888b-shipped-c82 + 1899a-cron-c81 + 1888e-c81 + 1899a-gateway-c80 + 1899a-tests-c80 + 1899a-routes-c79 + CLEAN-c79 + 1899a-reuters-fallback-c78)
- **1899a news-fetch scaffold: COMPLETE** (10 tasks shipped, unblocks downstream integration)
- CLEAN state: No WIP exceeds 2. No blockers detected.
- **Status:** READY FOR NEXT CYCLE.

---

## Cycle 82 — 2026-05-13 c82 Post-Cycle Housekeeping: 1903a Stale-Resolved + 1888b SHIPPED

**Input:** Dev-team + QA c82 completion. Two QA-APPROVED outcomes:
1. 1903a (FIX-HIGH): Both bugs (write_alert_verdict shape, get_macro_snapshot portfolio) self-healed during c77 gateway-restore. Regression tests verify fix holds. No production code changes c82.
2. 1888b (CHORE SSOT): Hardcoded "13 agents" → pointer to project-stats.json#devAgentCount. Commits `49f5d1eb` (fix) + `ff618e1d` (notebook).

**Actions:**

- **1903a → Done (STALE-RESOLVED):** Moved from Backlog → Done section. Annotation: "stale-resolved at c82 — regression tests (d5251193) verify c77 fix holds". Root cause: c77 gateway rebuild isolated tool invocation paths, preventing cross-agent routing errors. No code changes shipped c82; notebook only. Unblocks downstream regression confidence.
- **1888b → Done:** Moved from Backlog → Done section. SSOT doc fix complete (3 hardcoded refs → project-stats.json pointer). QA APPROVED.
- **TASKS.md TRIM:** Removed 1903a + 1888b from Backlog; added to Done section (top 2). Line count: 70L (target ≤80L).
- **project-stats.json:** totalTasksDone incremented by 2.
- **WIP status:** 0/2 (In Progress empty). Headroom available.
- **Blockers:** None. Pipeline clean.
- **File state:**
  - TASKS.md: 70 lines (post-edit), Done section now 9 rows, Backlog: 1888c/d/g/l/1881a/1890a/1897b-carry remain (7 rows)
  - pipeline-state.json: no change needed

**Status at session end:** READY FOR NEXT CYCLE. c82 post-cycle housekeeping complete. 1903a & 1888b shipped. Next: 1900c health-probe or parallel backlog work.

---

## Last session summary (prior c82)

2026-05-13 Cycle 81: 1899a-cron (wiring-only feature) + 1888e (SSOT doc fix) shipped. 1899a news-fetch scaffold COMPLETE (10 tasks across c76–c81). WIP=0/2, blockers=none.

## Known patterns / preferences

- TE Chromium scraper has had repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If any further TE failures appear, flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module is active development (1842b/c/d/e + 1843a/b/c + 1844a + 1845x all done, 1846b next). Domain layer golden rule (zero infra imports) must be enforced strictly.
- export_backtest_run_csv is the only MCP tool in the codebase that returns raw CSV (not JSON). This is intentional per ARCH_1846.md §4 — must not be "fixed" to JSON in review.
- toolCount watermark in registry.ts comment previously diverged from actual toolCount. 1846b will bring actual count to 125 (slots #123-#125 filled). Developer should update the comment watermark to 125 in the registry entry.
- Option C equity curve recomputation is a direct copy of lines 302-307 in backtestEngine.ts. If tests show floating-point divergence, check sort order (localeCompare on exitDate ISO strings).
