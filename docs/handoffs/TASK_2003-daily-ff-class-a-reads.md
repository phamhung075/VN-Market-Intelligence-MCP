---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 4
task_id: TASK_2003
branch: task/2003-daily-ff-class-a-reads
size: M
zone: apps/mcp-server/
depends_on: ["TASK_2000"]
blocks: ["TASK_2005"]
---

## TLDR
Migrate 5 Class-A "value readers" from `daily_ohlcv` to `daily_ohlcv_with_flow` view (one-line rename each). These are sites that need actual buy/sell/net numbers with OHLCV context. Safe to run in parallel with TASK_2002 (writer cutover) because view COALESCEs both sources throughout transition.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-4 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] Migrate 5 files — each change is `FROM daily_ohlcv` → `FROM daily_ohlcv_with_flow` (one-line rename per file):
  - [ ] `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts:L86-138` — SUM queries + top/bottom-N per-ticker queries
  - [ ] `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts:L55-58, L283-286` — per-ticker history + code/net_vol selects
  - [ ] `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts:L100-114` — cumulative-sum evidence builder history query
  - [ ] `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts:L559-575` — default `getForeignFlowMoversFn` (if not overridden by DI)
  - [ ] `apps/mcp-server/src/scheduler/briefings/franceSummaryJob.ts:L107-208` — default `getForeignFlowMoversFn` separate impl
- [ ] Verify all 5 files compile and pass type check (`pnpm check`)
- [ ] No query-shape changes — view columns match legacy table names exactly (COALESCE handles fallback)
- [ ] Existing ~15 foreign-flow tests remain green (they now query view instead of table, same column names)
- [ ] Comment added to each file noting it now queries `daily_ohlcv_with_flow` for clarity (optional but recommended for code archaeology)

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Read-site inventory (Class A section)
- All 5 files listed above (grep for `FROM daily_ohlcv WHERE.*foreign_`)

### Files to modify
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts`
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts`
- `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts`
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts`
- `apps/mcp-server/src/scheduler/briefings/franceSummaryJob.ts`

### Files to create
- None (only modifications)

### Dependencies
- **Depends on:** TASK_2000 (schema + view must exist)
- **Blocks:** TASK_2005 (integration test) — needs read sites migrated to verify view correctness
- **Parallel with:** TASK_2001, TASK_2002 — safe because view COALESCEs both sources during transition

### Knowledge needed
- `docs/policies/dev-standards.md`
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Read-site inventory, § Change 3 (view definition)
- Basic SQL: understanding that view columns come from `COALESCE(new, old)` logic

### Notes
- **Zone:** `apps/mcp-server/` only
- **Risk R-8 (design doc):** view join cost is single indexed lookup per row — negligible at this table scale (per-ticker daily rows, not tick-level)
- **Risk R-9 (design doc):** if this subtask is deferred, probes stay working as today (reading frozen legacy columns). Only the decoupling improvement is deferred.
- Each change is literally a one-line rename (`FROM daily_ohlcv` → `FROM daily_ohlcv_with_flow`). Search/replace across files is safe.
- **Parallel-safe:** can run at same time as TASK_2001 (backfill) and TASK_2002 (writer cutover) because the view definition is non-destructive — it always falls back to legacy columns if new table row doesn't exist yet
- No changes needed to callers or tests — query signatures are identical
- Do NOT modify test files here — they will stay green as-is (query shape unchanged)
