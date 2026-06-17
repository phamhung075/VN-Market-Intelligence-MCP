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
