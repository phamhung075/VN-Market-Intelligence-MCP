# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Sprint 189 — UPCOMING (planned 2026-04-19)

**Goal:** DB health restoration + VPS geo-routing completion. Production `market.db` has 7 critical anomalies: `tracked_indicators` grows unbounded (~800 rows/month/symbol), test rows leaked into production tables, Reuters/TradingEconomics/GSO all geo-blocked from France and dead, SBV rates returning zero, `push-foreign-flow` sending malformed payloads, kinhdich over-sampling at 89 readings/stock/day. All geo-blocked sources must route through Vinahost VPS Vietnam via the push pattern. This sprint makes the market intelligence pipeline complete and clean.

**Scope:**

| Task | Area | Type |
|------|------|------|
| 1489-1490 | `tracked_indicators` dedup + test contamination purge | Code fix + DB cleanup |
| 1491-1492 | `push-foreign-flow` parse error fix (VPS script + endpoint) | VPS + endpoint fix |
| 1493-1494 | Reuters RSS via VPS (`fetch-reuters.sh` + push endpoint) | New VPS service |
| 1495-1496 | TradingEconomics 13 indicators via VPS Playwright (`fetch-tradingeconomics.sh` + push endpoint) | New VPS service |
| 1497-1498 | SBV rates fetcher fix — non-zero values + 4 new schema columns | Fetcher fix + schema |
| 1499-1500 | GSO macro data via VPS (`fetch-gso.sh` + push endpoint + 9 new macro columns) | New VPS service |
| 1501-1502 | Kinhdich cron throttle — market hours 09:00-15:00 VN only, max 1/stock/15min | Scheduler fix |

**OUT:** OHLCV foreign flow columns (Sprint 190), cascade outcome tracking (Sprint 191), Sprint 188 Yahoo Extended scope.

**Success metrics:**
- `tracked_indicators`: 0 duplicate rows per symbol per day after fix; 0 source='test' rows
- `system_logs`: 0 rows with message='only this appears' or message='error message'
- Reuters: items appear in `rag_analyses` within 15min of VPS push
- TradingEconomics: all 13 indicators update daily from VPS
- SBV: `overnight_rate` and `refinancing_rate` non-zero after next fetch cycle
- GSO: `macro_indicators` row has `fetched_at` within 24h after next VPS run
- Kinhdich: `kinhdich_readings` peak <= 24 rows/stock/day
- All 14 TDD tests GREEN. `bun tsc --noEmit` clean. baseline: 5629 pass.

---

## Sprint 188 — ACTIVE (2026-04-19)

**Goal:** Expand Yahoo Finance fetcher from 3 symbols to 12 — add VIX, S&P500, Shanghai Composite, Hang Seng, DXY, CNY/VND, copper, silver, JPY/VND. These feed the causal chain macro layer (global -> country -> sector -> stock). Without them, the cascade engine is blind to major global risk-off signals (VIX spike, DXY surge) that regularly precede VN market selloffs.

**Scope:**
- IN: `src/infrastructure/fetchers/yahooFinance.ts` — extend `SYMBOLS` map (9 new symbols), extend `CommoditySnapshot` type (9 new fields), extend `storeCommoditySnapshot` to persist new columns
- IN: `src/infrastructure/db/schema.ts` — `commodity_prices` + `commodity_prices_history`: add 9 new columns (DEFAULT 0, backward compat, no migration needed)
- IN: `src/application/usecases/runImpactChain.ts` — extend `MacroContext` with new fields; pass vix, sp500, dxy, hangSeng to cascade engine for global risk-off scoring
- IN: `src/__tests__/1487-yahoo-finance-extended.test.ts` (NEW) — TDD RED first: (a) 12 symbols fetched concurrently; (b) each new field in CommoditySnapshot; (c) storeCommoditySnapshot writes all 12 columns; (d) partial failure (3 symbols null) stores rest; (e) existing 3-field consumers backward compat
- OUT: VPS changes, sbv_rates fix, foreign flow columns, macro_indicators backfill, cascade rule outcome tracking

**Success metric:** `commodity_prices` row has all 12 columns populated after one fetch cycle. Cascade engine receives VIX + DXY context. TDD GREEN. `bun tsc --noEmit` clean. baseline: 5629 pass.

---

## Sprint 186 — COMPLETE (2026-04-19)

**Goal:** Fix remaining 28 full-suite test failures caused by `047-bctc-orchestrator.test.ts`'s `mock.module("telegram.js")` permanently replacing the real module in Bun's process-wide registry. Sprint 185 fixed the return type (CoreSendResult → boolean), but Bun's `mock.module` is process-global — even with correct return type, `034`, `1254`, and `1163` still receive the stub version of `sendTelegramMarket` that ignores `fetchFn` and always returns `true`. Additionally, `vnstock-3statement.test.ts` gets 8 failures because `schema.js` is cached from a prior file's import with a different DB connection, so `storeBalanceSheet`/`getLatestCashFlow` operate on a stale DB handle.

**Scope:**
- IN: `src/__tests__/034-telegram-notifier.test.ts:2` — add `mock.module("../infrastructure/notifiers/telegram.js", ...)` override at file top with real passthrough implementation so `047`'s stub is evicted; OR restructure each `it()` to use top-level imported functions that bypass Bun's registry
- IN: `src/__tests__/1254-morning-briefing-no-dup-insert.test.ts:86` — same mock.module override so AC-2 receives the real `sendTelegramMarket` that inserts into `market_messages`
- IN: `src/__tests__/1163-market-message-review.test.ts` — same mock.module override for failing AC-3/AC-4/AC-11 cases
- IN: `src/__tests__/vnstock-3statement.test.ts:20` — fix DB isolation so `storeBalanceSheet`/`storeCashFlow` use the same in-memory connection that `initDatabase()` initializes (likely need to pass `db` explicitly or call `getDb()` fresh after `initDatabase()`)
- OUT: production code changes, schema changes, VPS proxies, alert pipeline

**Success metric:** Full suite fail count drops from 28 to ≤5 (intentional OCR only). `034`, `1254`, `1163`, `vnstock-3statement` all GREEN in full suite. `bun tsc --noEmit` clean. baseline: 5599 pass.

---

## Sprint 185 — COMPLETE (2026-04-19)

**Goal:** Fix `047-bctc-orchestrator.test.ts` mock.module returning wrong return type for `sendTelegramMarket`/`sendTelegramWork`/`sendTelegramBug`. The mock returns `Promise.resolve({ ok: true, messageId: 0 })` (CoreSendResult object) but the real functions return `Promise<boolean>`. In full suite, Bun's module cache is poisoned: any test file that imports `telegram.js` after `047` loads gets the mock version, causing `034-telegram-notifier` (~15 fails) and `1163-market-message-review` (~5 fails) to receive an object instead of `true`/`false`. Also add missing `Bun.env["DB_PATH"] = ":memory:";` as line 1 of `047`.

**Scope:**
- IN: `src/__tests__/047-bctc-orchestrator.test.ts:1` — add `Bun.env["DB_PATH"] = ":memory:";` as new line 1
- IN: `src/__tests__/047-bctc-orchestrator.test.ts:17-19` — change `Promise.resolve({ ok: true, messageId: 0 })` to `Promise.resolve(true)` for all three send function mocks
- OUT: production code changes, schema changes, VPS proxies, alert pipeline

**Success metric:** Full suite fail count drops from 29 to ≤10 (targeting elimination of the 034 + 1163 cluster). `bun tsc --noEmit` clean. baseline: 5598 pass.

---

## Sprint 184 — COMPLETE (2026-04-19)

**Goal:** Fix 2 test-isolation regressions causing 30 full-suite failures. (1) `1480-db-isolation-batch5.test.ts` has inverted condition: `if (firstLine.includes('Bun.env["DB_PATH"]'))` flags correctly-isolated files as offenders — should check `process.env["DB_PATH"]` (the banned pattern). Sprint 181+182 added `Bun.env["DB_PATH"]` to 109+ files as the correct pattern, so this assertion now incorrectly finds 126 offenders. (2) `1163-market-message-review.test.ts` has no `Bun.env["DB_PATH"] = ":memory:";` at line 1 — causes DB contamination in full suite that cascades to 034, 1254, vnstock-3statement failures.

**Scope:**
- IN: `src/__tests__/1480-db-isolation-batch5.test.ts:13` — change `'Bun.env["DB_PATH"]'` to `'process.env["DB_PATH"]'` in the `firstLine.includes(...)` check (fixes inverted assertion)
- IN: `src/__tests__/1163-market-message-review.test.ts:1` — insert `Bun.env["DB_PATH"] = ":memory:";` as new line 1 (fixes full-suite DB contamination)
- OUT: production code changes, schema changes, VPS proxies, alert pipeline

**Success metric:** Full suite fail count drops from 30 to ≤1 (intentional OCR only). `1480` test: 0 offenders. `034`, `1163`, `1254`, `vnstock-3statement` all GREEN in full suite. `bun tsc --noEmit` clean. baseline: 5597 pass.

---

## Sprint 183 — COMPLETE (2026-04-19)

**Goal:** Fix 8 pre-existing test failures caused by `spawnQaResponder()` using `getDb()` internally instead of the injected test DB, and 1 test assertion drift in `1073`. APPROVED, merged commit e36daa8.

---

## Sprint 179 — COMPLETE (2026-04-19)

---

## Sprint 180 — COMPLETE (2026-04-19)

---

## Sprint 182 — COMPLETE (2026-04-19)

**Goal:** fix(test-isolation): batch6 — bulk Bun.env DB_PATH fix in 50 beforeEach/body test files. APPROVED, merged commit 7c4df5f.

---

## Sprint 181 — COMPLETE (2026-04-19)

**Goal:** Fix production DB contamination by test runs. 109 test files use `process.env["DB_PATH"] = ":memory:"` as line 1 — the wrong namespace in Bun. When tests run, `schema.ts` reads `Bun.env["DB_PATH"]` (not `process.env`), so these files inadvertently open the production `data/market.db`. Confirmed production impact: system_logs show test strings ("simulated...failure for AC-3", "check timestamp", "warning message") appearing at 2026-04-18 15:30–15:39 UTC alongside real production job output — dev test runs contaminated the production DB during sprint work. This also explains the 38 full-suite test failures (race condition when test file imports DB modules before `setup.ts` preload takes effect in that worker). Fix: bulk replace `process.env["DB_PATH"]` → `Bun.env["DB_PATH"]` in all 109 affected test files.

**Scope:**
- IN: 109 test files — replace `process.env["DB_PATH"] = ":memory:";` at line 1 with `Bun.env["DB_PATH"] = ":memory:";` (list: `034-telegram-notifier.test.ts`, `vnstock-3statement.test.ts`, `1254-morning-briefing-no-dup-insert.test.ts`, `102-job-news-poll.test.ts`, `103-job-market-scan.test.ts`, `105-job-evening-summary.test.ts`, `106-intelligence-cycle.test.ts`, `1070-position-ledger.test.ts`, and 101 more files matching `for f in src/__tests__/*.test.ts; do head -1 "$f" | grep -q 'process.env\["DB_PATH"\]' && echo "$f"; done`)
- IN: `src/__tests__/1480-db-isolation-batch5.test.ts` (NEW) — TDD RED first: assert all 109 target files have `Bun.env["DB_PATH"] = ":memory:";` as firstExecutableLine
- OUT: production code changes, schema changes, VPS proxies, alert pipeline

**Success metric:** Full suite: fail count drops from 38 to ≤5 (only intentional OCR timeout remains). Production DB no longer receives test rows. TDD test GREEN. `bun tsc --noEmit` clean. baseline: 5587 pass.

---

**Goal:** Fix 38 pre-existing full-suite test failures caused by `Bun.env["DB_PATH"]` not being set at line 1 in the affected test files. These tests pass individually but fail in full suite because `schema.ts` reads `Bun.env["DB_PATH"]` (not `process.env`) — so tests that only set `process.env["DB_PATH"]` inadvertently open the production `data/market.db`. With 38 silent failures, real regressions are masked. Fix: add `Bun.env["DB_PATH"] = ":memory:"` before any imports in the ~10 highest-impact failing test files.

**Scope:**
- IN: `src/__tests__/1192-evening-summary-empty-fallback.test.ts:1` — add `Bun.env["DB_PATH"] = ":memory:";` at line 1
- IN: `src/__tests__/125-test-e2e-briefing.test.ts:1` — add `Bun.env["DB_PATH"] = ":memory:";` at line 1
- IN: `src/__tests__/1348-france-summary-cron-window.test.ts:1` — add `Bun.env["DB_PATH"] = ":memory:";` at line 1
- IN: `src/__tests__/235-telegram-send-merge.test.ts:1` — add `Bun.env["DB_PATH"] = ":memory:";` at line 1
- IN: `src/__tests__/126-macro-cascade.test.ts:1` — add `Bun.env["DB_PATH"] = ":memory:";` at line 1
- IN: `src/__tests__/1074-ask-queue-check-job.test.ts:1` — verify or add `Bun.env["DB_PATH"] = ":memory:";` at line 1
- IN: TDD test `src/__tests__/1479-db-isolation-batch4.test.ts` (NEW) — assert `Bun.env["DB_PATH"]` is `":memory:"` in each of the fixed files (import-time env check); assert full suite run does not grow test failure count beyond pre-existing 38→N
- OUT: production code changes, schema changes, VPS proxies, alert pipeline

**Success metric:** Full suite: fail count drops from 38 to ≤28. TDD test GREEN. `bun tsc --noEmit` clean. baseline: 5581 pass.

## Sprint 178 — COMPLETE (2026-04-19)

**Goal:** Fix remaining unaccented Vietnamese in 4 MCP tool files (batch 3). Agents reading tool descriptions for `log_fix`, `get_recent_fixes`, `read_telegram_reports`, `process_telegram_report`, `claim_telegram_report`, `get_supply_chain_exposure`, and ticker intelligence see garbled text instead of proper Vietnamese. Fixes all user-visible and agent-visible diacritics in this batch.

**Scope:**
- IN: `src/interface/mcp/tools/changelogTools.ts:69-70,75,80,85,90,94,99,104-105` — fix 10 unaccented strings in `log_fix` + `get_recent_fixes` tool descriptions and param describes
- IN: `src/interface/mcp/tools/telegramReportTools.ts:89,96,104,110-111,180-181,261-263,269,274` — fix 8 unaccented strings in `read_telegram_reports`, `process_telegram_report`, `claim_telegram_report` tool descriptions and param describes
- IN: `src/interface/mcp/tools/supplyChainTools.ts:318` — fix 1 error-path string: "Loi: Khong the lay du lieu chuoi cung ung" → "Lỗi: Không thể lấy dữ liệu chuỗi cung ứng. Vui lòng thử lại."
- IN: `src/interface/mcp/tools/tickerIntelligenceTools.ts:264` — fix 1 error-path string: "(loi phan tich BCTC)" → "(lỗi phân tích BCTC)"
- IN: `src/__tests__/1473-tool-diacritics-batch3.test.ts` (NEW) — TDD RED first: assertions for all ~20 fixed strings
- OUT: logic changes, schema changes, VPS proxies, alert pipeline

**Success metric:** All ~20 broken strings replaced with properly accented Vietnamese. TDD test GREEN. `bun tsc --noEmit` clean. baseline: 5589 pass.

## Sprint 176 — COMPLETE (2026-04-19)

**Goal:** Fix BUG channel flood from SQLite corruption. When `syncVnstockData` hits "database disk image is malformed", it logs once per stock (30 tickers = 30 WARNs per 60s cycle). Add an early-bail guard: detect malformed error in the per-stock catch block, emit ONE consolidated warn, and break the loop. Prevents 30-per-cycle BUG reports that obscure real actionable signals.

**Scope:**
- IN: `src/application/usecases/syncVnstockData.ts:191` — check if err message includes "malformed"; if so `logger.warn("[vnstock-sync] DB corruption detected — halting sync cycle", { error })` then `break`; else log per-stock warn as before
- IN: `src/__tests__/1466-sync-db-corruption-bail.test.ts` (NEW) — TDD RED: (a) malformed error on first stock → loop breaks, only 1 warn total, remaining stocks skipped; (b) non-malformed error → per-stock warn, loop continues; (c) mixed: malformed on 3rd of 5 → 2 normal warns + 1 malformed warn + break
- OUT: vnstockStore changes, schema changes, checkpoint logic, alert pipeline

**Success metric:** On DB corruption, `syncVnstockData` emits exactly 1 warn and stops. TDD GREEN. `bun tsc --noEmit` clean. baseline: 5565 pass.

---

## Sprint 175 — COMPLETE (2026-04-19)

**Goal:** Add a daily OHLCV staleness check cron that fires at 08:15 UTC Mon-Fri (30 min after market close = 15:15 VN). If `daily_ohlcv` has zero rows for the current VN date for more than 50% of watchlist tickers, send a WORK channel alert listing the missing tickers. This closes the VPS price-push silent-failure gap: when `vn-price-fetch.service` stops mid-day, the startup probe misses it (only fires at boot), and the evening summary silently shows `watchlistMovers: []` with no operator notification.

**Scope:**
- IN: `src/scheduler/ohlcvStalenessCheckJob.ts` (NEW, ~50 lines) — `runOhlcvStalenessCheck(deps?)` reads `daily_ohlcv WHERE code IN watchlist AND date = VN_today`, counts missing tickers, sends WORK alert when threshold exceeded (>50% of watchlist)
- IN: `src/scheduler/jobs.ts:138` — add `ohlcvStalenessCheck: Bun.env.CRON_OHLCV_STALENESS_CHECK ?? '15 8 * * 1-5'` to CRONS map
- IN: `src/scheduler/jobs.ts:631` — add `cron.schedule(CRONS.ohlcvStalenessCheck, ..., { timezone: 'UTC' })` after ohlcvDailyAggregator block
- IN: `src/__tests__/1465-ohlcv-staleness-check.test.ts` — TDD RED first: (a) all watchlist tickers present today → no alert; (b) >50% missing → alert sent with ticker list; (c) exactly 50% missing → no alert (edge); (d) empty watchlist → no alert; (e) VN date computation correct
- OUT: ohlcvStartupProbe.ts (unchanged — startup probe kept as complementary check), schema changes, VPS proxies, alert pipeline, market channel

**Success metric:** `ohlcvStalenessCheck` cron registered in `cron_job_runs`. WORK alert fires when VPS stops pushing for current VN trading day. TDD test GREEN. `bun tsc --noEmit` clean. baseline: 5560 pass.

---

## Sprint 172 — COMPLETE (2026-04-19)

**Goal:** Fix stale `market_prices` rows leaking wrong `change_pct` into evening summary `watchlistMovers`. `assembleEveningSummary.ts` joins `market_prices` without a freshness guard — VCB's stale row (88,000 from 2026-03-27, `change_pct` from that day) passes the `|change_pct| >= 1.0` filter and appears as the only mover. All other tickers correctly have no `market_prices` row, so they fall back to the OHLCV CTE — but they too may have computed_pct below threshold on a normal day. Sprint 167 fixed this pattern in `assembleBriefing.ts` (lines 727, 730, 922, 926); Sprint 168 fixed it in `franceSummaryJob.ts`. This sprint applies the same fix to `assembleEveningSummary.ts`.

**Scope:**
- IN: `src/application/usecases/assembleEveningSummary.ts:422` — add `AND mp.updated_at >= datetime('now', '-3 days')` to `LEFT JOIN market_prices mp ON mp.code = w.code` (OHLCV path)
- IN: `src/application/usecases/assembleEveningSummary.ts:433` — same freshness guard (fallback path, no OHLCV table)
- IN: TDD test `src/__tests__/1462-evening-mover-freshness.test.ts` — assert stale `market_prices` row (>3 days) is ignored; fresh row (today) is used; OHLCV computed_pct used when market_prices is stale
- OUT: `assembleBriefing.ts`, `franceSummaryJob.ts`, alert pipeline, VPS proxies, schema changes

**Success metric:** Stale `market_prices` row does not appear in evening `watchlistMovers`. OHLCV-computed movers surface correctly when `market_prices` is stale. TDD test GREEN. `bun tsc --noEmit` clean. baseline: 5546 pass.

---

## Sprint 171 — COMPLETE (2026-04-19)

**Goal:** Fix WAL unbounded growth causing SQLite "database disk image is malformed" errors. Current WAL = 438MB. Root cause: (1) daily `walCheckpoint` cron uses `RESTART` mode — when any reader is active at 20:00 UTC, `RESTART` cannot truncate the WAL file on disk, leaving it at full size. (2) Job not wrapped in `recordJobRun` — zero observability into checkpoint success/failure. Fix: change to `TRUNCATE` mode (same as shutdown hook), add `recordJobRun` wrapper.

**Scope:**
- IN: `src/infrastructure/db/checkpoint.ts:44` — `PRAGMA wal_checkpoint(RESTART)` → `PRAGMA wal_checkpoint(TRUNCATE)`. Update JSDoc lines 8,27,29 to reflect TRUNCATE.
- IN: `src/scheduler/jobs.ts:322-324` — wrap `runWalCheckpoint()` in `recordJobRun(getDb(), 'walCheckpointJob', ...)` so job appears in `cron_job_runs`
- IN: `src/__tests__/1447-checkpoint-restart-mode.test.ts:5,58,62,63` — update test title/assertions: `TRUNCATE` not `RESTART`, `not.toContain("RESTART")` → `not.toContain("PASSIVE")`
- OUT: `registerShutdownHook()` (already uses TRUNCATE — no change), schema changes, VPS proxies, alert pipeline

**Success metric:** `walCheckpointJob` appears in `cron_job_runs` after next 20:00 UTC run. WAL file shrinks to near-zero after checkpoint. `bun tsc --noEmit` clean. All 5 existing tests in 1447 pass (updated assertions). baseline: 5542 pass.

---

## Sprint 170 — COMPLETE (2026-04-18)

**Goal:** Move `scheduler_locks` DDL from inline `ensureSchedulerLocksTable()` in `schedulerLockStore.ts` to the canonical `schema.ts:initDatabase()`. The janitor flagged this as HIGH severity — schema DDL split across two locations creates maintenance risk: the `scheduler_locks` table is missing from `schema.ts`'s table inventory comment, making it invisible during audits. Fix makes `ensureSchedulerLocksTable` a no-op (DDL now runs at startup via `initDatabase`).

**Scope:**
- IN: `src/infrastructure/db/schema.ts:1407` — add `scheduler_locks` DDL (3 columns: job_name PK, acquired_at, released_at) inside the final `db.exec(...)` block before closing backtick
- IN: `src/infrastructure/db/schedulerLockStore.ts:38-46` — replace body of `ensureSchedulerLocksTable` with a no-op comment (function kept for API compat with `weeklyPortfolioReportJob.ts:359`)
- IN: TDD test `src/__tests__/1457-scheduler-locks-schema.test.ts` — assert `scheduler_locks` table exists after `initDatabase()` alone (no call to `ensureSchedulerLocksTable`); assert `ensureSchedulerLocksTable` is a no-op (doesn't fail, doesn't create duplicate)
- OUT: `weeklyPortfolioReportJob.ts` (caller unchanged), alert pipeline, VPS proxies, other schema changes

**Success metric:** `initDatabase()` creates `scheduler_locks` without needing `ensureSchedulerLocksTable`. TDD test GREEN. `bun tsc --noEmit` clean. baseline: 5539 pass.

---

## Sprint 169 — COMPLETE (2026-04-18)

**Goal:** Fix `watchlistMovers: []` in every evening summary — `assembleEveningSummary.ts` uses `WHERE t.date = date('now')` (UTC date) in the `ohlcv_change` CTE. VN market closes at 15:00 VN = 08:00 UTC; the evening summary fires at 15:30 UTC = 22:30 VN. By then `date('now')` = today UTC, but `daily_ohlcv` only has rows for the last VN **trading** day (e.g. April 17 on a Saturday). The CTE returns 0 rows → no movers computed → `watchlistMovers: []` every evening/weekend.

**Scope:**
- IN: `src/application/usecases/assembleEveningSummary.ts:415` — change `WHERE t.date = date('now')` to `WHERE t.date = (SELECT MAX(date) FROM daily_ohlcv)` so the CTE always uses the latest available trading day
- IN: TDD test `src/__tests__/1456-evening-watchlist-movers-ohlcv-date.test.ts` — seed `daily_ohlcv` with rows dated yesterday (not today), assert `watchlistMovers` is non-empty when |changePct| >= 1.0; also assert today-only seed returns same result (MAX(date) = today works too)
- OUT: `market_prices`, alert pipeline, franceSummaryJob, schema changes, VPS proxies

**Success metric:** Evening summary produces non-empty `watchlistMovers` when `daily_ohlcv` has data for the latest VN trading day (even if not UTC-today). TDD test GREEN. `bun tsc --noEmit` clean. baseline: 5536 pass.

---

## Sprint 167 — COMPLETE (2026-04-18)

**Goal:** Fix stale `market_prices` rows leaking into morning briefing — `assembleBriefing.ts` queries `market_prices` without a freshness guard, so a stale VCB row (88,000 from 2026-03-27) takes priority over the correct `daily_ohlcv` fallback (59,500). Audit's 3-day delete and the briefing query are inconsistent — audit deletes `updated_at < 3 days` but if audit missed a cycle, the row persists with a wrong price shown to the user.

**Scope:**
- IN: `assembleBriefing.ts:727` — add `AND mp.updated_at >= datetime('now', '-3 days')` to watchlist price subquery
- IN: `assembleBriefing.ts:730` — same freshness guard on `change_pct` subquery
- IN: `assembleBriefing.ts:922` — same freshness guard on portfolio P&L price map first SELECT
- IN: `assembleBriefing.ts:926` — update NOT IN subquery to also filter by freshness
- IN: TDD test `src/__tests__/1452-market-prices-freshness.test.ts` — assert stale market_prices row (>3 days) is ignored in favor of daily_ohlcv; fresh row (today) is used
- OUT: dataAuditJob changes, franceSummaryJob, schema changes, VPS proxies

**Success metric:** Morning briefing uses `daily_ohlcv` fallback when `market_prices` row is >3 days old. TDD test GREEN. `bun tsc --noEmit` clean.

---

## Sprint 151 — COMPLETE (2026-04-18)

**Goal:** Add "BCTC sắp đến" (upcoming filing deadlines) section to morning briefing — show watchlist stocks with Q1 2026 deadlines within 14 days that have not yet filed. User is in BCTC season right now (Q1 deadline = Apr 30 standard, May 14 banking). Without this, morning briefing is silent on imminent filings even when 12/30 watchlist stocks are days away from statutory deadline.

**Scope:**
- IN: `assembleBriefing.ts` — add `upcomingDeadlines: BctcDeadlineRow[]` field to `DailyBriefing`; populate via `getCurrentDeadline()` + `classifyFilingStatus()` for each watchlist stock; include only `SAP_DEN` and `QUA_HAN` status rows
- IN: `morningBriefingJob.ts` — add formatter section "BCTC sắp đến:" listing code + deadline + days remaining; omit section when empty
- IN: TDD test `src/__tests__/1422-morning-briefing-bctc-deadlines.test.ts` — RED first: (a) SAP_DEN stocks appear in `upcomingDeadlines`, (b) QUA_HAN stocks appear, (c) DA_NOP stocks excluded, (d) formatted message contains deadline section, (e) section omitted when all filed
- OUT: `earningsCalendarTools.ts` changes, alert pipeline, VPS proxies, schema changes

**Success metric:** Morning briefing message contains "BCTC sắp đến" section with correct stock codes when any watchlist stock has unfiled deadline within 14 days. TDD test GREEN. `bun tsc --noEmit` clean.

---

## Sprint 150 — COMPLETE (2026-04-18)

**Goal:** Fix ohlcvDailyAggregatorJob health gap + alertDigestTools diacritics.
**Scope:**
- IN: `jobs.ts` — wrap ohlcvDailyAggregator cron with `recordJobRun(db, 'ohlcv-daily-aggregator', ...)`
- IN: `alertDigestTools.ts` — fix 3 unaccented strings: "[Telegram: da gui thanh cong]" → "[Telegram: đã gửi thành công]", "(Telegram chua duoc cau hinh)" → "(Telegram chưa được cấu hình)"
- IN: TDD test `src/__tests__/1421-ohlcv-health-and-digest-diacritics.test.ts` — 6 assertions, RED → GREEN
- OUT: Schema changes, VPS proxies, alert routing, new features

**Status:** COMPLETE. Task 1421 merged. 6/6 TDD assertions GREEN. `bun tsc --noEmit` clean.

---

## Sprint 144 — COMPLETE (2026-04-18)

**Goal:** Fix unaccented Vietnamese text in MCP tool responses — `kinhDichTools.ts`, `technicalIndicatorTools.ts`, and `supplyChainTools.ts`. Sprints 135-143 fixed alert/digest/conviction pipelines but left these three tool files with broken diacritics visible to the user on every MCP tool call.

**Scope:**
- IN: `kinhDichTools.ts:1032-1040` — fix "THUAN LOI cho giao dich — xu huong tich cuc", "BAT LOI cho giao dich — can than trong", "TRUNG TINH — can xem them tin hieu khac", "Nhan dinh giao dich" → proper accented Vietnamese
- IN: `technicalIndicatorTools.ts:150,155,156,164` — fix "can 50 nen", "sap xep hon hop", "Xu huong", "can toi thieu 15 nen" → proper accented Vietnamese
- IN: `supplyChainTools.ts:106,115,117,119` — fix "Tin hieu co phieu: Khong co...", "TONG KET: Co tin hieu QUAN TRONG...", "Phat hien tin hieu nhe", "Chuoi cung ung on dinh..." → proper accented Vietnamese
- IN: TDD test `src/__tests__/1408-tool-diacritics.test.ts` — RED first, assert fixed strings appear in output
- OUT: kinhDichReading.ts lookup keys ("BAT LOI" score key stays), alert pipeline, VPS proxies, schema changes

**Success metric:** All three files output properly accented Vietnamese. TDD test GREEN. `bun tsc --noEmit` clean. 5055+ pass, 0 fail.

---

## Sprint 143 — COMPLETE (2026-04-18)

**Goal:** Reclassify HUT real_estate → construction in sectorPeers + DB migration.
**Status:** COMPLETE. Tasks 1406-1407 merged. 5055 pass, 0 fail.

---

## Sprint 129 — COMPLETE (2026-04-17)

**Goal:** Fix 17 pre-existing test failures from stale franceSummaryJob fixtures + schedulerFileCount drift.
**Status:** COMPLETE. Tasks 1372+1373 merged. Full suite: 4998 pass, 1 fail (intentional OCR), 20 skip.

---

## Sprint 130 — COMPLETE (2026-04-17)

**Goal:** Fix `taSummary: []` in every evening report by shifting `ohlcvDailyAggregatorJob` cron from 16:00 UTC to 15:00 UTC (30 min before evening summary at 15:30 UTC).
**Status:** COMPLETE. Tasks 1374+1375 merged. `CRONS.ohlcvDailyAggregator` default = `'0 15 * * 1-5'`. 2026-04-17 report confirmed: taSummary has 31 tickers.

---

## Sprint 139 — COMPLETE (2026-04-17)

**Goal:** Fix unaccented Vietnamese text in `calibrationReportJob` MARKET channel output.
**Status:** COMPLETE. Tasks 1392+1393 merged. 5035 pass, 0 fail, 21 skip.

---

## Sprint 142 — COMPLETE (2026-04-18)

**Goal:** Fix two HIGH alert-quality bugs: (1) volume spike multiplier shows identical 5.9× across all tickers; (2) conviction scorer outputs unaccented Vietnamese labels.
**Status:** COMPLETE. Tasks 1402-1405 merged. 5055 pass, 0 fail.

---

## Sprint 141 — COMPLETE

**Goal:** Fix test DB isolation — `setup.ts` sets `process.env["DB_PATH"]` but `schema.ts` reads `Bun.env["DB_PATH"]` (different namespaces in Bun). Every full test run leaks fixture rows into production `data/market.db`. Phantom rows (epoch 1970, 400+) pollute BUG channel and PO audit loop.

**Scope:**
- IN: `src/__tests__/setup.ts:12` — change `process.env["DB_PATH"]` to `Bun.env["DB_PATH"]`
- IN: Purge existing phantom rows (`DELETE FROM telegram_reports WHERE created_at < 1000000` via migration or one-time script)
- IN: TDD test `src/__tests__/1396-db-isolation.test.ts` — assert `Bun.env["DB_PATH"]` is `":memory:"` during test run, assert production DB path never opened
- OUT: Changes to `schema.ts`, alert pipeline, VPS proxies, any other scheduler

**Success metric:** No phantom rows accumulate in `data/market.db` after `bun test`. `bun tsc --noEmit` clean. TDD test passes. BUG channel no longer shows 1970-epoch reports.

---

## Sprint 140 — COMPLETE (2026-04-17)

**Goal:** Fix unaccented Vietnamese text in `assembleAlertDigest` MARKET weekday digest.
**Status:** COMPLETE. Tasks 1394+1395 merged. 5061 pass, 0 fail, 21 skip.

---

## Sprint 138 — COMPLETE (2026-04-17)

**Goal:** Fix `weeklyPortfolioReportJob` — silent skip when no positions + proper Vietnamese diacritics throughout.
**Status:** COMPLETE. Tasks 1389+1390 merged + 1391 regression fix. 5030 pass, 0 fail, 21 skip.

---

## Sprint 131 — COMPLETE (2026-04-17)

**Goal:** Fix pre-existing test failure in `1192-evening-summary-empty-fallback.test.ts` line 91 (`calls.length` expected 1, got 0). Root cause: `runEveningSummary` calls `alreadySentToday(getDb())` using the production DB singleton, which ignores `DB_PATH=":memory:"` test isolation. When the production `market_messages` table already has an `evening-summary` row for today (the real summary fired at 15:30 UTC), the dedup guard silently skips the second test. Fix: accept an optional `db` parameter in `runEveningSummary` for the dedup check, defaulting to `getDb()` in production.

**Scope:**
- IN: `src/scheduler/eveningSummaryJob.ts` — add optional `db?: Database` to `runEveningSummary` signature; use it in `alreadySentToday` call
- IN: `src/__tests__/1192-evening-summary-empty-fallback.test.ts` — pass an in-memory DB (with `market_messages` table) as `db` param so the dedup check resolves against isolated state
- OUT: Changes to assembleEveningSummary, other scheduler jobs, alert pipeline, VPS proxies

**Success metric:** `bun test src/__tests__/1192-evening-summary-empty-fallback.test.ts` — both tests pass. `bun tsc --noEmit` clean. Full suite regression: net 0 new failures (2 pre-existing → 1 pre-existing OCR only).

**Status:** ACTIVE — tasks 1376+1377

---

## Sprint 111 — COMPLETE (2026-04-16)

**Goal:** Fix 2 pre-existing test suite failures — (1) test 297 UNIQUE constraint violation caused by missing DB_PATH isolation at line 1, and (2) test 296 OCR e2e timeout that blocks full suite completion.

**Status:** COMPLETE 2026-04-16. Tasks 1337+1338 merged. Full suite: 4910 pass, 20 skip, 1 fail (intentional OCR timeout at 30s).

---

## Sprint 110 — COMPLETE (2026-04-16)

**Goal:** Fix `topStories: []` in every evening report. Production evening reports show `topStories: []` and `newsCount: 0` even when the VPS is pushing news every 15 minutes. The user never sees the top news-driven analyses at market close. Root cause is in the push-news → `pollNews` → `rag_analyses` pipeline — either the INSERT is not firing, the `created_at` timestamp mismatches the midnight-VN boundary query, or title-dedup is over-filtering all items.

**Status:** COMPLETE 2026-04-16. Tasks 1335+1336 merged. VN_SOURCE_IDS extended to 10 entries, createdAt guard added to tryInsertEntry. 4/4 TDD cases pass.

---

## Sprint 109 — COMPLETE (2026-04-16)

**Goal:** Housekeeping sprint — archive stale task detail blocks + fix sprint status entries. Task 1334 acceptance criteria met: stale blocks already removed from TASKS.md, Sprint 108 header shows COMPLETE, archive contains all Sprint 105-108 detail blocks.

**Status:** COMPLETE 2026-04-16. Task 1334 Done.

---

## Sprint 108 — COMPLETE (2026-04-17)

**Goal:** Fix 2 pre-existing test failures in `1227-source-health-empty-result.test.ts`. Root cause: `pollNews` records health under fetcher key `"reuters"` but the test asserts on `"Reuters RSS"` — two different buckets in the singleton `globalSourceTracker`. Fix: add a source key → display name map in `pollNews` so health is recorded under the human-readable name.

**Status:** COMPLETE 2026-04-17. Tasks 1332+1333 merged.

---

## Sprint 107 — COMPLETE (2026-04-17)

**Goal:** Fix `taSummary: []` in every evening report. TA signals (RSI, MA20) have been computed since sprint 094 but the evening summary always returns empty because `defaultComputeTa` reads from `market_prices_history` (intraday ticks — only 1 day of data) instead of `daily_ohlcv` (proper daily OHLCV — 10+ days growing). Switch the data source to `daily_ohlcv.close` so TA signals surface as soon as 15 trading days of OHLCV exist.

**Scope:**
- IN: `src/application/usecases/assembleBriefing.ts` — rewrite `defaultComputeTa()` to query `daily_ohlcv` (`SELECT date, close FROM daily_ohlcv WHERE code = ? ORDER BY date ASC LIMIT 60`) instead of averaging `market_prices_history` ticks by UTC day
- IN: TDD test `src/__tests__/1330-ta-daily-ohlcv.test.ts` — verify `defaultComputeTa` returns non-null signal when `daily_ohlcv` has 15+ rows, returns null when < 15 rows, and that RSI/MA20 compute correctly from close prices
- OUT: Changes to alert pipeline, VPS proxies, BCTC tools, other scheduler jobs

**Success metric:** With 15+ rows in `daily_ohlcv` for a ticker, `defaultComputeTa()` returns a non-null `TaSignal`. Evening report `taSummary` field is non-empty for watchlist tickers that have 15+ days of OHLCV. `bun tsc --noEmit` clean. TDD tests pass.

**Status:** COMPLETE 2026-04-17. Tasks 1330+1331 merged.

---

## Sprint 106 — COMPLETE (2026-04-17)

**Goal:** Fix 10 persistent test timeouts in `278-cycle-peer-sync.test.ts`. All 10 tests call `runIntelligenceCycle` without `DB_PATH=":memory:"` and without injecting `getRecentAlertHistoryFn`, causing the cycle's internal cooldown `getDb()` calls to hit the production SQLite file. Result: all 10 tests hit the 5s limit — 50 seconds wasted per full suite run.

**Scope:**
- IN: `src/__tests__/278-cycle-peer-sync.test.ts` — add `process.env["DB_PATH"] = ":memory:"` at line 1 (before all imports)
- IN: Add `getRecentAlertHistoryFn: async () => []` to `buildBaseDeps()` so all 10 `runIntelligenceCycle` call-sites are covered automatically
- IN: Verify all 10 tests pass and total file runtime is under 10s
- OUT: Changes to production code, other test files, intelligence cycle logic

**Success metric:** `bun test ./src/__tests__/278-cycle-peer-sync.test.ts` — all 10 tests pass in under 10s total. `bun tsc --noEmit` clean. Full suite regression: 0 new failures vs Sprint 105 baseline (4885 pass).

**Status:** COMPLETE 2026-04-17. Task 1329 merged.

---

## Sprint 105 — COMPLETE (2026-04-17)

**Goal:** Fix 4 persistent test timeouts in `137-fix-alert-pipeline.test.ts` (Step E suite). These tests call `runIntelligenceCycle` without setting `DB_PATH=":memory:"` at file top, causing the cycle's internal `getDb()` calls to hit the production SQLite file. Result: 4 tests hit the 30s limit every full suite run, masking real regressions.

**Scope:**
- IN: `src/__tests__/137-fix-alert-pipeline.test.ts` — add `process.env["DB_PATH"] = ":memory:"` at line 1 (before all imports) so all dynamic `import("../infrastructure/db/schema.js")` calls inside `runIntelligenceCycle` resolve to the in-memory DB
- IN: Inject `getRecentAlertHistoryFn: async () => []` in all 4 Step E test fixtures to prevent the fallthrough to `getCooldownDb()` real DB path
- IN: Verify all 4 Step E tests complete well under 5s after fix
- OUT: Changes to production code, other test files, intelligence cycle logic

**Success metric:** `bun test ./src/__tests__/137-fix-alert-pipeline.test.ts` — all tests pass in under 10s total. `bun tsc --noEmit` clean. Full suite regression: 0 new failures.

**Status:** COMPLETE 2026-04-17. Task 1328 merged.

---

## Sprint 104 — COMPLETE (2026-04-16)

**Goal:** Fix misleading macro alert label — "cao bất thường" (abnormally high) is shown even when the value is BELOW the moving average (negative z-score). This is a user-facing messaging bug: the user reads "high" but the market condition is actually "low".

**Scope:**
- IN: `macroThresholds.ts` — make `LEVEL_VI` direction-aware: "cao bất thường" for above-mean deviations, "thấp bất thường" for below-mean deviations
- IN: Update `classifyDeviation()` summary to use directional label
- IN: TDD test covering: above-mean `high` → "cao bất thường", below-mean `high` → "thấp bất thường", above-mean `extreme` → "cực cao", below-mean `extreme` → "cực thấp"
- OUT: Alert pipeline changes, VPS proxies, BCTC tools

**Success metric:** Alert message for USD/VND below mean shows "thấp bất thường" not "cao bất thường". `bun tsc --noEmit` clean. TDD tests pass.

**Status:** COMPLETE 2026-04-16. Tasks 1326+1327 merged.

---

## Sprint 103 — COMPLETE (2026-04-16)

**Status:** COMPLETE 2026-04-16. Tasks 1324+1325 merged. push-news handler now wires all 9 VPS sources dynamically. 10/10 tests pass.

---

## Sprint 100 — COMPLETE (2026-04-15)

**Goal:** Diagnose and fix `predictionSignals: []` in evening reports — the field has been empty across every daily report for weeks, meaning users never see prediction-based signals at close even when the prediction pipeline is running.

**Scope:**
- IN: Investigate why `assembleEveningSummary` returns `predictionSignals: []` — check DB query, prediction_signals table population, and evidence fragment flow
- IN: Fix root cause (query gap, missing table population, or schema mismatch)
- IN: TDD test covering `predictionSignals` populated correctly in evening summary
- OUT: Changes to alert pipeline, TA scan jobs, BCTC tools, VPS proxies

**Success metric:** Evening report `predictionSignals` field contains at least the currently active prediction claims when they exist. `bun tsc --noEmit` clean. Test passes.

**Status:** COMPLETE 2026-04-15. Tasks 1318+1319 merged. All 10 test cases pass.

---

## Sprint 101 — COMPLETE (2026-04-15)
**Status:** COMPLETE 2026-04-15. Tasks 1320+1321 merged. DDD boundary: 0 infra imports in domain/. All 4 tests pass.

---

## Sprint 102 — COMPLETE (2026-04-15)

**Goal:** Add a `newsCount` diagnostic field to the evening summary report — the `topStories: []` gap in production is invisible to the user and hard to debug. Surfacing how many raw news items were ingested since midnight gives immediate observability into whether the VPS news push is working and whether the intelligence cycle is writing analyses.

**Scope:**
- IN: Add `newsCount: number` field to `EveningSummary` type (count of `rag_analyses` rows since midnight Vietnam)
- IN: Populate `newsCount` in `assembleEveningSummary.ts` — single COUNT query alongside existing ragRows query
- IN: Include `newsCount` in the Telegram evening message: show "(N tin tức hôm nay)" beside the top stories section header; if `newsCount === 0` show "Không có tin tức hôm nay" instead of empty list
- IN: TDD test (4 cases): newsCount populated correctly, zero case shows fallback label, positive case shows count, `bun tsc --noEmit` clean
- OUT: Intelligence cycle changes, VPS proxy changes, alert pipeline

**Success metric:** Evening Telegram message shows news count. User can tell at a glance if the news pipeline is active. `bun tsc --noEmit` clean. 4+ TDD cases pass.

---

## Sprint 099 — COMPLETE

**Goal:** Rewrite `franceSummaryJob` — the France morning digest sent to MARKET channel was using a legacy format. New version sends top 3 movers, top 3 alerts, TA signal count in Vietnamese. Silent skip when all sources empty.

**Scope:**
- IN: Task 1316 — feat(france-summary): rewrite `franceSummaryJob.ts`
- IN: Task 1317 — TDD test `1316-france-summary-rewrite.test.ts`
- OUT: Alert Commander, evening summary, VPS proxies

**Success metric:** `franceSummaryJob` sends correctly formatted Vietnamese digest at 07:00 UTC M-F. Silent skip when no data. 12/12 TDD cases pass.

---

## Sprint 098 — COMPLETE

**Goal:** Deliver unnotified TA alerts (RSI overbought/oversold, BB breakout) from `alerts` table to Telegram MARKET channel intraday — previously TA alerts were never forwarded because `readUnnotifiedAlerts` only picks up `severity IN ('high','critical')`.

**Scope:**
- IN: Task 1314 — feat(ta-notifier): `taAlertNotifierJob.ts`
- IN: Task 1315 — TDD test `1314-ta-alert-notifier.test.ts`
- OUT: Alert Commander, scan jobs, schema changes

**Success metric:** TA alerts reach user within 15 minutes of trigger during market hours. 23/23 TDD cases pass.

---

## Sprint 097 — COMPLETE

**Goal:** Add TA close-of-day signals (RSI/MA20) to evening summary — user currently receives no TA context at market close.

**Scope:**
- IN: Task 1312 — `taSummary: TaSignal[]` added to `EveningSummary` + Telegram formatter
- IN: Task 1313 — TDD test

**Success metric:** Evening Telegram message includes "TA tín hiệu đóng cửa" section when non-neutral signals exist.

---

## Sprint History

| Sprint | Goal summary | Status |
|--------|-------------|--------|
| 110 | fix(news-pipeline): push-news → rag_analyses insert gap — topStories always empty (1335, 1336) | ACTIVE |
| 109 | chore(tasks): archive stale task detail blocks + fix sprint status entries (1334) | COMPLETE 2026-04-16 |
| 108 | fix(source-health): pollNews SOURCE_DISPLAY_NAMES — eliminate 2 test-1227 failures (1332, 1333) | COMPLETE 2026-04-17 |
| 107 | fix(ta): defaultComputeTa reads daily_ohlcv — TA signals in evening summary (1330, 1331) | COMPLETE 2026-04-17 |
| 106 | fix(test-timeout): 278-cycle-peer-sync DB isolation — 10 tests pass (1329) | COMPLETE 2026-04-17 |
| 105 | fix(test-timeout): 137 Step E test isolation — 4 timeout tests fixed (1328) | COMPLETE 2026-04-17 |
| 104 | fix(macro-alert): direction-aware labels in classifyDeviation (1326, 1327) | COMPLETE 2026-04-16 |
| 103 | fix(push-news): extend SourceFetchers + wire 9 VPS sources (1324, 1325) | COMPLETE 2026-04-16 |
| 102 | feat(evening-summary): newsCount diagnostic field + Telegram formatter (1322, 1323) | COMPLETE 2026-04-15 |
| 101 | refactor(ddd): shared-types.ts — zero infra imports in domain/ (1320, 1321) | COMPLETE 2026-04-15 |
| 100 | fix(prediction): predictionSignals always empty in evening summary (1318, 1319) | COMPLETE 2026-04-15 |
| 099 | feat(france-summary): rewrite franceSummaryJob — Vietnamese digest | COMPLETE 2026-04-15 |
| 098 | feat(ta-notifier): deliver TA alerts to Telegram market channel | COMPLETE 2026-04-15 |
| 097 | feat(evening-summary): add taSummary to EveningSummary + Telegram | COMPLETE 2026-04-15 |
| 096 | fix(ta-alert): cooldown query wall-clock vs nowFn (1311) | COMPLETE 2026-04-15 |
| 095 | feat(ta-alert): bbAlertScanJob BB breakout (1309, 1310) | COMPLETE 2026-04-15 |
| 094 | feat(ta-alert): taAlertScanJob RSI overbought/oversold (1307, 1308) | COMPLETE 2026-04-15 |
| 093 | fix(test-drift): tool count + scheduler lock contract (1305, 1306) | COMPLETE 2026-04-15 |
| 092 | feat(briefing): TA signals in morning briefing (1304) | COMPLETE 2026-04-15 |
| 091 | fix(cascade) + BCTC backlog (1207, 1218, 1248) | COMPLETE 2026-04-15 |
| 090 | feat(ta): technical indicators domain service + MCP handler (1302, 1303) | COMPLETE 2026-04-15 |
| 089 | fix(sector-dedup) + fix(test-isolation) (1300, 1301) | COMPLETE 2026-04-15 |
| 088 | fix(test-drift): scheduler count, VPS string, Step E behavior (1297-1299) | COMPLETE 2026-04-15 |
| 087 | fix(ssc) + fix(prediction) schema (1295, 1296) | COMPLETE 2026-04-15 |
| 086 | fix(schema) + fix(kinh-dich) + fix(freshness) (1291-1293) | COMPLETE 2026-04-15 |
| 085 | fix(cascade) + feat(scheduler) franceSummaryJob (1289, 1290) | COMPLETE |
| 084 | fix(cascade/pollNews/schema) (1286-1288) | COMPLETE |
| 083 | Code janitor scan + schema.ts env-access fix | COMPLETE |
| 082 | Config drift fix — alert cooldown config-driven + sector dedup | COMPLETE 2026-04-15 |
| 081 | Domain bug batch — cascade/classification, NER fixes | COMPLETE 2026-04-15 |
| 080 | Domain bug dedup — ticker intelligence, macro cascade gaps | COMPLETE 2026-04-14 |
