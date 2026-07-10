---
sprint: ARCH-DAILY-FOREIGN-FLOW-TABLE
parent_task: ARCH-DAILY-FOREIGN-FLOW-TABLE
subtask_index: 5
task_id: TASK_2004
branch: task/2004-daily-ff-class-b-probes
size: S
zone: apps/mcp-server/
depends_on: ["TASK_2000"]
blocks: []
---

## TLDR
Migrate 4 Class-B "freshness/health probes" to query `daily_foreign_flow` directly instead of `daily_ohlcv`. These sites only need `MAX(updated_at)` checks for health monitoring — they now get a clean, undiluted signal that isn't conflated with OHLCV pipeline health. Genuine improvement, not just a rename.

## [PM] Planning Context

**Architect's subtask:** SUBTASK-DAILY-FF-5 (§5 PM Task Atomization)

### Acceptance Criteria
- [ ] Migrate 4 files to query `daily_foreign_flow` directly (NOT through the view — direct table access for cleaner freshness signal):
  - [ ] `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts:L111` — `MAX(updated_at) FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL`
  - [ ] `apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts:L71` — same query shape, tool-surface twin
  - [ ] `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts:L137` — `MAX(updated_at) FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL`
  - [ ] `apps/mcp-server/src/domain/services/vpsHealthPoller.ts:L187` — update `latestTimestampSql` SQL string to query new table
- [ ] All 4 probes now read clean foreign-flow pipeline signal, not conflated with OHLCV pipeline state
- [ ] Verify type checks pass (`pnpm check`)
- [ ] No functional change to monitoring logic — only SQL change, same return shapes
- [ ] Add comment to each file explaining that `daily_foreign_flow` is now the authoritative freshness source (decoupled from OHLCV pipeline health)

### Files to read first
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Read-site inventory (Class B section), § Change 3 (why NOT through view)
- All 4 files listed above (grep for `MAX(updated_at)` + `foreign_buy_vol`)

### Files to modify
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts`
- `apps/mcp-server/src/interface/mcp/tools/system/slaStatusTools.ts`
- `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts`
- `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` (SQL string update)

### Files to create
- None (only modifications)

### Dependencies
- **Depends on:** TASK_2000 (new table must exist)
- **Blocks:** none
- **Parallel-safe with:** TASK_2001, TASK_2002, TASK_2003 — table exists and is backfilled before any write happens

### Knowledge needed
- `docs/policies/dev-standards.md`
- `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Change 3 (why NOT view), § Risk Flags R-9

### Notes
- **Zone:** `apps/mcp-server/` only
- **Size:** S — only 4 small query changes, no test updates needed (probes stay working as-is, just reading cleaner data)
- **R-9 mitigation:** if this task is deferred, probes keep working (reading legacy `daily_ohlcv.foreign_buy_vol IS NOT NULL`), but the decoupling improvement is deferred. Not a correctness issue, only a latent-false-negative improvement.
- **Key improvement:** today, `MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` conflates "is the foreign-flow VPS pipeline healthy" with "has the OHLCV pipeline also written a row" — a stalled OHLCV writer with healthy foreign-flow currently reads as STALE. Post-migration, the new table is direct, undiluted signal.
- No changes to test files — probes keep same return shapes
- Each change is a simple `FROM daily_ohlcv` → `FROM daily_foreign_flow` + `WHERE foreign_buy_vol IS NOT NULL` (same clause, just different table)
