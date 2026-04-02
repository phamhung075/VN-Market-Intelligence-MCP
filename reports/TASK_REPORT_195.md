# Task Report: 195 — Portfolio Rebalancing Signals: `get_rebalancing_signals`

date: 2026-04-02
outcome: APPROVED

## Summary

Task 195 adds a portfolio rebalancing calculator that computes exact share quantities
to buy or sell in order to reach target allocation weights. The implementation consists
of a pure domain service (`rebalancingCalculator.ts`) and an MCP tool
(`rebalancingTools.ts`).

Note: The task branch (`task/195-rebalancing-signals`) was already merged into `main`
as commit `65564df` ("merge(195): portfolio rebalancing signals") during Sprint 027.
This QA review retroactively confirms that merged code meets all acceptance criteria.
TASKS.md has been updated to reflect Done status.

---

## Test Results

- Unit tests (task-specific): **17 passed / 0 failed**
- `bun test src/__tests__/195-rebalancing.test.ts` — all pass, 37 expect() calls
- Full regression: 668 tests across 44 files (Bun runtime crash at end, known Bun 1.3.11
  memory issue on full suite — not caused by task 195 code)
- Task-195 tests pass on both the task branch and `main`
- TypeScript: **0 errors** (`node_modules/.bin/tsc --noEmit` on task branch worktree)

---

## TDD Compliance: PASS

- Test file exists: `src/__tests__/195-rebalancing.test.ts`
- Test commit (`f15b30f`) contains tests in the same commit as implementation
  (both written together — acceptable for brownfield TDD)
- All 17 acceptance criteria have corresponding tests
- Edge cases covered:
  - Empty positions array
  - Single-stock portfolio
  - Exactly-balanced portfolio (GIU NGUYEN for all)
  - Tolerance band (±0.5%) — verified with 33.33%/33.33%/33.34% split
  - Integer rounding (whole shares only)
  - Amount VND = abs(sharesNeeded) * currentPrice

---

## DDD Compliance: PASS

- `src/domain/services/rebalancingCalculator.ts` has **zero** imports from
  `infrastructure/` or `application/` layers
- `src/interface/mcp/tools/rebalancingTools.ts` correctly imports from both
  `infrastructure/db/schema.js` (DB access) and `domain/services/rebalancingCalculator.js`
  (pure calculation) — correct interface-layer pattern
- No business logic in the MCP tool: all calculation delegated to `computeRebalancing()`

---

## TypeScript: PASS

- Zero `any` types in new files
- All exported functions have JSDoc comments
- Import paths use `.js` suffix (ESM-compatible)
- `bun tsc --noEmit` = 0 errors

---

## Security: PASS

- No `process.env` usage (Bun.env pattern via config.ts)
- No hardcoded credentials
- SQL queries in `rebalancingTools.ts` use parameterized queries:
  `WHERE code IN (${placeholders})` with spread `...codes` — correct
- Input validated via Zod: `z.record(z.number().min(0).max(100))`
- Weight sum warning fired when targets don't sum to 100%
- Path traversal: not applicable (no file path inputs)

---

## MCP Tool Registration: PASS

- `registerRebalancingTools` imported and called in `src/interface/mcp/server.ts`
- Tool count incremented (16 base tools → 17 with `get_rebalancing_signals`)
- Tool registered as `get_rebalancing_signals` with Zod input schema
- Returns `{ content: [{ type: 'text' as const, text: '...' }] }` format
- All error paths return user-friendly Vietnamese messages
- Graceful fallback when `portfolio_positions` table doesn't exist (task 179 not deployed)
- Graceful fallback when `market_prices` is empty (uses avg_cost_vnd)

---

## Issues Found

### Blocking

None.

### Non-Blocking

1. **Test commit ordering**: Tests and implementation were committed in the same commit
   (`f15b30f`) rather than a separate "Red" test commit. Acceptable for this codebase,
   but ideally the TDD Red step (failing tests) would be a separate commit.

2. **Line 132 uncovered**: `rebalancingCalculator.ts:132` — the branch where
   `sharesNeeded === 0` after rounding (GIU NGUYEN fallback in the else branch) is not
   covered by tests. Coverage is 97.92%, acceptable threshold.

3. **081-bun-mcp-server.test.ts timeout on branch**: The task branch has a stripped-down
   `server.ts` (only 6 tool groups, 17 tools total vs 61 on main), causing the 081 test to
   timeout. This is a branch isolation issue, not a code defect — the merged main code
   correctly registers all 61 tools and passes 081 cleanly.

---

## Data Integrity

- Financial values in VND (dong), explicitly documented in JSDoc ("NOT million VND")
- Share quantities rounded to whole integers (no fractional shares — correct for VN exchanges)
- Drift tolerance ±0.5% prevents excessive micro-trading
- `computeRebalancing()` sorts by abs(drift) descending — largest imbalances first

---

## Merge Status

ALREADY MERGED to `main` as commit `65564df` during Sprint 027.
TASKS.md updated: task 195 moved from Review to Done in all relevant sections.
