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

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-07-12T18:35:00Z
**task-id:** TASK_2003
**what-done:** Migrated 5 Class-A read sites (`marketWideForeignFlowTool.ts`, `foreignFlowTools.ts`, `foreignFlowAlertJob.ts`, `assembleEveningSummary.ts`, `franceSummaryJob.ts`) `FROM daily_ohlcv` → `FROM daily_ohlcv_with_flow`; fixed cascading breakage in 9 test files whose bespoke `:memory:` fixtures predated the view.
**what-considered:**
- Leave the 9 broken tests red as "pre-existing design assumption wrong, not my bug" vs fix them — fixed: handoff's own "existing tests stay green" AC required it, and the break is a direct, necessary consequence of this task's read-source swap, not scope creep
- Per-file DDL duplication (mirror view SQL inline, as 1503's `addDailyForeignFlowTable` precedent already does) vs import real `initMarketDataTables`+`migrateForeignFlowColumns` — used real functions in 8/9 files (DRY, no schema drift risk); kept 1503's own established inline-mirror convention for its 1 broken case (file explicitly states "avoids pulling in production schema")
- Investigated 3 more incidental warn-only hits (`1322/1370/1348`) found in a full-suite bounded run — left untouched: none assert on foreignFlowMovers/Khối ngoại, pre-existing same-class gaps (missing commodity_prices/positions too), try/catch graceful-degrade already absorbs it, no hard fail
**why-decision:** SQLite must resolve a view's full underlying SELECT even for a partial column query — `daily_ohlcv_with_flow` needs `daily_ohlcv.updated_at`/`data_env`/`foreign_buy_value`/`foreign_sell_value` present, which several ad-hoc test fixtures lacked; root-cause fix (reuse real schema functions) over patching production code to tolerate a missing view.
**why-change:** handoff said "no changes needed to tests" — proven false empirically; fixed per CLAUDE.md root-cause mandate rather than leaving G12 test-suite gate red.

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-07-12T19:05:00Z
**task-id:** TASK_2004
**what-done:** Migrated 4 Class-B probes (`freshnessSlaMonitorJob.ts`, `slaStatusTools.ts`, `vpsProxyWatchdogJob.ts`, `vpsHealthPoller.ts`) `FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` → `FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL` (direct table, NOT the compat view — view's COALESCE would mask a dead writer); fixed 3 pre-existing regression files whose contract-lock tests/seeds asserted the legacy table; added new decoupling-proof test file.
**what-considered:**
- Handoff said "no test updates needed" vs verify empirically — verified: found 2 static-source contract-lock tests (`FIX-PDF-VOLUME-SBV-TABLE.test.ts`, `FIX-HEALTH-MONITOR.test.ts`) literally asserting `.toContain("daily_ohlcv")` for foreign_flow, plus 4 behavior tests across those 2 files + `FIX-VPS-HEALTH-FRESHN.test.ts` seeding `daily_ohlcv` and asserting `healthStatus` — all would have gone RED; updated in place (same "necessary fallout" precedent as TASK_2003)
- New decoupling-proof test file vs inline-only assertions — added `TASK-2004-daily-ff-class-b-probes.test.ts` covering all 4 probes with "daily_ohlcv absent/fresh, daily_foreign_flow fresh/stale" cross-matrix per dispatcher's explicit "prove with a test" requirement
- Full non-deterministic `get_sla_status` tool call for the stale-decoupling case vs deterministic direct-SQL-fragment check — used the SQL-fragment form: the tool's internal `new Date()` is not injectable, and off-hours dynamic-threshold logic would make a live-clock-dependent "breached" assertion flaky
**why-decision:** grep confirmed zero remaining `daily_ohlcv WHERE foreign_buy_vol` production sites outside tests/writer/DDL; targeted sweep (foreign-flow file glob) 729/729 pass, modified-file sweep 46/46 + 9/9 pass, tsc clean, server boots (toolCount=183 unchanged).
**why-change:** no change from handoff's SQL-shape guidance; corrected its "no test updates needed" assumption per empirical TDD discipline (same class of correction as TASK_2003's S5 entry).

### STEP dev-mcp-server-S7 · dev-mcp-server · 2026-07-12T19:30:00Z
**task-id:** TASK_2005
**what-done:** Added `daily-foreign-flow-integration.test.ts` (5 cases: T-3 view-only, behavioral gate, COALESCE-both, COALESCE-legacy-fallback, late-OHLCV join) composing writer+view exactly as a live Class-A caller would. RAW: 3 pass / 2 fail.
**what-considered:**
- Assert the AC's literal intended spec vs assert the view's actual current behavior — chose spec-literal: instructions explicitly forbid papering over a real gap with a passing test
- Fix the view's join direction myself (in-zone, feasible) vs report-only — report-only: this task is scoped additive/test-only; a schema-join fix is a distinct decision for PM/architect
**why-decision:** Empirically confirmed `daily_ohlcv_with_flow` is `FROM daily_ohlcv LEFT JOIN daily_foreign_flow` (anchored on daily_ohlcv) — a foreign-flow-only row is never returned, so all 5 already-migrated Class-A sites still can't surface a value before its OHLCV bar lands. Write-side R-1 (permanent loss) IS closed (TASK_2002); read-side "chưa trả số từng mã" is NOT closed by TASK_2003's view-based migration.
**why-change:** Deviates from the expected N/0 proportionate-gate outcome per the handoff's own explicit contingency — STOP, do not flip DONE_VERIFIED, route as new FIX.
