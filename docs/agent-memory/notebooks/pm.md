# PM — Notebook

**Last updated:** 2026-05-13 | **Sprint:** c83

## Current state

- WIP: 0 / 2 (In Progress: none; headroom available)
- Backlog HIGH: 1895a Phase 5 worktree-merge-protocol (architect design)
- Todo: 1900c-health-probe (LOW), 1899a-bloomberg-test-split (S), 1862c-E/F (OPS), 1881a/1888c/d/g/l/1890a/1897b-carry (Backlog), JANITOR-{011,014,020}, TASK-BCTC-3 (Backlog)
- Done: 9 recent (1903a-stale-resolved-c82 + 1888b-shipped-c82 + 1899a-cron-c81 + 1888e-c81 + 1899a-gateway-c80 + 1899a-tests-c80 + 1899a-routes-c79 + CLEAN-c79 + 1899a-reuters-fallback-c78)
- **1899a news-fetch scaffold: COMPLETE** (10 tasks shipped, unblocks downstream integration)
- CLEAN state: No WIP exceeds 2. No blockers detected.
- **Status:** READY FOR NEXT CYCLE.

---

## Cycle 83 — 2026-05-13 c83 BATCH(2) Post-Cycle Housekeeping: 1881a-spec + 1888-CDG SHIPPED

**Input:** Dev-team + QA c83 completion. Two QA-APPROVED + SHIPPED outcomes:
1. **1881a-spec (BA CHORE):** REQ_1881a.md authored, 16 tools enumerated, 4 spec-time discoveries flagged. Next: PO review → architect handoff for BLK-1 schema decision → 1881a-impl dev cycle.
2. **1888-CDG (SSOT-CRITICAL BUNDLE):** 3-sub-task rectification: (a) tool-registry toolCount→125 (1888c), (b) cron-registry reconcile (1888d), (c) task-size-rules extracted to docs/standards (1888g). PO ref stale (L91-96 in dev-team/main.md)—developer corrected in-flight.

**Actions:**
- Moved 1881a → 1881a-impl (Backlog, awaits 1881a-spec shipment + PO review). Removed 1881a, 1888c, 1888d, 1888g from Backlog.
- Added 1881a-spec-SHIPPED-c83 + 1888-CDG-SHIPPED-c83 at top of Done section.
- TASKS.md trimmed: 70L → 73L (target ≤80L). Backlog reduced 11→8 rows.
- project-stats.json: totalTasksDone 557→559 (+2).
- WIP: 0/2 (clean), Blockers: none.

**Carry-over to c84:** 1888l (HIGH), 1890a (MEDIUM), 1899a-bloomberg-test-split (LOW), 1900c (LOW), JANITOR-{011,014,020}, TASK-BCTC-3, 1862c-{E,F} (blocked: container-rebuild), 1897b-carry (blocked: user-action).

**Status:** READY FOR NEXT CYCLE. c83 housekeeping complete. Pipeline clean.

---

## Last session summary (prior c82)

2026-05-13 Cycle 81: 1899a-cron (wiring-only feature) + 1888e (SSOT doc fix) shipped. 1899a news-fetch scaffold COMPLETE (10 tasks across c76–c81). WIP=0/2, blockers=none.

## Known patterns / preferences

- TE Chromium scraper has had repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If any further TE failures appear, flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module is active development (1842b/c/d/e + 1843a/b/c + 1844a + 1845x all done, 1846b next). Domain layer golden rule (zero infra imports) must be enforced strictly.
- export_backtest_run_csv is the only MCP tool in the codebase that returns raw CSV (not JSON). This is intentional per ARCH_1846.md §4 — must not be "fixed" to JSON in review.
- toolCount watermark in registry.ts comment previously diverged from actual toolCount. 1846b will bring actual count to 125 (slots #123-#125 filled). Developer should update the comment watermark to 125 in the registry entry.
- Option C equity curve recomputation is a direct copy of lines 302-307 in backtestEngine.ts. If tests show floating-point divergence, check sort order (localeCompare on exitDate ISO strings).
