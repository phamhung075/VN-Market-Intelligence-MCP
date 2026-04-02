# Task Report: 223 — Portfolio Target Allocation

date: 2026-04-02
outcome: APPROVED

## Summary

Task 223 adds a persistent target allocation system for the portfolio rebalancing workflow.
The implementation delivers the `portfolio_targets` SQLite table, a full CRUD store
(`targetAllocationStore.ts`), two MCP tools (`set_target_allocation`,
`get_target_allocation`), and auto-load integration into `get_rebalancing_signals`.

Branch: `task/223-target-allocation`
Reviewed from worktree: `.claude/worktrees/agent-a9e6cc3e`

---

## Test Results

- Unit tests (223 only): **22 passed / 0 failed**
- Full regression suite: **1886 passed / 0 failed** (4535 expect() calls)
- TypeScript strict check (`bun tsc --noEmit`): **0 errors**

Coverage on new files:
- `targetAllocationStore.ts`: 100% functions, 100% lines
- `targetAllocationTools.ts`: 87.5% functions, 80.4% lines (uncovered: error branches + drift label formatting — acceptable)

---

## DDD Compliance: PASS

- `src/infrastructure/db/targetAllocationStore.ts` is correctly placed in `infrastructure/`.
- `src/domain/` has zero imports from `infrastructure/` introduced by this task.
- MCP tools in `interface/` call the store directly (no use-case layer required for simple CRUD — consistent with existing patterns such as `positionStore`, `alertMuteStore`).
- No business logic in tool handlers beyond input validation.

---

## Security: PASS

- All SQL uses parameterized queries (`db.prepare(...).run(?, ?)` pattern throughout).
  No string interpolation in any SQL statement.
- No `process.env` usage — uses `Bun.env` indirectly via `initDatabase()` / `getDb()`.
- No `any` types in implementation files.
- Input validated with Zod: `z.record(z.number().min(0).max(100))` on `targets` field.
  Weight-sum check (99–101%) applied before DB write.
- Stock codes uppercased on write — prevents case-sensitivity injection.

---

## Implementation Notes

### Schema (`src/infrastructure/db/schema.ts`)

`portfolio_targets` table added with `code TEXT PRIMARY KEY`, `target_weight REAL NOT NULL`,
and `updated_at TEXT NOT NULL DEFAULT (datetime('now'))`. CREATE TABLE IF NOT EXISTS
semantics — safe for existing deployments.

### Store (`src/infrastructure/db/targetAllocationStore.ts`)

Four exported async functions: `setTargetWeights`, `upsertTargetWeight`,
`getTargetWeights`, `deleteTargetWeight`. All fully documented with JSDoc.
`INSERT OR REPLACE` semantics ensure idempotency. `deleteTargetWeight` is a no-op
when the code does not exist (safe).

### MCP Tools (`src/interface/mcp/tools/targetAllocationTools.ts`)

Two tools registered (`set_target_allocation`, `get_target_allocation`). Tool count
on the branch goes from 53 to 55 — matches the TASKS.md acceptance criterion.

`get_target_allocation` joins `portfolio_targets`, `positions`, and `market_prices`
tables to compute actual allocation percentages and drift. Falls back to `avg_price`
when no live price is available — correct defensive behaviour.

### Rebalancing integration (`src/interface/mcp/tools/rebalancingTools.ts`)

`targets` parameter is now optional. When omitted, `getTargetWeights()` is called to
auto-load from `portfolio_targets`. Also fixes a legacy schema mismatch
(`portfolio_positions/avg_cost_vnd` → `positions/avg_price`) that would have caused
runtime errors on the current schema.

### TDD

Tests and implementation are in a single commit. While strict TDD would require a
red-first commit, the 22 tests are substantive and cover all acceptance criteria:
CRUD operations, idempotency, weight-sum validation (99/100/101/80/120), drift
computation (positive/negative/zero), and MCP tool behaviour. No trivial assertions.

---

## Issues Found

### Blocking

None.

### Non-Blocking

1. `delete_target_allocation` MCP tool is not registered — the store exposes
   `deleteTargetWeight()` but no tool surfaces it to Claude. The TASKS.md acceptance
   criteria only specifies `set_target_allocation` / `get_target_allocation` and
   `toolCount 53→55`, so this is within scope. A future sprint may add the delete
   tool if needed.

2. Single commit (no separate test-first commit). Non-blocking because tests are
   comprehensive and the task passes all pipeline checks.

---

## Merge Status

APPROVED. Merging to main.
