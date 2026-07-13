# dev-mcp-server -- Notebook

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

## 2026-07-12 — TASK_2004 (SUBTASK-DAILY-FF-5, ARCH-DAILY-FOREIGN-FLOW-TABLE, Class-B probe migration) → REVIEW

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team cron dispatch, tick 18:37Z; PM handoff `docs/handoffs/TASK_2004-daily-ff-class-b-probes.md`)

Migrated the 4 flagged Class-B freshness/health probes `FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL` → `FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL` (direct table read, NOT the `daily_ohlcv_with_flow` compat view — its COALESCE fallback would mask a stale/dead foreign-flow writer): `freshnessSlaMonitorJob.ts`, `slaStatusTools.ts`, `vpsProxyWatchdogJob.ts` (readLatestForeignFlowTimestamp), `vpsHealthPoller.ts` (DEFAULT_FRESHNESS_CONFIGS vn-foreign-flow entry). Closes SUBTASK-DAILY-FF-5, the last read-site subtask — foreign-flow health signal is now fully decoupled from OHLCV pipeline health.

Unplanned but necessary (same class as TASK_2003): 2 static-source contract-lock tests + 4 seed-based behavior tests (across `FIX-PDF-VOLUME-SBV-TABLE.test.ts`, `FIX-HEALTH-MONITOR.test.ts`, `FIX-VPS-HEALTH-FRESHN.test.ts`) asserted/seeded the legacy `daily_ohlcv` contract — updated in place. Added new `TASK-2004-daily-ff-class-b-probes.test.ts` (9 tests) proving the decoupling contract for all 4 probes: fresh `daily_foreign_flow` reads fresh even with daily_ohlcv absent/empty; stale/empty `daily_foreign_flow` reads stale/unreachable even with a fresh daily_ohlcv row.

grep confirms zero remaining `daily_ohlcv WHERE foreign_buy_vol` production sites outside tests/writer/DDL — all 5 ARCH-DAILY-FOREIGN-FLOW-TABLE subtasks now complete.

Verified: new suite 9/9; 3-file regression-fallout set 46/46; foreign-flow file-glob sweep 729/729, 0 fail. `bun tsc --noEmit` clean. Server boot + `/health` OK, toolCount=183 unchanged. Bounded single full-suite run stalled at ~20.3k lines before reaching these files (documented tail-crash zone) — targeted sweeps above are the authoritative evidence.

Commit: this agent's own direct commit (RUN-SOLO, explicit-path staging — 4 prod files + 4 test files (3 fixed + 1 new) + 2 doc files + journal). Dispatcher owns the board row. **Redeploy rides the pending user/ops-gated mcp-server rebuild** (same one as TASK_2000-2003) — this change is additive to the now-lifted DEPLOY-HOLD.

Zone health: tsc clean, 9 new + 46 regression-fallout + 729 foreign-flow-sweep pass/0 fail, toolCount=183 unchanged, 4/4 Class-B probes decoupled from OHLCV | HEALTHY.

## 2026-07-12 — TASK_2005 (SUBTASK-DAILY-FF-6, ARCH-DAILY-FOREIGN-FLOW-TABLE, integration test / R-1 gate) → FINDING, not DONE

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch, task=TASK_2005; PM handoff `docs/handoffs/TASK_2005-daily-ff-integration-test.md`)

Added `apps/mcp-server/src/__tests__/daily-foreign-flow-integration.test.ts` (5 cases) composing `writeForeignFlowToOhlcv()` + the `daily_ohlcv_with_flow` view exactly the way a live Class-A tool would. RAW: 3 pass / 2 fail. Write-side R-1 (permanent data loss) is confirmed CLOSED (TASK_2002). Read-side R-1 is NOT closed: `daily_ohlcv_with_flow` is `FROM daily_ohlcv o LEFT JOIN daily_foreign_flow f` — anchored on `daily_ohlcv`, so a foreign-flow-only row (no matching OHLCV row) is never returned by the view, regardless of COALESCE. All 5 already-migrated Class-A read sites (TASK_2003) still cannot surface a ticker's foreign-flow value before its OHLCV bar lands — the literal "chưa trả số từng mã" symptom, reproduced end-to-end. This gap was already flagged (but not escalated) inside TASK_2000's own schema test comment ("documenting the known anchoring behavior") — this task turns it into a live, RED, end-to-end proof instead of a passing note.

Per task's explicit contingency clause ("if the read path does not return the value, STOP — report, do not paper over"): did NOT modify the view or any production source (additive test-only task, out of scope for a schema fix); did NOT flip TASK_2005 to done. tsc clean (0 errors). Targeted regression (10 related foreign-flow files incl. daily-foreign-flow-{table,schema,backfill}.test.ts) 69/69 pass, 0 fail — no collateral breakage. No full-suite log artifact was available to grep; targeted subset is the proportionate substitute per the additive-change exception.

Commit: d15eedbec (2 files: new test + decision-journal entry, explicit-path). Dispatcher/PM should open a new FIX task for the view's join-anchor direction (e.g. bidirectional/UNION-based join or Class-A sites querying `daily_foreign_flow` directly with a LEFT-anchor fallback to `daily_ohlcv`) before this sprint can claim R-1 fully eliminated end-to-end.

Zone health: tsc clean, new-test 3/3 valid-pass + 2/2 correctly-RED (real gap, not flaky), targeted regression 69/69, toolCount unchanged (no prod file touched) | FINDING — read-side R-1 gap open, routed as FIX candidate.

## 2026-07-13 — ALPHA-S1-CANDLE-RECOVER (wave-1, P0) → FALSE-POSITIVE FINDING, not DONE

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch, wave-1 pick-first; architect design `docs/handoffs/ALPHA-S1-architect-design.md`)

Claimed ready→in_progress (WIP=1) then probed the LIVE named-volume DB (`docker exec mcp-server-1 bun:sqlite readonly` on `/app/data/market.db`, not host `data/`) before touching any code, per fail-loud Anti-Hallucination Rule. Finding: **2026-07-11 is a real Saturday** — `isVnTradingDay('2026-07-11')` (the app's own domain calendar, `vnTradingCalendar.ts`) returns `is_trading_day:false, session_status:"weekend"`; 07-12 is Sunday, same. `daily_ohlcv` is gapless across every real weekday 2026-06-16..2026-07-10 (908-1012 rows/day; 07-10=985 rows, VNINDEX close=1828.34 present); weekend 07-11/07-12 correctly show 0 rows universe-wide (not a gap); today 2026-07-13 (real Monday, `is_trading_day:true`) already has 443 rows and is live-updating right now (`market_prices_history` ticks flowing 02:00Z-04:48Z, VNINDEX row `updated_at`=04:48:10Z). git log confirms the referenced Docker incident (`95822aa90`) is real but fired Sat evening 14:18Z — after that non-trading day's would-be close, no market-data causal link. **There is no missing Friday candle to recover** — 07-10 was never lost, and 07-11 cannot legitimately have a bar without fabricating data (forbidden per `no fake data` standing rule). Root cause of the original alarm looks like a calendar/weekend-blind staleness check upstream of this zone (matches the known `mkt-blind` FP-class lesson family) — not identified to an exact file, out of `apps/mcp-server/` in any case.

Per this task's own STOP-condition framing ("do NOT push past these, report back") applied to a third case beyond the two enumerated (deploy-required / pending-timer): an invalid premise. Did NOT implement the architect's `recoverMissingOhlcvSession.ts`/CLI wrapper (would be unexercised scope-creep for a non-existent bug) and did NOT insert a `ohlcv_backfill_queue` row (would be a pointless real VPS-relay fetch — correctly finds zero Saturday trades, burns retry_count budget already at 5 from an earlier 2026-07-11T07:32Z cycle, id=646). Zero code touched, zero tests run (nothing to test).

Also found in passing (out of scope, flagged only): ticker `DAG` has `MAX(date)=2026-04-28`, stale since April — unrelated real gap, separate from this row.

Board: appended finding note to the in_progress row (not moved to review — no code for QA to verify) + `.head` retargeted to `next_agent:"po"` for reconciliation. Recommend PO close as verified non-issue, and re-examine whether `ALPHA-S1-STARTUP-CANDLE-GUARD`'s `depends:[ALPHA-S1-CANDLE-RECOVER]` still makes sense (guard's own calendar-aware design is independently sound and doesn't need this incident to be real).

Zone health: no code changed, toolCount/tsc unaffected | FINDING — false-positive, routed to PO for board reconciliation.
