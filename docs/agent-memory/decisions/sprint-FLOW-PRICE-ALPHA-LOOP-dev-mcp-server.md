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

### STEP dev-mcp-server-S8 · dev-mcp-server · 2026-07-13T05:20:00Z
**task-id:** ALPHA-S1-OHLCV-BACKFILL-DONE-BUG
**what-done:** Added nullable `ohlcv_backfill_queue.bars_inserted` column + inserted-count verification step in `handleOhlcvBackfillDone` (re-queue on `barsPushedTotal===null||0`, reusing R-5 ladder); mutually exclusive with the pre-existing depth probe.
**what-considered:**
- Gate `done` itself on a successful insert vs keep `done=1` unconditional + re-queue via a new row — kept unconditional: gating would break `vn-ohlcv-backfill.timer`'s poller's documented "regardless of exit code" unblock contract for zero benefit (re-queue-via-new-row achieves the same retry outcome, per architect design)
- Run insert-verification and depth-probe both every call vs mutual exclusion — mutual exclusion: BT-4-style double-fire (2 re-queue rows + 2 Telegram alerts for one event) confirmed by tracing existing test BT-4 against the new logic
- Retroactively backfill `bars_inserted` for the 650 historical rows vs leave NULL — left NULL: no ground truth ever existed for those closures (that absence IS the bug), fabricating a historical value would violate no-fake-data
**why-decision:** Architect design (`docs/handoffs/ALPHA-S1-architect-design.md` §3) fully specified this exact design incl. BT-6/7/8 test cases; implemented verbatim. RAW probe (docker exec, live named-volume DB) found queue table has no historical bars_inserted (column never existed — the bug's own footprint) but 68 real zero-insert `push-ohlcv-history` log events survive in the 7-day retained log window, corroborating the defect class independent of the brief's own "457" estimate.
**why-change:** One unplanned fallout: pre-existing `1360-ohlcv-backfill-queue.test.ts` TC-6 asserted the OLD buggy assumption (empty-body close + healthy depth = no re-queue) — updated its assertion to the corrected behavior (matches new BT-7 semantics) since it was directly exercising the exact scenario this fix corrects, not incidental collateral.

### STEP dev-mcp-server-S9 · dev-mcp-server · 2026-07-13T07:01:44Z
**task-id:** FIX-MCP-BOOTSTRAP-BLOCKING-EXECSYNC-PROJECTROOT
**what-done:** Replaced `getProjectRoot()`'s blocking `execSync("git rev-parse --show-toplevel")` with a synchronous fs walk-up from `import.meta.dir` to the first ancestor containing `pnpm-workspace.yaml`/`.git`; removed `child_process` import.
**what-considered:**
- Env override (`PROJECT_ROOT`) vs marker walk-up — walk-up: `PROJECT_ROOT` is never actually set anywhere (docker-compose/.env), so wiring it would add untested surface for no real gain
- fs walk-up vs fixed `resolve(import.meta.dir, "..","..","..")` (the repo's own scheduler/ anti-pattern) — walk-up: fixed-depth breaks if this file ever moves; markers are the same idea `.git` gives, just no subprocess
**why-decision:** Traced actual consumer: `agentBootstrap.ts`'s `buildToolNameMap()` synchronously probes every `toolRegistry` fn at module load, incl. `registerAgentMemoryTools`/`registerAgentMemoryUpdateTools` which call `getProjectRoot()` — confirmed this IS on the bootstrap hot path (not agentBootstrap.ts directly, but through the probe it runs at import time). Walk-up resolves to the identical path git would in a normal checkout (proven: matches `path.resolve(testDir,"../../../..")` from the new test) and reuses the existing container fallback (`process.cwd()`) when no marker is found.
**why-change:** No change from dispatcher's preferred direction — implemented exactly as scoped (marker-based walk-up, memoized, same public contract).

### STEP dev-mcp-server-S10 · dev-mcp-server · 2026-07-13T14:15:00Z
**task-id:** VCB-MISSING-PDFS
**what-done:** RAW-verified via docker exec: VCB_2025_Q4.pdf genuinely absent from `data/pdfs/` (271 reparse_attempts, feedback id=323, live log confirms "file disappeared" 07-11T11:48Z); VCB_2025_Q1.pdf actually PRESENT on disk (board desc stale for this half — no live spin, attempts=0). financial_reports already holds valid VCB Q4-2025 + Q1-2025 rows (parsed under canonical filenames) — re-sourcing id=323's exact duplicate filename would be pointless. Added `DEAD_AT_ATTEMPTS(10)` guard in `bctcReparseJob.ts`: a row failing past 10 attempts AND file-confirmed-missing now flips to `status='dead'` (generic, no ticker literal) instead of spinning forever; ran new `scripts/migrations/reap-dead-stranded-bctc-rows.ts --apply` against the live DB to retire id=323 immediately (deploy-gated code fix not yet live).
**what-considered:**
- Outer-loop `existsSync` pre-check (unconditional) vs threshold-gated — threshold-gated (10): unconditional would've broken all 6 existing test files whose synthetic `/tmp/*` seed paths never exist, since they rely on `reparseFn` stubs, not real fs
- Delete/replace the on-disk duplicate VCB_2025_Q1.pdf vs leave alone — leave alone: file isn't missing, no live bug for this half; deleting real data beyond the reported symptom would be inventing work
- Hardcode a VCB-specific cleanup script vs generic detection query — generic: found 55 OTHER present-but-failing rows (NVL/HCM/VHM/etc, 99-100 attempts) — a ticker-hardcoded script would miss the same class recurring elsewhere; query is title/status/attempts/fileExists-based only
**why-decision:** DB is the single ground truth (271 attempts + fresh "file disappeared" log line = live, not stale); financial_reports already-filed confirms clean-dead-row is correct over re-source (no fake/duplicate data). `status='dead'` (not `'resolved'`) keeps the row honest — it was never actually reparsed.
**why-change:** No change — board's own two remediation options (re-source | clean-dead-rows) anticipated exactly this outcome; picked clean-dead-rows per its own "prefer if re-sourcing not cleanly possible" guidance.
