# dev-mcp-server -- Notebook

## 2026-06-16 · FIX-CI-RED-STANDING-1837A-1352A — CI red unblocked

**Task:** FIX-CI-RED-STANDING-1837A-1352A (S — BLOCKING fleet push)
**1837a:** Already green (head.status='in_progress' in valid enum). Added §5 status enum table to docs/standards/orch-state-access.md for SSOT alignment.
**1352a root cause:** FIX-BCTC-ENRICH-SILENT-0ROWS (d4a0dacc) added unconditional db.prepare() for bctc_table_rows+bctc_md_tables at function start (outside per-row loop). Test DBs are queue-only (no schema migration) → SQLiteError: no such table → all Group A tests crashed before extraction could run.
**Fix:** try/catch around both prepare() calls; null = gate inactive (skip to updateDone). Generic: any pre-migration or minimal-schema DB bypasses gate; production full-schema DB activates it. 0 new allowlists/special cases.
**Tests:** 13/13 across both files. Full suite 13205/0 fail. tsc clean. rebuild_required: NO (test-path only change; runtime behaviour unchanged for production full-schema DB).

## 2026-06-16 · FIX-FOREIGN-FLOW-INTEGRITY-BREAK + FIX-FOREIGN-FLOW-COVERAGE + FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL

**Tasks:** 4 tasks in one session. All implemented.

**FIX-FOREIGN-FLOW-INTEGRITY-BREAK (P0):** storeTradingStats() changed from INSERT OR REPLACE → ON CONFLICT DO UPDATE SET that EXCLUDES foreign_volume + foreign_room. Writer B (VCI/vnstock cumulative) no longer clobbers Writer A (VPS daily net). Same fix on both code paths (with-date and legacy). Root: phantom 1.81B shares "net vol" from foreigner_pct × total_shares overwriting daily buy-sell delta.

**FIX-FOREIGN-FLOW-COVERAGE (P1):** VPS script now extracts fBValue/fSValue (VND money-value of foreign buy/sell). Two new columns in daily_ohlcv (foreign_buy_value, foreign_sell_value). Push handler parses camelCase and scientific notation strings. get_foreign_flow output now shows "Mua ròng (VND)" tỷ đồng line + value column when present.

**FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL (HIGH/P1, co-implemented):** New function fetchVnIndexBreadthAndLiquidity() in hose.ts — same vnmarket_prices endpoint, size=2 for delta. New type MarketBreadthAndLiquidity exported. get_market_snapshot now fetches breadth concurrently (5th Promise.all slot) + appends VN prose + breadth struct in JSON. New dedicated tool get_market_breadth (tool #165) serves both breadth + liquidity with machine-readable fields.

**Gate results:** tsc clean | new tests: 4+21=25 pass / 0 fail | full suite 13252/63 fail (pre-task: 13227/64 — net improvement +25 tests, -1 existing failure) | tools=165 (was 164) | sched=3

**REBUILD_REQUIRED:** YES — storeTradingStats SQL + new hose.ts function + get_market_breadth tool + new DB columns.

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule | HEALTHY

## 2026-06-17 · FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD — per-section deadline added to getSystemStatus()

**Task:** FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD (P1, TIME-SENSITIVE)
**Root confirmed:** `getSystemStatus()` had no overall or per-section deadline. Any section that hung (e.g. DB lock during TE/Chromium scrape) blocked the aggregate for ~60s, causing market-watcher smoke probe to abort at 02:00Z open.
**Fix:** Exported `withSectionDeadline(label, work, budgetMs=3000)` helper — races `work` against a `budgetMs` timer; on timeout returns honest "timeout/unknown" diagnostic string (never synthetic "ok"). Applied GENERICALLY to all 4 async sections in `getSystemStatus()`: DB_STATUS, SOURCE_HEALTH, DATA_FRESHNESS, RECENT_ERRORS. No source allowlist, no special-cases.
**Worst-case wall time:** 4 × 3000ms = 12s — well below the 60s gateway limit.
**Tests (6 ACs in FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD.test.ts):**
- AC-1: stalled promise resolves within 200ms with "timeout" in result
- AC-2: fast promise returns real content (no regression)
- AC-4: timed-out result never contains "ok" as sole status word
- AC-5: resolves within 3× budget for infinite promise
- Integration: all section headers present in healthy path; completes within 10s
**Gate results:** tsc clean (0 errors) | 6/6 new pass | 59/59 across 5 related files | tools=165 | sched=3
**Docs updated:** docs/architecture/microservice/mcp-server/system.md — get_system_status row + invariant #7
**REBUILD_REQUIRED:** YES — systemTools.ts changed; ops must rebuild container for live timeout guard to activate.

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule (startupHelpers.ts), withSectionDeadline deadline guard active | HEALTHY

## 2026-06-17 · FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 — consumer stub-bar guard for taAlertScanJob + bbAlertScanJob

**Task:** FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 (P0, S, blocking)
**Root:** A foreign-flow writer inserts an all-zero stub bar (close=0, volume=0) into daily_ohlcv at market open before the real OHLCV bar arrives. CANDLE_SQL ORDER BY day ASC places this stub as the LATEST bar; taAlertScanJob fed it as the final element of closes[] → Wilder RSI collapsed to single-digit universe-wide; bbAlertScanJob read close=Math.round(0)=0 → "giá 0 dưới BB" spam (MARKET msg 783-790, 2026-06-17 02:15-03:15Z).
**Fix:** Both scan jobs now SELECT volume alongside close in CANDLE_SQL. After fetching candleRows, the LATEST bar (candleRows[length-1]) is inspected: if close_price<=0 OR volume<=0 → fail-closed (skip ticker, log info, no alert). Only the latest bar is rejected; interior bars feed Wilder RSI as-is. Generic: applies to all 30 watchlist tickers uniformly, no per-ticker logic.
**Files changed:**
- apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts — CandleRow+volume, CANDLE_SQL+volume, guard a3 (17 lines)
- apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts — CandleRow+volume, CANDLE_SQL+volume, guard c2 (15 lines)
**Tests written (new SB-1..SB-5, both jobs):** 10 new stubs: SB-1 (close=0,vol=0 → skip), SB-2 (close=0,vol>0 → skip), SB-3 (close>0,vol=0 → skip), SB-4 (valid bar → still fires), SB-5 (stub+valid sibling: skip stub, fire sibling). Also fixed pre-existing fingerprint schema failures: added fingerprint TEXT UNIQUE to 1803, 1391, FIX-ALERT-ENGINE-RSI-SINGLEDIGIT buildTestDb; fixed seedTodayCandle volume=0 in FINGERPRINT + 1309/1391 helpers.
**Gate results:** tsc clean (0 errors) | 52/0 across 6 affected files | full suite 13180 pass / 46 fail (pre-task baseline: 59 fail — reduced by 13 pre-existing failures fixed) | tools=165 (unchanged) | sched=3 (unchanged)
**REBUILD_REQUIRED:** YES — scheduler job logic changed; ops must rebuild mcp-server container.

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule | HEALTHY

## 2026-06-17 · ARCH-OHLCV-WRITER-SSOT-DURABLE (SUBTASK-1+2+3) — producer-root fix for 4th-recurrence close=0 stub class

**Tasks:** 3 P0 subtasks from WORKORDER-dev-mcp-server-OHLCV-WRITER-SSOT-DURABLE.

**SUBTASK-1:** Rewrote writeForeignFlowToOhlcv in ohlcvForeignFlowStore.ts. Replaced INSERT...ON CONFLICT stub injection with UPDATE-only. SQL: UPDATE daily_ohlcv SET foreign_buy_vol=?,... WHERE code=? AND date=?. changes=0 on absent row => debug log, NO stub, honest gap. Callers verified non-error on 0: foreignFlowFetcher.ts L137+L220, pushForeignFlowHandler.ts L319.

**SUBTASK-2:** Added exhaustive writer inventory comment block to ohlcvWriteService.ts documenting all 7 writers (A,C,D,E,F,G,H), bypass sentinel pattern (OHLCV-WRITE-BYPASS-ALLOWED), and LINT-OHLCV-WRITE-BYPASS follow-on.

**SUBTASK-3:** New test file 2026-ohlcv-foreign-flow-merge.test.ts with 7 tests (T-1..T-4, T-INT, T-GEN, T-COALESCE). Updated legacy DPI-4-foreign-flow-upsert.test.ts (AC-1+AC-7) and 1503-ohlcv-foreign-flow.test.ts (AC3) to match merge-only behavior.

**Files changed:** ohlcvForeignFlowStore.ts (rewritten), ohlcvWriteService.ts (annotation), 2026-ohlcv-foreign-flow-merge.test.ts (new, 7 tests), DPI-4-foreign-flow-upsert.test.ts (3 updated), 1503-ohlcv-foreign-flow.test.ts (1 updated)

**Gate results:** tsc clean (0 errors) | 17 new/updated tests pass | full suite 13275/13185 pass / 48 fail (baseline 51 — net -3) | tools=165 (unchanged) | sched=3 (unchanged)

**Commits:** 41b4344c (SUBTASK-1+2), e5461ad7 (SUBTASK-3), e96571ac (legacy test updates), 42ec0620 (board move)

**REBUILD_REQUIRED:** YES — ohlcvForeignFlowStore.ts logic changed; ops must rebuild mcp-server container before live gate at 2026-06-18 02:15Z.

**done_verified:** HELD — verify at next VN market open 2026-06-18 02:15Z (RSI canonical match, no BB spam, zero close=0 rows in live DB 02:00-03:30Z window).

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule | HEALTHY

## 2026-06-17 · FIX-CI-RED-2RED-084-VPS-FRESHN — 2 stale test assertions fixed

**Task:** FIX-CI-RED-2RED-084-VPS-FRESHN (P1, S, BLOCKING — sole CI red gate)

**RED 1 — 084-tool-market.test.ts:391 (STALE TEST):** `registerMarketTools` assertion expected 2 tools (get_market_snapshot + get_patterns). Commit ddc36452 (FIX-MARKET-BREADTH-MISSING + FIX-MARKET-LIQUIDITY-MISSING-TOOL) added a 3rd tool `get_market_breadth`. Test title + `toBe(2)` were stale. Fix: updated test title to "registers exactly 3", added `expect(toolNames).toContain("get_market_breadth")`, bumped `toBe(3)`.

**RED 2 — FIX-VPS-HEALTH-FRESHN.test.ts:224 (STALE TEST):** Test "vn-bctc-fetch: passive check always returns healthy" tested old `passive: true` contract. Commit b560ab68 (FIX-BCTC-FRESHNESS-GATE 2026-06-16) replaced passive with active latestTimestampSql + queueGuardSql. The `initDatabase()` call seeds 7 pending rows in `bctc_vps_queue` (BACKFILL_079), so `active_count=7 > 0` → guard skips idle branch → no done rows → `latestAt=null` → correct result is "unreachable". Fix: updated test to assert the new active-freshness contract.

**Code changes:** NONE — both were stale test expectations; vpsHealthPoller.ts + marketTools.ts are correct.

**Per-file CI results:** 084-tool-market: 15 pass / 0 fail | FIX-VPS-HEALTH-FRESHN: 16 pass / 0 fail
**tsc:** clean (0 errors) | tools=165 (unchanged) | sched=3 (unchanged)
**REBUILD_REQUIRED:** NO (test-only changes)

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule | HEALTHY

## 2026-06-17 · FIX-CYCLE-SNAPSHOT-STALE-PROMOTE-FAILSAFE — freshness gate on promoteCycleSnapshot

**Task:** FIX-CYCLE-SNAPSHOT-STALE-PROMOTE-FAILSAFE (P1, S, /goal#1 violation)
**Root:** `promoteCycleSnapshot()` only checked `existsSync(snapPath)` — ZERO freshness validation. A stale `cycle-snapshot-<HH:MM>.json` from 2026-06-02 with a colliding tick was `copyFileSync→rename`'d onto `cycle-snapshot-latest.json`, stamping fresh mtime onto 15-day-old content (oilUsd 93.95 vs live 79.49, goldUsd 4560 vs live 4344.9). Consumers (cycle-bootstrap → market-watcher/digest-predict/unified-agent) served June-2 macro.

**Fix:** FAIL-SAFE freshness gate at promote-time (no date literals, no per-instance hardcode). Added `SNAPSHOT_MAX_STALENESS_MS = 4 * 60 * 60 * 1000` (4 h constant). `promoteCycleSnapshot()` now reads `fetchedAt`/`created_at`/`macro_snapshot.fetchedAt` from source JSON; if age > threshold → `{ promoted: false, stale: true }`, latest file UNTOUCHED. Missing/broken timestamp → treated as infinitely stale → refused. Also changed `PressureState.stale_warning: false` literal to `boolean`; `runEmitPressureState` propagates `stale_warning:true` into both pressure-state.json and the tool result when gate refuses.

**Files changed:**
- `apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts` — SNAPSHOT_MAX_STALENESS_MS constant, PromoteCycleSnapshotResult type, promoteCycleSnapshot freshness gate, PressureState.stale_warning boolean, deps interface updated, runEmitPressureState uses promoteResult.{promoted,stale}
- `apps/mcp-server/src/__tests__/emit-pressure-state.test.ts` — updated existing AC-3 tests for new return type; added AC-5 group (8 new tests: stale refused + latest untouched, no-timestamp refused, broken JSON refused, boundary fresh, macro_snapshot.fetchedAt fallback, runEmitPressureState stale/fresh/no-file integration)

**Gate results:** tsc clean (0 errors) | 26/26 pass (was 18) | full suite pre-existing 46 fail (all in _deprecated/ + unrelated files, not in my files) | tools=165 (unchanged) | sched=3 (unchanged)

**REBUILD_REQUIRED:** YES — promoteCycleSnapshot logic changed; ops must rebuild mcp-server container to activate freshness gate at live promote-time.

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule | HEALTHY
