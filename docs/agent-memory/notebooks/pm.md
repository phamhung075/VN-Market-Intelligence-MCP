# PM — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c85

## Current state

- WIP: 0 / 2 (In Progress: empty; full headroom for c86 dispatch)
- **JUST SHIPPED (c85):** 1881a-impl-{mcp,ssot} both APPROVED, merged, moved to Done
- Backlog HIGH: 1890a (toolpkg gaps), 1897b-carry (worktree isolation escalation), JANITOR-{011,014,020}, TASK-BCTC-3
- Todo top-3 for c86: 1900c-health-probe-refine (LOW, ops), 1899a-bloomberg-test-split (LOW, dev-mainserver-crawls), 1862c-E (HIGH, ops — Cloudflare ingress user-blocked)
- Done: 13 recent (1881a-impl-{mcp,ssot}-c85 + 1888l-c84 + 1881a-impl-split-c84 + 1881a-spec-c83 + 1888-CDG-c83 + 1903a-c82 + 1888b-c82 + 1899a-cron-c81 + 1888e-c81 + 1899a-gateway-c80 + 1899a-tests-c80 + 1899a-routes-c79)
- **CLEAN state:** WIP=0. No blockers except user-action (1862c-E dashboard) and container-rebuild (1862c-F). Architect brief complete (1881a landed c84).
- **Status:** c85 CLOSED. Ready for c86 dispatch.

---

## Cycle 85 — 2026-05-14 c85 Post-Cycle Housekeeping: 1881a-impl-{mcp,ssot} SHIPPED

**Input:** Dev-team + QA c85 completion. Two QA-APPROVED + SHIPPED outcomes:
1. **1881a-impl-mcp (M, HIGH, feature):** 16 MCP tool handlers + contract test file. JSON envelope pattern (source_tier: 1|2|3 as const, first field). 20/20 contract tests pass, 9234/9268 full suite, tsc 0 errors. Merge commit `c2e2fb08`. Report: `reports/TASK_REPORT_1881a-impl-mcp.md`.
2. **1881a-impl-ssot (S, MEDIUM, chore):** Layer 9 doc update `docs/standards/tnb-methodology-layers.md` source_tier hierarchy explained, enum documented, backwards-compat note (additive field only). Merge commit `6a700f15`. Report: `reports/TASK_REPORT_1881a-impl-ssot.md`.

**Actions:**
- Removed 1881a-impl-ssot from Todo (was stale after merge).
- Moved both 1881a-impl-{mcp,ssot} from Review → Done with c85 SHIPPED tags + commit SHAs.
- TASKS.md final: 67L (under 80L cap). Archive threshold not reached.
- WIP: 0/2 (clean), Blockers: none (both user-action and container-rebuild remain deferred).

**Carry-over to c86:** 1900c (health-probe, LOW), 1899a-bloomberg-test-split (LOW), 1862c-{E,F} (OPS, blocked), JANITOR-{011,014,020,} (DRY), TASK-BCTC-3 (feature), 1890a (toolpkg, MEDIUM), 1897b-carry (blocked: user-action).

**Status:** c85 CLOSED. Pipeline clean. No zombie tasks. Headroom verified for c86.

---

## Cycle 84 — 2026-05-13 c84 Post-Cycle Housekeeping: 1888l SHIPPED + 1881a-impl SPLIT

(See full notes in prior commit.)

---

## Known patterns / preferences

- TE Chromium scraper has had repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If any further TE failures appear, flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module is active development (1842b/c/d/e + 1843a/b/c + 1844a + 1845x all done, 1846b next). Domain layer golden rule (zero infra imports) must be enforced strictly.
- export_backtest_run_csv is the only MCP tool in the codebase that returns raw CSV (not JSON). This is intentional per ARCH_1846.md §4 — must not be "fixed" to JSON in review.
- toolCount watermark in registry.ts comment previously diverged from actual toolCount. 1846b will bring actual count to 125 (slots #123-#125 filled). Developer should update the comment watermark to 125 in the registry entry.
- Option C equity curve recomputation is a direct copy of lines 302-307 in backtestEngine.ts. If tests show floating-point divergence, check sort order (localeCompare on exitDate ISO strings).
