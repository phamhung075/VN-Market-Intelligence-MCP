# PM — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c87

## Current state

- WIP: 0 / 2 (clean; In Progress empty)
- **SHIPPED c87:** 1903-doc-pair (DONE; QA approved, merged `54e255e4`), 1904a-deploy-gap-news (PARTIAL; rebuild+cron OK; playwright-stealth ESM bug escalated to c88)
- Backlog HIGH: 1890a (toolpkg gaps + get_cash_flow), 1897b-carry (worktree isolation escalation), JANITOR-{011,014,020}, TASK-BCTC-3
- Todo top-3 for c88: 1900c-health-probe-refine (LOW, ops), 1899a-bloomberg-test-split (LOW, dev), 1862c-E (HIGH, ops — Cloudflare user-blocked)
- Blockers: 1862c-F (container-rebuild deferred), 1897b-carry (architect SPIKE pending)
- **TASKS.md:** 68L (under 80L cap). Signal ref: `docs/signals/ops-1904a-deploy-gap-news-2026-05-14T02-20-00Z.json`
- **Status:** c87 CLOSED. WIP=0. Ready for c88 cron at :07.

---

## Cycle 87 — 2026-05-14 c87 Post-Cycle Closure: 1903-doc-pair DONE + 1904a PARTIAL (playwright-stealth blocker → c88)

**Input:** QA + ops c87 completion. Two outcomes:
1. **1903-doc-pair (MEDIUM, CHORE, DONE):** Alert-commander [UNVERIFIED] label removed + macro-snapshot regime-fallback note added. Merge `54e255e4`. QA APPROVED.
2. **1904a-deploy-gap-news (HIGH, OPS, PARTIAL):** MCP rebuild + scheduler verified (AC1-3 PASS). newsHeadlinesRefreshJob registered. **AC4 blocked:** news-fetch code bug (playwright-stealth ESM default import). Root: v0.0.1 CJS, Bun incompatible. Signal queued: `docs/signals/ops-1904a-deploy-gap-news-2026-05-14T02-20-00Z.json`. Job fires q30m, fails gracefully until dev fixes import. Escalation: developer responsibility (code bug).

**Actions:**
- Moved 1904a from In Progress → Done (PARTIAL) with blocker note + signal ref.
- Moved 1903-doc-pair from In Progress → Done.
- TASKS.md final: 68L (under 80L cap).
- WIP: 0/2 (clean).

**Carry-over to c88:** 1900c (health-probe), 1899a-bloomberg-test-split, 1862c-{E,F}, JANITOR-{011,014,020}, TASK-BCTC-3, 1890a, 1897b-carry.

**Status:** c87 CLOSED. Pipeline clean. WIP=0. Ready for c88 cron dispatch at :07.

---

## Cycle 86 — 2026-05-14 c86 Post-Cycle Closure: AUTOCURE-C86-MW-DEDUP + SPIKE_C86_MCP_REG SHIPPED

**Input:** Developer + ops c86 completion. Two outcomes:
1. **AUTOCURE-C86-MW-DEDUP (HIGH, CHORE):** `.claude/flows/market-watcher/cycle.md` Step 4 off-hours duplicate-signal guard (suppress same stock_code + same move_pct within ±5min during market CLOSED). Merge commit `b5151e1d`. Report: `reports/TASK_REPORT_AUTOCURE-C86-MW-DEDUP.md`. QA APPROVED.
2. **SPIKE_C86_MCP_REG (HIGH, SPIKE):** Investigation findings: cowork agent .md `MCP:` header is documentation-only label, not platform registration. Real config in Cowork Desktop. Recommendations: (a) low-cost doc-drift fix for 9 stale headers, (b) inspect Cowork Desktop config, (c) Cloudflare tunnel 404 as separate ticket. Output: `docs/spikes/SPIKE_C86_MCP_REG.md` (116L). Merge commit `346bf916`.

**Actions:**
- Moved both AUTOCURE-C86-MW-DEDUP and SPIKE_C86_MCP_REG from In Progress → Done with c86 SHIPPED tags + commit SHAs.
- TASKS.md final: 67L (under 80L cap). No archive trigger.
- WIP: 0/2 (clean), Blockers: visible but not blocking (user-action 1862c-E, container-rebuild 1862c-F, escalation 1897b-carry).
- Carry-over untouched: 1903a-labels, 1903b-doc-self-heal, 1890a (bumped to HIGH + get_cash_flow), 1862c-{E,F}, 1897b-carry (HIGH), JANITOR-{011,014,020}, TASK-BCTC-3.

**Status:** c86 CLOSED. Pipeline clean. Zero blockers. Ready for c87 dispatch.

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
