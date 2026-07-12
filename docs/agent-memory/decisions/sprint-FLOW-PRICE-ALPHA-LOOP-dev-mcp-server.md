# Decision Journal — Sprint FLOW-PRICE-ALPHA-LOOP · dev-mcp-server

**Sprint goal:** flow-alpha primary data strategy (per 2026-07-11 architecture-brief selection)
**Agent:** dev-mcp-server
**Started:** 2026-07-12T14:37:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-12T14:56:00Z
**task-id:** FIX-SEQUENTIAL-ANALYSIS-TOOL-DEAD-HANDLER
**what-done:** Fixed `sequential_market_analysis` registration in sequential-market-analysis.ts — moved `handler: tool.handle` from a nested config key to the SDK's required 3rd positional callback arg of `server.registerTool(name, config, cb)`.
**what-considered:**
- Nested `handler` key inside config object (the pre-existing broken shape) — SDK's registerTool destructures only title/description/inputSchema/outputSchema/annotations/_meta from config, silently dropping an unknown `handler` key, leaving `cb` undefined
- Switch to legacy `server.tool(name, description, schema, cb)` pattern used by all other tools — rejected: unnecessary churn, registerTool is the SDK's non-deprecated modern API and the config shape (title/description/inputSchema) was already otherwise correct
**why-decision:** Root cause confirmed by reading SDK source (mcp.js `registerTool(name,config,cb){...cb}` and `_createRegisteredTool(...,handler)` stores `handler: handler` directly) — 3rd positional arg is mandatory; minimal 1-call fix, no logic touched.
**why-change:** no change — task scope was exactly this registration-shape bug.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-12T16:40:00Z
**task-id:** TASK_2000
**what-done:** Added `daily_foreign_flow` table+index+`daily_ohlcv_with_flow` COALESCE view to schema-market-data.ts (SUBTASK-DAILY-FF-1); new unit test file; docs updated.
**what-considered:**
- Ship only Change 1+3 (table/index/view) per handoff scope vs also doing Change 2 (writer cutover) — rejected extra scope: DAILY-FF-3 depends on DAILY-FF-2 (backfill) landing first per R-6, out of order here
- Wire migration via schema.ts explicit call vs rely on existing `initMarketDataTables(db)` call already in boot sequence — used existing call (zero functional schema.ts change needed, CREATE TABLE/VIEW IF NOT EXISTS already idempotent+wired)
- Place new DDL before vs after the `data_env` ALTER block — placed after, so the view's `o.data_env` column always resolves on first-boot view creation
**why-decision:** Handoff explicitly scopes this subtask to additive DDL only; existing `initMarketDataTables()` composition root already satisfies "migration wired into boot sequence" AC without touching schema.ts.
**why-change:** no change from handoff/architect design — additive-only, no daily_ohlcv column/row change.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-12T17:00:00Z
**task-id:** TASK_2001
**what-done:** Added `backfillDailyForeignFlow(db)` to schema.ts (INSERT OR IGNORE...SELECT from daily_ohlcv), called right after `migrateForeignFlowColumns(db)` in `initDatabase()`; new test file with T-5 idempotency + correctness + additive + boot-wiring + perf tests.
**what-considered:**
- Place function in schema-market-data.ts (DDL owner) vs schema.ts (next to sibling `migrateForeignFlowColumns`, same idempotent-migration pattern) — chose schema.ts: PM handoff names both files acceptable, colocating with its direct precedent pattern is clearer than splitting DDL-owner from migration-owner
- Sync vs async function signature — sync: db.exec is synchronous in bun:sqlite, no I/O to await; matches most other migration helpers in the file
**why-decision:** R-6 ordering requires this to run on every boot before writer cutover (SUBTASK-DAILY-FF-3); wiring immediately after the existing legacy-column migration keeps both "legacy columns guaranteed to exist" and "new table guaranteed to exist" preconditions satisfied at call time.
**why-change:** no change from handoff/architect design § Change 4 — exact SQL, additive/idempotent as specified.

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-12T17:35:00Z
**task-id:** TASK_2002
**what-done:** Rewrote `writeForeignFlowToOhlcv` to unconditional `INSERT...ON CONFLICT(code,date) DO UPDATE` into `daily_foreign_flow`; stopped writing `daily_ohlcv.foreign_*`; added SSOT-freeze JSDoc + synced stale Writer-G row in `ohlcvWriteService.ts`; new test file (T-1/T-2/T-4/T-5); updated 2 legacy test files, deleted 1 fully-superseded.
**what-considered:**
- Leave `2026-ohlcv-foreign-flow-merge.test.ts` red (asserts retired merge-only `changes=0` contract) vs update assertions vs delete — deleted: every assertion fully superseded by new test file (same T-1..T-4 IDs), keeping both = duplicated debt
- Update `1503`/`DPI-4` legacy tests' `changes=0`/`daily_ohlcv.foreign_*` assertions vs leave red as "expected fail" — updated in place (3rd revision marker, same codebase convention as prior "(UPDATED)" tags) since PM's "~15 files stay green" AC requires it and stale-contract assertions are dead-code debt
- Sync Writer-G inventory row in `ohlcvWriteService.ts` (SSOT doc for the writer-bypass class) vs leave stale — synced: it now claims Writer G still touches `daily_ohlcv`, which is false post-cutover
**why-decision:** `changes=0` is structurally impossible now (task's explicit point) — any test asserting it as correct behavior encodes removed behavior, must be updated not preserved.
**why-change:** no change from handoff/design — SQL, freeze annotation, caller-compat all per spec; test-file surgery was implied necessity, not scope creep (the 3 files directly call the rewritten function with the old contract baked into assertions).
