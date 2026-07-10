---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 1
task_id: TASK_2000
branch: task/2000-daily-ff-schema
size: M
zone: apps/mcp-server/
depends_on: []
blocks: ["TASK_2001", "TASK_2003", "TASK_2004"]
---

## TLDR
Create new `daily_foreign_flow` table with PK index, plus `daily_ohlcv_with_flow` compatibility view. Schema-only addition (additive, no column drops). Idempotent migrations per existing patterns.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-1 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] `daily_foreign_flow` table DDL created in `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` with columns: code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol, foreign_buy_value, foreign_sell_value, updated_at
- [ ] Primary key constraint: `(code, date)`
- [ ] Index: `idx_daily_foreign_flow_code_date` on `(code, date DESC)`
- [ ] Compatibility view `daily_ohlcv_with_flow` created with `COALESCE` join pattern (new table preferred, falls back to frozen legacy columns)
- [ ] Migration code added to boot sequence (idempotent `CREATE TABLE IF NOT EXISTS` + `CREATE VIEW IF NOT EXISTS`)
- [ ] Unit test verifies view columns exist and `COALESCE` logic works
- [ ] No changes to `daily_ohlcv` itself — only new table and view addition
- [ ] Existing foreign-flow tests remain green (view column names match legacy table names)

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 1, Change 3
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:88-105` (current `daily_ohlcv` DDL)
- `apps/mcp-server/src/infrastructure/db/schema.ts:278-300` (`migrateForeignFlowColumns()` pattern for idempotent ALTER)

### Files to modify
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` — add `daily_foreign_flow` DDL + index + view
- `apps/mcp-server/src/infrastructure/db/schema.ts` — wire new migration into boot sequence (idempotent)

### Files to create
- Unit test file (e.g., `apps/mcp-server/src/__tests__/daily-foreign-flow-schema.test.ts`) — validate table structure + view columns + COALESCE logic

### Dependencies
- **None** — schema addition is standalone, unblocks all downstream work

### Knowledge needed
- `docs/policies/dev-standards.md`
- `docs/ARCHITECTURE.md` § Infrastructure layer (schema definitions)
- SQLite `CREATE TABLE IF NOT EXISTS` idempotency semantics
- View `COALESCE` join patterns for backward compatibility

### Notes
- **Zone:** `apps/mcp-server/` only
- **Risk R-8 (design doc):** view join is single indexed lookup per row (both tables PK on `(code, date)`) — negligible cost at this table scale
- This task eliminates the blocking constraint for downstream subtasks: once shipped, -2, -3, -4, -5 can proceed
- **Build-standard:** not-applicable (schema addition only, no new service/primitive)
