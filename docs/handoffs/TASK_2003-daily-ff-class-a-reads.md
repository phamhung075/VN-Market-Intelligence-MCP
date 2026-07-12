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

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified (production, 5):**
  - `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts` — 3 queries (`queryMarketWideForeignFlow` SUM aggregate + `queryTopFlowTickers` top-buyers/top-sellers), `FROM daily_ohlcv` → `FROM daily_ohlcv_with_flow`
  - `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts` — `getForeignFlowValues()` (buy/sell VND values) + the test-injection cumulative-sum path in `registerForeignFlowTools`, both renamed
  - `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts` — `getForeignFlowHistoryFromDb()` renamed
  - `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` — default `getForeignFlowMoversFn` movers query renamed (inner `MAX(date)` subquery left on `daily_ohlcv` — it needs no foreign columns, unrelated to the swap)
  - `apps/mcp-server/src/scheduler/briefings/franceSummaryJob.ts` — default `getForeignFlowMoversFn`'s latest-date lookup AND mover query both renamed (2 statements)
  - All 5: no query-shape change, comment added noting the view source per handoff's optional recommendation.
- **Files modified (test fixtures, 9 — necessary fallout, see Decision Journal S5):** `1133-foreign-flow-alert-job.test.ts`, `1134-get-foreign-flow-tool.test.ts`, `1503-ohlcv-foreign-flow.test.ts`, `1516-france-summary-foreign-flow.test.ts`, `1517-foreign-flow-alert-ohlcv-source.test.ts`, `1518-get-foreign-flow-ohlcv-source.test.ts`, `FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.test.ts`, `FIX-EVIDENCE-PIPELINE-STARVED.test.ts`, `MSG-1-market-foreign-flow.test.ts` — each fixture now upgrades its ad-hoc `daily_ohlcv`-only schema via the real `initMarketDataTables()`/`migrateForeignFlowColumns()` (8 files) or a local mirrored view helper (`1503`, matching its own pre-existing no-production-schema-import convention).
- **Tests written:** none new (existing suites reused); 9 files' setup functions made `async` to await `migrateForeignFlowColumns()`.
- **Git commits:** see RETURN block below.
- **Type check:** clean (`bun tsc --noEmit`)
- **bun test:** 19-file/162-test targeted foreign-flow sweep — 162 pass / 0 fail. Bounded single full-suite run (~20.3k lines, killed at the documented tail-crash point) — 0 fails attributable to this diff; 16 pre-existing unrelated fails (pollNews timeouts, BCTC PDF-timeout fallback tests).
- **Tool count:** 183 — matches pre-task baseline (`bun scripts/gen-project-stats.ts --dry-run`)
- **Scheduler count:** `grep -rc "cron\.schedule" src/scheduler/` = 3 — this zone's scheduling has migrated to a `CRONS` config-map pattern (not literal `cron.schedule()` calls); the flow doc's baseline-76 probe is stale relative to current code structure, pre-existing drift unrelated to this task, flagged not fixed (out of scope).
- **Behavioral proof (COALESCE transition equivalence):** confirmed via `1503-ohlcv-foreign-flow.test.ts` AC2/AC3 (new-table write path lands in `daily_foreign_flow`, legacy `daily_ohlcv.foreign_*` stays NULL/frozen) combined with the `daily_ohlcv_with_flow` view definition's COALESCE(new, legacy) — and empirically via a standalone probe script: querying the view with only a `daily_foreign_flow` row present returns the new-table value; with only the legacy `daily_ohlcv.foreign_*` populated (no `daily_foreign_flow` row for that code/date), the view falls back and returns the legacy value unchanged. Both paths verified against a `:memory:` DB, never the live serving DB.
- **Additional un-migrated Class-A read sites found:** none. `grep -rl "foreign_buy_vol\|foreign_sell_vol\|foreign_net_vol\|foreign_buy_value\|foreign_sell_value\|put_through_vol" apps/mcp-server/src --include="*.ts"` (excluding `__tests__`) returns exactly: the 5 migrated files + the 4 documented Class-B freshness probes (`freshnessSlaMonitorJob.ts`, `slaStatusTools.ts`, `vpsProxyWatchdogJob.ts`, `vpsHealthPoller.ts` — correctly out of scope, design doc says they should query `daily_foreign_flow` directly, a separate not-yet-shipped follow-on) + `schema-market-data.ts` (DDL/view owner) + `ohlcvForeignFlowStore.ts` (the writer, already migrated by TASK_2002) + `schema.ts` (the Change-4 backfill, which must legitimately read raw `daily_ohlcv` to seed the new table).
- **Docs updated:** `docs/architecture/microservice/mcp-server/infrastructure.md` (SUBTASK-DAILY-FF-4 SHIPPED annotation replacing the "not yet shipped" note under `daily_ohlcv_with_flow`) + `docs/architecture/microservice/mcp-server/testing.md` (new row documenting the 9-file fixture-upgrade pattern)
- **Graphify:** skipped — 2 targeted doc edits (comment/annotation additions, no new concepts), consistent with TASK_2000/2001/2002 (same subtask chain) which did not run it either; disproportionate for this diff size.
