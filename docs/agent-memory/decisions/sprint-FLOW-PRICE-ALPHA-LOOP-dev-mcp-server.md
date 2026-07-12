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
