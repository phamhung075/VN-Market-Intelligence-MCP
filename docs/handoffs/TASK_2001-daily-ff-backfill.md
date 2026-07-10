---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 2
task_id: TASK_2001
branch: task/2001-daily-ff-backfill
size: M
zone: apps/mcp-server/
depends_on: ["TASK_2000"]
blocks: ["TASK_2002"]
---

## TLDR
One-time idempotent backfill: copy all existing foreign-flow data from frozen `daily_ohlcv.foreign_*` columns into new `daily_foreign_flow` table. **Critical ordering:** this task MUST ship and complete before TASK_2002 (writer cutover) goes live — R-6 constraint.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-2 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] Backfill SQL implemented: `INSERT OR IGNORE INTO daily_foreign_flow SELECT ...` from `daily_ohlcv` where foreign_buy_vol OR foreign_sell_vol IS NOT NULL
- [ ] Backfill migration wired into boot sequence (same idempotent pattern as `migrateForeignFlowColumns()`)
- [ ] Backfill SQL includes all 8 columns: foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol, foreign_buy_value, foreign_sell_value, updated_at, plus (code, date) as PK
- [ ] Unit test T-5: backfill idempotency — run twice against pre-seeded DB, verify second run is no-op (row count unchanged, no duplicates/errors)
- [ ] Backfill completes in < 5s on production DB snapshot (performance checkpoint — if > 5s, investigate index/query plan)
- [ ] Verify: all rows from legacy `daily_ohlcv` with foreign_* data now exist in `daily_foreign_flow` with identical values

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 4
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:88-105` (legacy `daily_ohlcv` structure)
- `apps/mcp-server/src/infrastructure/db/schema.ts:278-300` (idempotent migration pattern)

### Files to modify
- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` or `schema.ts` — add idempotent backfill migration function
- Boot sequence that runs migrations on startup

### Files to create
- Test file or extend existing: verify idempotency (T-5 from design doc)

### Dependencies
- **Depends on:** TASK_2000 (schema must exist before backfill runs)
- **Blocks:** TASK_2002 (writer cutover) — R-6 constraint; backfill MUST land first

### Knowledge needed
- `docs/policies/dev-standards.md`
- SQLite `INSERT OR IGNORE` idempotency semantics
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 4 — mandatory read for R-6 ordering constraint

### Notes
- **Zone:** `apps/mcp-server/` only
- **Risk R-6 (design doc):** backfill omitted/out-of-order → multi-day depth regression on cutover day. Mitigation: explicit task dependency + test idempotency.
- If live DB has > 1000 rows with foreign data, do not worry about performance — idempotent INSERT OR IGNORE is O(n) with index on PK; even 10k rows should be < 1s on modern SQLite.
- Backfill must run on every boot (idempotent) to handle DB resets/rebuilds during development and test.
