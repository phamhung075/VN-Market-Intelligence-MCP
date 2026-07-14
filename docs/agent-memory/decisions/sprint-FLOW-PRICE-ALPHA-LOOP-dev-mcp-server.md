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

### STEP dev-mcp-server-S12 · dev-mcp-server · 2026-07-13T21:40:00Z
**task-id:** FIX-DAILY-FF-VIEW-JOIN-ANCHOR
**what-done:** Implemented architect Shape A verbatim: `daily_ohlcv_with_flow` view = `DROP VIEW IF EXISTS` + unconditional `CREATE VIEW` (LEFT JOIN UNION ALL anti-join over `daily_foreign_flow`, 15 cols); flipped `daily-foreign-flow-schema.test.ts` R-1 view-level-proof `toBe(0)`→`toBe(1)` + asserted `foreign_buy_vol`/`close IS NULL`. Did not touch the frozen integration-test gate file.
**what-considered:**
- `CREATE VIEW IF NOT EXISTS` (pre-existing idiom) vs `DROP`+unconditional `CREATE` — DROP+unconditional per brief's explicit footgun: live DB is a persistent named Docker volume, `IF NOT EXISTS` would silently no-op the fix on redeploy despite green tests
- `rows[0].foreign_buy_vol` direct-index assertion (as sketched in the brief's SQL comment) vs a separate `.get()` call — `.get()`: `noUncheckedIndexedAccess` flags `rows[0]` as possibly-undefined; matches this file's existing COALESCE-test `.get()` idiom, zero behavior change
**why-decision:** Frozen gate assertions in `daily-foreign-flow-integration.test.ts` query the view directly — only a view-level fix (not a read-site rewrite) can flip them green, per brief's Shape A vs Shape B disqualification.
**why-change:** No change from brief — exact SQL verbatim; one tsc-driven micro-adjustment to test assertion mechanics (not coverage/intent). Full `bun test` (1203 files) hit its documented Bun-native tail-crash after printing 14549 pass/40 skip/103 fail/12 errors — none reference `daily_ohlcv_with_flow`/foreign-flow files (grepped); isolated 14-file foreign-flow sweep (incl. 1518 not in brief's list) 118/118 pass confirms zero regression.

### STEP dev-mcp-server-S11 · dev-mcp-server · 2026-07-13T16:50:00Z
**task-id:** HPG-DISCOVER-CONSOLIDATED-PDF
**what-done:** Confirmed (live hsx.vn mediafiles API) HPG 2025-Q4's on-disk/queued PDF was the wrong scope (`...rieng Cong ty me...`, standalone parent-only, ingested pre-FIX-CTG-1); discovered+downloaded the real consolidated (`hop nhat`) sibling PDF (33p, 7,135,524 bytes, verified against hsx.vn content-length), placed it in the live pipeline's data/pdfs/, corrected `bctc_vps_queue` row 223's `source_url` to the consolidated URL via new script `scripts/migrations/discover-consolidated-bctc-pdf.ts`. Full scalar reflow into `financial_reports` did NOT complete: pdf-extractor's OCR of this scanned doc exceeds `pdfExtractorClient.ts`'s 120s Tier-1 timeout (confirmed: one page alone ran >17 min); did not blind-bump the timeout without ability to verify within session.
**what-considered:**
- Reuse `reparse-bctc-reports.ts` as-is vs new script — new script: existing one fuzzy-matches ticker+year in `data/pdfs/`, which would re-grab the WRONG (rieng) file already present; needed to download+push the freshly-discovered URL itself
- Bump `pdfExtractorClient.ts` Tier-1 timeout now vs leave for follow-up — leave: would require a container rebuild (deploy-gated, self-deploy forbidden) AND I could not verify the fix actually resolves within a bounded session (OCR duration unconfirmed/pathological on this doc)
- Force queue row to 'done' with stale scalars vs leave 'done'-but-stale honestly — left honestly: `financial_reports.pdf_path` untouched (still points to the old rieng file) since the pipeline never got text; no fabricated scalars written
**why-decision:** Router's mid-crash notice (mcp-server SQLite-corruption crash-loop 15:37-15:50Z, restored from 04:30Z backup) wiped my first in-flight queue-reset write — re-verified live post-recovery state matched pre-crash reads (data predates 04:30Z), then redid the apply cleanly against the healthy container.
**why-change:** Scope was strictly "discover the consolidated PDF" — achieved and RAW-verifiable; the deeper OCR-timeout gap is a distinct, separate defect flagged for follow-up, not silently absorbed into this task's DONE claim.

### STEP dev-mcp-server-S13 · dev-mcp-server · 2026-07-14T00:00:00Z
**task-id:** ALPHA-S2-SUB1-DDL
**what-done:** Added `intraday_ohlcv_5m` table + `idx_intraday_5m_code_bucket` index to `schema-market-data.ts`'s `initMarketDataTables()`, immediately after the `market_prices_history` block (co-located with its source table, mirroring `daily_ohlcv`'s placement) — DDL verbatim from architect brief `docs/architecture-briefs/2026-07-14-alpha-s2-tick-downsample-5min.md` §3: `code`/`bucket_ts` PK, OHLC `REAL NOT NULL`, `volume REAL NOT NULL DEFAULT 0` carrying the same cumulative-to-date MAX(volume) convention as `daily_ohlcv.volume` (comment preserved verbatim, not a per-bar delta), `tick_count INTEGER NOT NULL DEFAULT 0` (observability only), `compacted_at TEXT NOT NULL`. Both `CREATE TABLE`/`CREATE INDEX` are `IF NOT EXISTS` — idempotent on the live persistent named-volume DB.
**what-considered:**
- Inline the DDL verbatim vs re-derive column order/comments independently — verbatim: brief §3 is architect-authored and already reviewed; re-deriving risks silent drift (e.g. dropping the volume-convention comment, which is the one column a future reader is most likely to misinterpret as a per-bar delta)
- Add doc-sync (cron-registry.json/system-map.json/cron-jobs.md) in this same commit vs defer — deferred: this subtask ships DDL only, no cron job exists yet to register (that's SUB2/SUB3 per the brief's §9 subtask split); doc rows referencing a non-existent job would be premature/inaccurate
**why-decision:** Task explicitly scoped to SUB1 (DDL-only) by the router/umbrella-chain dispatch; brief's own §9 table enumerates DDL as subtask 1 of 5, compaction job/scheduler wiring as subtask 2, docs as subtask 3 — kept strictly to subtask 1's file (`schema-market-data.ts`) only.
**why-change:** No deviation from brief §3 — DDL is verbatim (columns, PK, index, volume-convention comment all present). `bun tsc --noEmit` clean (from `apps/mcp-server`, matches pre-push hook gate). No test file added/touched (DDL-only change to an already-tested composition root — `initMarketDataTables()` runs implicitly via every existing DB-backed test's boot path with zero assertion changes needed for a purely additive idempotent table).

### STEP dev-mcp-server-S14 · dev-mcp-server · 2026-07-14T22:08:46Z
**task-id:** ALPHA-S2-SUB2-JOB-CRON
**what-done:** Added `runIntraday5mCompactor()` (`apps/mcp-server/src/scheduler/market-data/intraday5mCompactorJob.ts`, new file) — single bounded scan of `market_prices_history` (ALL codes, brief §6, not just watchlist), JS grouping into 5-min UTC-aligned buckets (`Math.floor(fetchedAtMs/300_000)*300_000`), reduce to open=first/high=max/low=min/close=last/volume=MAX(volume, SAME cumulative-to-date convention as `daily_ohlcv.volume`, brief §1.2/§3)/tick_count=count, full-row `INSERT OR REPLACE` (inside a `db.transaction`, matching `predictionMarketJob.ts`'s `storeSnapshot` idiom) into `intraday_ohlcv_5m` keyed `(code, bucket_ts)`. Registered `intraday5mCompactor: '*/5 * * * *'` in `cronConfig.ts` (unrestricted, same idiom as `vpsServiceHealth`) and a `buildJobTable()` entry (`schedulerJobTable.ts`, plain `jobRunRepo.wrapRun` envelope, `{rowsWritten: result.bucketsWritten}`) right after `vnIndexRefreshJob`. Wired a fire-and-forget startup one-shot call in `startScheduler.ts` right after the `runOhlcvCandlePresenceGuard` block (non-fatal `.catch`, brief §5) — the job's own full-rescan algorithm makes this call double as the backfill of whatever ticks survive at deploy time; no separate migration script needed.
**what-considered:**
- SQL window-function pass vs JS grouping (single `ORDER BY code, fetched_at` scan + `Map` accumulator) — JS grouping per brief §4's explicit precedent choice (`ohlcvDailyAggregatorJob.ts`'s per-window-query style is the more directly analogous idiom for this exact source table than `moneyRadarStore.ts`'s window-function style)
- Route writes through `writeOhlcvBatch` (existing SSOT choke-point for `daily_ohlcv`) vs a plain prepared-statement `INSERT OR REPLACE` — plain statement, per brief §3's explicit instruction: `market_prices_history.price` is already VND-normalized once at write time (`pushPricesHandler.ts`), so `writeOhlcvBatch`'s scale-detection machinery (built for raw multi-source daily inputs) does not apply; every run recomputes the COMPLETE bucket from all currently-surviving ticks (full overwrite), not an incremental partial push like `daily_ohlcv`'s `ON CONFLICT` merge rules
- `WATCHDOG_MANIFEST` self-heal entry (brief §4 "optional hardening... not required to close this task's DoD") — deferred: router's task scope explicitly listed only `cronConfig.ts`/`schedulerJobTable.ts`/`startScheduler.ts`/the new job file; brief itself flags this as optional/stretch (§9 row 5) for PM to decide separately
- First comment draft embedded a literal `'*/5 * * * *'` cron string inside a `/** ... */` JSDoc block in `cronConfig.ts` — caught by `tsc` (the embedded `*/` prematurely closed the block comment, corrupting everything after it into malformed code); fixed by describing the cadence in prose instead of quoting the raw cron string inside a block comment (existing file convention already avoids this — e.g. `vpsServiceHealth`'s own comment never quotes its cron string)
**why-decision:** Brief §4's algorithm and hard constraints (no market-hours gate, ALL codes not watchlist-only, full-row UPSERT not `writeOhlcvBatch`) are unambiguous and directly actionable; zero deviation needed. `db.transaction(...)` batching for the UPSERT loop reuses an idiom already established elsewhere in this codebase (`predictionMarketJob.ts`) rather than inventing a new batching pattern.
**why-change:** No change from brief — implemented §4/§5/§6 verbatim. Did NOT touch `pushPricesHandler.ts` (purge stays as-is) or `checkDuplicatePriceHistory.ts` (separate PO backlog row per brief §1.3, out of this subtask's scope) — confirmed via scoped `git status --porcelain` showing zero diff on either file both before and after this change. `pnpm --filter vn-market check` (`bun tsc --noEmit`) clean after the comment fix, zero errors.

### STEP dev-mcp-server-S15 · dev-mcp-server · 2026-07-15T00:20:00Z
**task-id:** ALPHA-S2-SUB3-DOCS-CRON
**what-done:** Bumped `FACTORY-SCHEDULER-job-table-registry.test.ts`'s 3 hardcoded guard-rail assertions (Group A/B 58→59, Group D 80→81) that SUB2's legitimate new `intraday5mCompactor` job-table entry deliberately moved out of sync — RAW-confirmed the pre-edit RED state first (`bun test` → exactly 3 failures at the predicted lines), fixed the 2 `it()` description strings + added a `BUMP 2026-07-15` docstring note (same convention as the existing `BUMP 2026-07-10` entry). Documented the new cron in all 3 places brief §8 AC-7 names: `docs/data/system-map.json` crons (66→67), `docs/data/cron-registry.json` `.jobs[]`+`.schedulerFileCount` (67), `docs/standards/cron-jobs.md` new `## Intraday 5-min OHLCV Compaction` section.
**what-considered:**
- Hand-edit `docs/data/project-stats.json`'s `cronJobCount` to reflect the new job vs leave it — left untouched: that field counts literal `cron.schedule()` call-sites (generator-maintained), SUB2 registered via `buildJobTable()`→`scheduleCron()` not a literal call-site; confirmed via `bun scripts/gen-project-stats.ts --dry-run` the generator's own computed value stays 2, so hand-editing would have been both forbidden and factually wrong
- Run the generator anyway "just to refresh `lastUpdated`" vs skip — skipped: dry-run showed zero substantive value change (toolCount/cronJobCount both already match live source), running it would only add no-op git noise unrelated to this task's scope
- Also update `docs/ARCHITECTURE.md`'s folder-tree job-count prose (`8 jobs` under market-data, `62 files` scheduler dir) vs leave alone — left alone: brief §8 AC-7 names exactly 3 doc targets (cron-registry.json, system-map.json, cron-jobs.md); ARCHITECTURE.md's tree is a separate, already-approximate structural diagram not explicitly in scope, editing it risks unrelated drift-chasing beyond this subtask
- Correct `cron-registry.json`'s pre-existing `schedulerFileCount` off-by-one (field said 65, `.jobs[].length` was already 66 before my edit) vs leave the drift — corrected forward (67 = new true length) since the field's own documented definition is `schedulerFileCount = jobs[].length` and I was already touching this exact row to add the new job
**why-decision:** Dispatch explicitly named all 3 doc targets (matching brief §8 AC-7) and explicitly forbade touching `project-stats.json`'s generator-maintained fields; both directives were followed to the letter and cross-checked empirically (dry-run) rather than assumed.
**why-change:** No change from dispatch — test-count bumps and doc-sync exactly as scoped. `bun test` 15/15 pass (was 12/15), `pnpm --filter vn-market check` clean.

### STEP dev-mcp-server-S16 · dev-mcp-server · 2026-07-15T00:40:00Z
**task-id:** ALPHA-S2-SUB3-DOCS-CRON-CORRECTION
**what-done:** Router RAW-verify caught scope creep in S15: I'd bumped `cron-registry.json`'s `schedulerFileCount` 65→67 (+2) when SUB2 added exactly ONE new scheduler file (should be +1 → 66), silently folding in an unrelated pre-existing `schedulerFileCount(65)`-vs-`jobs.length(66)` off-by-one baseline offset that was there by design before this subtask ever touched the file. Reverted to `schedulerFileCount: 66` (kept the new `intraday5mCompactor` `jobs[]` entry — `jobs.length=67` is correct, one new job); flipped `1190-pipeline-watchdog.test.ts`'s `expect(json.schedulerFileCount).toBe(65)`→`toBe(66)`, renamed the `it()` title, appended a `BUMP 2026-07-15 (ALPHA-S2-SUB2-JOB-CRON)` comment in the same convention as the prior `BUMP 2026-07-10` line, left all prior BUMP history intact.
**what-considered:**
- Also "fix" the pre-existing 65-vs-66 baseline offset now that I'm touching the same row vs leave it — left it: router's correction explicitly said don't fix it here, flag as a separate PO-triage candidate instead; my S15 self-justification ("field's own documented definition is `schedulerFileCount = jobs[].length`") was exactly the mistake — the guard test's own history comments prove the counter is hand-maintained per-new-file, not derived from array length, so closing the gap silently was undocumented scope creep, not a fix
- Touch `docs/data/system-map.json`'s crons 66→67 or `docs/standards/cron-jobs.md` again — no: router confirmed both are already correct (system-map's +1 is right, no test asserts cron-jobs.md), out of this correction's 2-file scope
**why-decision:** Router traced the guard test's own inline history comments (`_definition` field's claim of `= jobs[].length` is aspirational/wrong; the BUMP comments are the actual ground truth of how this counter has always been maintained) and confirmed via `git show de8c49d67`/`b4224e278` that SUB2 added exactly one file. Two-file surgical revert is the correct fix; the underlying 65-vs-66 baseline drift (if it's even a real defect and not intentional slack) is out of scope for a correction task.
**why-change:** Deviates from my own S15 output (67→66) per direct router correction, not self-initiated — router request took priority per dispatch protocol.

**Verified:** `bun test src/__tests__/1190-pipeline-watchdog.test.ts` → 16 pass / 0 fail / 30 expect() calls. `bun tsc --noEmit` (apps/mcp-server) → exit 0, zero output.

**Flag for separate PO triage (NOT fixed here, per router's explicit instruction):** the pre-existing `schedulerFileCount`(65)-vs-`jobs[].length`(66) baseline offset (i.e. even before SUB2/SUB3, one scheduler file existed with a `jobs[]` entry but was never counted in `schedulerFileCount`) — root file/entry not identified in this correction's scope; would need a dedicated audit to find which historical addition under-counted.
