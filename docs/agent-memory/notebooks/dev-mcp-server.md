# dev-mcp-server -- Notebook

## 2026-07-12 — TASK_2001 (SUBTASK-DAILY-FF-2, ARCH-DAILY-FOREIGN-FLOW-TABLE) → REVIEW

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team cron dispatch, tick 16:37Z; PM handoff `docs/handoffs/TASK_2001-daily-ff-backfill.md`)

One-time idempotent backfill (Change 4 of the architect design), gated by R-6 ordering — must land+complete before the writer cutover (SUBTASK-DAILY-FF-3, TASK_2002). Added `backfillDailyForeignFlow(db)` to `schema.ts` right next to its direct precedent `migrateForeignFlowColumns()`: `INSERT OR IGNORE INTO daily_foreign_flow (...) SELECT ... FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL OR foreign_sell_vol IS NOT NULL`, all 8 columns + (code,date) PK. Wired into `initDatabase()` immediately after the existing `await migrateForeignFlowColumns(db);` call (both preconditions — legacy columns exist, new table exists — guaranteed satisfied at call time).

New test file `daily-foreign-flow-backfill.test.ts` (6 tests): T-5 idempotency (run twice, 2nd run no-op — identical row count, no dup/error); correctness (all 8 columns + PK copied identically); rows with both foreign_buy_vol/foreign_sell_vol NULL correctly skipped (WHERE clause); additive-only proof (pre-existing daily_foreign_flow row with different values untouched by a conflicting legacy row — INSERT OR IGNORE PK-guard); boot-sequence wiring proof (re-running `initDatabase()` on the same in-memory connection backfills a freshly-inserted legacy row WITHOUT a direct `backfillDailyForeignFlow()` call); performance checkpoint (3000 synthetic rows backfilled in well under 5s).

Verified: new suite 6/6 pass (24 expect). Regression: `daily-foreign-flow-schema` (15/15) + `2026-ohlcv-foreign-flow-merge` (7/7) + `1286-daily-ohlcv-schema` + `1527-schema-slices` + `002-db-schema` = 123/123 pass, 0 fail. `bun tsc --noEmit` clean. toolCount=183 unchanged (no tool/scheduler file touched); scheduler cron.schedule grep=3 (pre-existing doc/reality drift already flagged in the prior TASK_2000-cycle entry, unrelated to this diff).

Commit: this agent's own direct commit (RUN-SOLO, explicit-path staging — schema.ts + new test + 2 doc files + journal). Dispatcher owns the board row — no orch-state write from this agent (task's explicit constraint). **Redeploy needed to reach the live DB**: no container rebuild/swap performed (user/ops-gated); backfill runs automatically+safely on the next mcp-server boot against the live named-volume DB (not run manually against it per task's data-safety instruction). Unblocks SUBTASK-DAILY-FF-3 (TASK_2002, writer cutover) per R-6.

Zone health: tsc clean, 6 new + 123 regression pass/0 fail, toolCount=183 unchanged, additive+idempotent (INSERT OR IGNORE only, never overwrites) | HEALTHY.

## 2026-07-12 — TASK_2002 (SUBTASK-DAILY-FF-3, ARCH-DAILY-FOREIGN-FLOW-TABLE, writer cutover) → REVIEW

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team cron dispatch, tick 17:07Z; PM handoff `docs/handoffs/TASK_2002-daily-ff-writer-cutover.md`)

Rewrote `writeForeignFlowToOhlcv` (`ohlcvForeignFlowStore.ts`) to unconditional `INSERT...ON CONFLICT(code,date) DO UPDATE` into `daily_foreign_flow` — R-1 structurally closed, `changes` can no longer be 0 for a valid row. Stopped writing `daily_ohlcv.foreign_*` entirely (any mode); added SSOT-freeze JSDoc + synced the now-stale Writer-G inventory row in `ohlcvWriteService.ts`. Return shape/signature unchanged — zero caller edits (`foreignFlowFetcher.ts`, `pushForeignFlowHandler.ts` confirmed).

3 legacy test files directly called the rewritten function with the retired merge-only `changes=0` contract baked into assertions — updated in place (`1503-ohlcv-foreign-flow.test.ts` AC2/AC3, `DPI-4-foreign-flow-upsert.test.ts` AC-1/AC-7) and deleted 1 fully-superseded (`2026-ohlcv-foreign-flow-merge.test.ts` — every assertion duplicated by the new file under new semantics). New `daily-foreign-flow-table.test.ts` (T-1/T-2/T-4/T-5 + upsert-path + generic-across-codes + empty-input, 8 tests).

Verified: new suite 8/8; 5-file targeted set (new + backfill + schema + 1503 + DPI-4) 38/38; broader 15-file foreign-flow sweep 120/120, 0 fail. `bun tsc --noEmit` clean. toolCount=183 unchanged.

Commit: this agent's own direct commit (RUN-SOLO, explicit-path staging). Dispatcher owns the board row. **Redeploy rides the pending user/ops-gated mcp-server rebuild** (same one applying TASK_2000+2001) — do not run. **Flagged, not fixed (out of scope):** Class-A read sites (marketWideForeignFlowTool.ts etc., SUBTASK-DAILY-FF-4) still query raw `daily_ohlcv` — until they migrate to `daily_ohlcv_with_flow`, freshly-written post-cutover foreign-flow data is invisible to them (view COALESCE only helps view readers). PM should sequence -4/-5 promptly after this ships.

Zone health: tsc clean, 8 new + 158 regression pass/0 fail (5-file + 15-file sweeps), toolCount=183 unchanged | HEALTHY.

## 2026-07-12 — TASK_2003 (SUBTASK-DAILY-FF-4, ARCH-DAILY-FOREIGN-FLOW-TABLE, Class-A read migration) → REVIEW

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team cron dispatch, tick 18:07Z; PM handoff `docs/handoffs/TASK_2003-daily-ff-class-a-reads.md`)

Migrated the 5 flagged Class-A read sites `FROM daily_ohlcv` → `FROM daily_ohlcv_with_flow` (one-line rename each, comments added): `marketWideForeignFlowTool.ts` (3 queries), `foreignFlowTools.ts` (2), `foreignFlowAlertJob.ts` (1), `assembleEveningSummary.ts` (1, default `getForeignFlowMoversFn`), `franceSummaryJob.ts` (2, default `getForeignFlowMoversFn`'s latest-date lookup + mover query). This closes the writer-cutover transition gap flagged by TASK_2002 — post-cutover `daily_foreign_flow` writes are now visible to every Class-A reader.

Unplanned but necessary: SQLite must resolve a view's full underlying SELECT even for a partial column query, so `daily_ohlcv_with_flow` requires `daily_ohlcv.updated_at`/`data_env`/`foreign_buy_value`/`foreign_sell_value` to already exist — 9 pre-existing test files' bespoke `:memory:` fixtures (created before this view existed) lacked one or more of these columns and broke (46 failing assertions across `MSG-1`, `1134`, `1518`, `1133`, `1517`, `1503`, `1516`, `FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN`, `FIX-EVIDENCE-PIPELINE-STARVED`). Fixed root cause: 8/9 now call the real `initMarketDataTables()`+`migrateForeignFlowColumns()` (no duplicated DDL); `1503` kept its own established inline-DDL-mirror convention (file explicitly avoids importing production schema) and got a matching inline view helper.

grep confirms no other Class-A sites remain (only the 4 documented Class-B freshness probes + the writer + the DDL/backfill file still reference `daily_ohlcv.foreign_*`, all correctly out of this subtask's scope).

Verified: 19-file/162-test targeted foreign-flow sweep 162/162 pass, 0 fail. `bun tsc --noEmit` clean. Server boot + `/health` OK, toolCount=183 unchanged. Bounded single full-suite run (~20.3k lines before the documented tail-crash) grepped clean for my 5 files/`daily_ohlcv_with_flow` — the only hits were 3 unrelated pre-existing tests (`1322`/`1370`/`1348`) logging one more benign warn-and-degrade line (they don't assert on foreignFlowMovers); the 16 hard `(fail)` lines in that run are all pre-existing pollNews/BCTC-timeout tests, unrelated to this diff.

Commit: this agent's own direct commit (RUN-SOLO, explicit-path staging — 5 prod files + 9 test files + 2 doc files + journal). Dispatcher owns the board row. **Redeploy rides the pending user/ops-gated mcp-server rebuild** (same one as TASK_2000-2002) — closes the transition gap once released.

Zone health: tsc clean, 162/162 targeted pass, toolCount=183 unchanged, transition gap closed | HEALTHY.
