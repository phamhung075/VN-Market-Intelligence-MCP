# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 097 — Active

| ID | Title | Status |
|----|-------|--------|
| 1312 | feat(evening-summary): add taSummary (RSI/MA20 at close) to EveningSummary type + Telegram message | Review |
| 1313 | test(evening-summary): TDD test 1312-evening-summary-ta.test.ts | Review |

---

## Sprint 096 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1311 | fix(ta-alert): cooldown query uses wall-clock now instead of nowFn — taAlertScanJob + bbAlertScanJob | Done |

---

## Sprint 095 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1309 | feat(ta-alert): implement bbAlertScanJob.ts — Bollinger Band breakout alert | Done |
| 1310 | test(ta-alert): TDD test 1309-bb-alert-scan-job.test.ts | Done |

---

## Sprint 094 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1307 | feat(ta-alert): implement taAlertScanJob.ts — RSI overbought/oversold alert | Done |
| 1308 | test(ta-alert): TDD test 1307-ta-alert-scan-job.test.ts | Done |

---

## Sprint 093 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1305 | fix(test-drift): update test 308 tool count assertion 59→60 | Done |
| 1306 | fix(scheduler): align test 1221 DB lock contract — job uses cron_job_runs, test uses scheduler_locks | Done |

---

## Sprint 092 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1304 | feat(briefing): integrate TA signals (RSI/SMA) into morning briefing | Done |

---

## Sprint 091 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1207 | fix(cascade): non-watchlist confidence cap — rebase onto main (062 stale assertion) | Done |
| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Done |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Done |

---

## Sprint 090 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1302 | feat(ta): implement technicalIndicators.ts domain service + TDD test | Done |
| 1303 | feat(ta): implement technicalIndicatorTools.ts MCP handler + registry | Done |

---

## Sprint 089 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1300 | fix(sector-dedup): remove legacy 'pharma' key from mcp.config.json referenceStocks | Done |
| 1301 | fix(test-isolation): eliminate parallel SQLite state contamination in full suite run | Done |

## Sprint 088 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1297 | fix(test-drift): update test 1190 schedulerFileCount assertion 28→29 | Done |
| 1298 | fix(test-drift): update test 313 VPS watchdog alert string Vultr→Vinahost | Done |
| 1299 | fix(test-drift): update test 137 Step E behavior — unconditional since Task 1255 | Done |

## Sprint 087 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1295 | fix(ssc): update test 1025 cases 7+8 to call `listSscDocumentsWithFlag` | Done |
| 1296 | fix(prediction): relax direction+expected_move_pct to optional in evidenceTools.ts | Done |

## Sprint 086 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1291 | fix(schema): systematic initDatabase() audit — add missing columns/tables | Done |
| 1292 | fix(kinh-dich): tickerJitter range drift — function returns 0.10/0.115, test asserts max 0.09 | Done |
| 1293 | fix(freshness): getDataFreshness() format drift — test 185 fails on 'Cu' label | Done |

## Sprint 085 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1289 | fix(cascade): test 062 Task 162 vs Task 1256 contract conflict | Done |
| 1290 | feat(scheduler): implement franceSummaryJob in jobs.ts — fixes test 1139 | Done |

## Sprint 084 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1287 | fix(cascade): R09/R11 rule drift in predictionCascadeMapper | Done |
| 1288 | fix(pollNews): PollNewsResult shape mismatch in test 102 | Done |
| 1286 | fix(schema): add daily_ohlcv table to test DB setup | Done |

---

## Task Details (active tasks only)

### 1312 — feat(evening-summary): add taSummary (RSI/MA20 at close) to EveningSummary type + Telegram message

**Branch:** `task/1312-1313-evening-summary-ta`
**Layer:** application + scheduler
**Status:** Backlog

**Problem:** The evening summary (`assembleEveningSummary`) shows `topAlerts`, `topStories`, `watchlistMovers`, and `predictionSignals` but no TA close-of-day state. The morning briefing (sprint 092) shows RSI and MA20 signals using `TaSignal[]` from `assembleBriefing.ts`. Users need the same context at close to plan overnight positions.

**Solution:**
1. Add `taSummary: TaSignal[]` field to `EveningSummary` interface in `src/application/usecases/assembleEveningSummary.ts`
2. Import `TaSignal` from `assembleBriefing.ts` (already exported)
3. Import `defaultComputeTa` function from `assembleBriefing.ts` OR duplicate the logic inline (the function is already tested via morning briefing tests, so import is preferred — verify it is exported)
4. In `assembleEveningSummary`, after computing `watchlistMovers`, iterate watchlist tickers, call `defaultComputeTa(code, db)` per ticker, collect into `taSummary`
5. In `eveningSummaryJob.ts`, in the Telegram formatter section, append a "TA tín hiệu đóng cửa" block when `taSummary` has at least one non-neutral signal (rsiStatus != "neutral" OR priceVsMa20 != "neutral"). Format per ticker: `"{code}: RSI={rsi14} (quá mua/quá bán)" + MA20 note`
6. Persist the updated `EveningSummary` JSON (taSummary included) to `reports/YYYY-MM-DD-evening.json`

**Check first:** Verify that `defaultComputeTa` is exported from `assembleBriefing.ts`. If not, export it. Do not duplicate.

**Injectable deps (for TDD in task 1313):**
- `computeTaFn?: (code: string, db: Database) => TaSignal | null` — defaults to `defaultComputeTa`

**DDD layer:** `application/usecases` — no `infrastructure/` imports beyond `db/schema`. `scheduler` layer for Telegram formatting — no new DB imports there.

**Files to change:**
- `src/application/usecases/assembleEveningSummary.ts` — add `taSummary` field, `computeTaFn` dep, populate loop
- `src/scheduler/eveningSummaryJob.ts` — add TA section to Telegram formatter

**Acceptance Criteria:**
- `EveningSummary` interface has `taSummary: TaSignal[]`
- `assembleEveningSummary` populates `taSummary` by calling `defaultComputeTa` per watchlist ticker
- Tickers with null RSI (no history) are included with `rsiStatus: "neutral"` and `priceVsMa20: "neutral"` OR skipped — match the morning briefing behavior (check `assembleBriefing.ts` line ~951: only non-neutral are included)
- Evening Telegram message contains "TA tín hiệu đóng cửa" section when at least 1 ticker has non-neutral RSI or MA20
- Evening Telegram message omits the TA section entirely when all tickers are neutral
- `reports/YYYY-MM-DD-evening.json` includes `taSummary` field
- `bun test src/__tests__/1312-evening-summary-ta.test.ts` all pass
- `bun tsc --noEmit` 0 errors
- No changes to morning briefing, taAlertScanJob, bbAlertScanJob, Alert Commander, VPS proxies

---

### 1313 — test(evening-summary): TDD test 1312-evening-summary-ta.test.ts

**Branch:** `task/1312-1313-evening-summary-ta` (same branch as 1312)
**Layer:** test
**Depends on:** 1312 (assembleEveningSummary taSummary implementation)
**Status:** Backlog

**Test cases (minimum):**
1. `taSummary populated from watchlist tickers` — inject 2 watchlist tickers, inject `computeTaFn` returning `{ rsiStatus: "overbought", ... }` for ticker 1 and `{ rsiStatus: "neutral", ... }` for ticker 2, assert `taSummary.length === 2`
2. `taSummary is empty array when watchlist is empty` — 0 tickers, assert `taSummary: []`
3. `taSummary skips ticker when computeTaFn returns null` — inject `computeTaFn` returning null, assert `taSummary.length === 0`
4. `EveningSummary JSON includes taSummary field` — assert persisted JSON file has `taSummary` key
5. `Telegram message includes TA section when at least one non-neutral signal` — inject 1 overbought ticker, assert formatted output contains "TA tín hiệu đóng cửa"
6. `Telegram message omits TA section when all tickers neutral` — inject all neutral signals, assert formatted output does NOT contain "TA tín hiệu đóng cửa"

**Acceptance Criteria:**
- `bun test src/__tests__/1312-evening-summary-ta.test.ts` ≥6 pass / 0 fail
- In-memory SQLite, injectable deps, no real I/O
- `bun tsc --noEmit` 0 errors

---

### 1311 — fix(ta-alert): cooldown query uses wall-clock now instead of nowFn — taAlertScanJob + bbAlertScanJob

**Branch:** `task/1311-ta-alert-cooldown-nowfn`
**Layer:** scheduler
**Status:** Backlog

**Problem:** Both `taAlertScanJob.ts` and `bbAlertScanJob.ts` accept an injectable `nowFn` parameter for test isolation. The `nowFn` is used when building `triggered_at` for the INSERT, but the cooldown check SQL uses hardcoded `datetime('now', '-4 hours')` — wall-clock SQLite function. This means that when tests inject a `nowFn` returning a controlled past/future time, the cooldown query compares the injected `triggered_at` against real clock `now`. If the injected time is far enough from real clock now, the cooldown window is not aligned and the suppression check fails.

**Root cause (both files):**
```ts
const COOLDOWN_SQL = `
  SELECT COUNT(*) AS cnt
    FROM alerts
   WHERE json_extract(signals_json, '$[0].type') = ?
     AND json_extract(affected_actions_json, '$[0].code') = ?
     AND triggered_at >= datetime('now', '-4 hours')   -- ← hardcoded wall-clock
`;
```

The inserted `triggered_at` = `nowFn().toISOString()`. The cooldown check uses `datetime('now', '-4 hours')`. If `nowFn()` differs from real now (e.g. test injects T+30min in the future, or T-30min in the past), the cutoff comparison can fail silently.

**Fix:** Compute the cooldown cutoff from `nowFn()` rather than from SQLite `now`. Change the COOLDOWN_SQL to use a parameter `?` for the cutoff timestamp, and pass `new Date(nowFn().getTime() - 4 * 3_600_000).toISOString()` as the third bind parameter.

**Files to change:**
- `src/scheduler/taAlertScanJob.ts` — change COOLDOWN_SQL third bind + call site
- `src/scheduler/bbAlertScanJob.ts` — same change

**Acceptance Criteria**
- `bun test src/__tests__/1307-ta-alert-scan-job.test.ts` passes all 9 tests (currently 2 fail: AC-5 cooldown)
- `bun test src/__tests__/1309-bb-alert-scan-job.test.ts` passes all 10 tests (currently 1 fail: AC-6 cooldown)
- `bun tsc --noEmit` 0 errors
- No changes to tests, no new files, no changes to schema, Alert Commander, or other jobs
- Cooldown still suppresses correctly in production (uses `nowFn()` default = `new Date()` = wall clock)

---

### 1309 — feat(ta-alert): implement bbAlertScanJob.ts — Bollinger Band breakout alert

**Branch:** `task/1309-1310-bb-alert-scan-job`
**Layer:** scheduler
**Depends on:** 1302 (computeAllIndicators domain service, merged)
**Status:** Backlog

**Problem:** The TA domain service computes Bollinger Bands (BB20) for every watchlist ticker. The morning briefing and RSI alert scan do not use BB data. BB upper-band breakouts signal momentum (institutional buying pressure); BB lower-band breakouts signal panic selling. Users currently miss these intraday entry/exit signals.

**Solution:** Create `src/scheduler/bbAlertScanJob.ts` — a new scheduler job that:
1. Runs every 15 minutes during VN market hours (09:00-15:30 GMT+7 = 02:00-08:30 UTC) via a cron entry in `jobs.ts`
2. Iterates each watchlist ticker (reads from `watchlist` table)
3. Fetches candles (same SQL as `taAlertScanJob` — last 60 days from `market_prices_history`)
4. Calls `computeAllIndicators(candles)` — the same pure domain function
5. Extracts `bb20` and the latest close price (`candles[candles.length - 1].close`)
6. If `close > bb20.upper` → writes alert `type="ta_bb_breakout_up"`, severity `"MEDIUM"`, message e.g. `"VCB: giá 88000 vượt BB trên 86500 — bứt phá tăng"`
7. If `close < bb20.lower` → writes `type="ta_bb_breakout_down"`, severity `"MEDIUM"`, message e.g. `"HPG: giá 22000 dưới BB dưới 23100 — bứt phá giảm"`
8. Cooldown: skip if same (ticker, alert_type) fired within last 4 hours (same pattern as `taAlertScanJob`)
9. Returns `{ scanned: N, fired: M }` for logging
10. Registered in `jobs.ts` as `*/15 2-8 * * 1-5` with job name `bbAlertScanJob`

**Alert table insert** (same schema as taAlertScanJob):
- `id` = `crypto.randomUUID()`
- `triggered_at` = `new Date().toISOString()`
- `severity` = `"warning"`
- `signals_json` = JSON array with `type`, `actionCode`, `message`, `confidence: 0.65`, `detectedAt`
- `affected_actions_json` = `[{ code }]`
- `analysis_ids_json` = NULL
- `message` = Vietnamese string as above
- `read` = 0
- `user_note` = NULL

**Close price extraction:** use `candles[candles.length - 1]?.close ?? null` — if `candles` is empty or `bb20` is null, skip silently.

**DDD layer:** `scheduler` — may import from `domain/` and `infrastructure/`. Must NOT import from `application/` or `interface/`. Must NOT import `sendTelegram`.

**Injectable deps for TDD:**
- `db?: Database` — defaults to `getDb()`
- `computeFn?: (candles: DailyCandle[]) => TechnicalIndicatorResult` — defaults to `computeAllIndicators`
- `nowFn?: () => Date` — defaults to `() => new Date()`

**Acceptance Criteria**
- `src/scheduler/bbAlertScanJob.ts` created
- `src/__tests__/1309-bb-alert-scan-job.test.ts` passes with 0 failures (TDD in task 1310)
- Alert fires when close > bb20.upper (type `ta_bb_breakout_up`)
- Alert fires when close < bb20.lower (type `ta_bb_breakout_down`)
- No alert fires when price is inside BB band
- No alert fires when bb20 is null (insufficient history)
- No alert fires when candles array is empty
- Cooldown: second scan within 4h for same ticker+type produces 0 additional alerts
- Cooldown does not suppress after 4h (second scan 5h later fires again)
- Job registered in `jobs.ts` with cron `*/15 2-8 * * 1-5` and job name `bbAlertScanJob`
- `cron-registry.json` updated with new job entry
- `docs/data/project-stats.json` schedulerFileCount updated to 31
- `docs/data/cron-registry.json` schedulerFileCount updated to 31
- `bun tsc --noEmit` 0 errors
- No changes to Alert Commander, taAlertScanJob, morning briefing, cascade pipeline, or VPS proxies

---

### 1310 — test(ta-alert): TDD test 1309-bb-alert-scan-job.test.ts

**Branch:** `task/1309-1310-bb-alert-scan-job` (same branch as 1309)
**Layer:** test
**Depends on:** 1309 (bbAlertScanJob implementation)
**Status:** Backlog

**Test cases (minimum):**
1. `fires ta_bb_breakout_up when close > bb20.upper` — inject `computeFn` returning `{ bb20: { upper: 86000, mid: 84000, lower: 82000 }, ... }` with latest close 87000, assert 1 alert row `alert_type = "ta_bb_breakout_up"` (via `json_extract(signals_json,'$[0].type')`)
2. `fires ta_bb_breakout_down when close < bb20.lower` — latest close 81000, assert `ta_bb_breakout_down`
3. `fires no alert when price is inside BB band` — close 84000 (between 82000 and 86000), assert 0 alert rows
4. `fires no alert when bb20 is null` — inject `computeFn` returning `{ bb20: null, ... }`, assert 0 alert rows
5. `fires no alert when candles is empty` — inject empty candles array, assert 0 alert rows
6. `cooldown suppresses second fire within 4 hours` — first scan inserts alert, second scan 30min later inserts 0
7. `cooldown does not suppress after 4 hours` — first scan inserts, second scan 5h later inserts 1 more
8. `scans all watchlist tickers` — inject 3 tickers, 2 breakout_up, assert `fired = 2, scanned = 3`
9. `returns { scanned: 0, fired: 0 } when watchlist is empty`

**Acceptance Criteria**
- `bun test ./src/__tests__/1309-bb-alert-scan-job.test.ts` shows ≥9 pass / 0 fail
- In-memory SQLite (`new Database(":memory:")`), injectable deps, no real I/O
- Test creates `alerts` and `watchlist` tables in the in-memory DB before each test
- `bun tsc --noEmit` 0 errors

---

### 1307 — feat(ta-alert): implement taAlertScanJob.ts — RSI overbought/oversold alert

**Branch:** `task/1307-1308-ta-alert-scan-job`
**Layer:** scheduler
**Depends on:** 1302 (computeAllIndicators domain service, merged)
**Status:** Backlog

**Problem:** The TA domain service (sprint 090) produces RSI values. The morning briefing (sprint 092) shows RSI snapshots once per day. There is no intraday alert when a watchlist stock crosses RSI 70 (overbought) or RSI 30 (oversold). Users miss actionable trading signals between morning briefings.

**Solution:** Create `src/scheduler/taAlertScanJob.ts` — a new scheduler job that:
1. Runs every 15 minutes during VN market hours (09:00-15:30 GMT+7 = 02:00-08:30 UTC) via a cron entry in `jobs.ts`
2. Iterates each watchlist ticker (reads from `watchlist` table)
3. Calls `computeAllIndicators(db, ticker)` — the same function used by `get_technical_indicators` MCP tool
4. If `rsi14 > 70` → writes an alert row to `alerts` table with type `"ta_overbought"`, severity `"MEDIUM"`, message e.g. `"VCB: RSI(14) = 74.2 — quá mua"`
5. If `rsi14 < 30` → writes `"ta_oversold"`, severity `"MEDIUM"`, message e.g. `"HPG: RSI(14) = 27.8 — quá bán"`
6. Cooldown: skip if an alert of the same type + ticker was written in the last 4 hours (query `alerts` table by `ticker + alert_type + created_at`)
7. Returns `{ scanned: N, fired: M }` for logging
8. Registered in `jobs.ts` as `*/15 2-8 * * 1-5` (every 15min, 02:00-08:30 UTC, weekdays)

**Alert table insert** (use existing `alerts` table schema — columns: `id`, `ticker`, `alert_type`, `severity`, `message`, `created_at`, `is_read`):
- `id` = `crypto.randomUUID()`
- `ticker` = watchlist ticker code
- `alert_type` = `"ta_overbought"` | `"ta_oversold"`
- `severity` = `"MEDIUM"`
- `message` = Vietnamese string as above
- `created_at` = `new Date().toISOString()`
- `is_read` = `0`

**DDD layer:** `scheduler` — may import from `infrastructure/` and `domain/services/`. Must NOT import from `application/` or `interface/`.

**Injectable deps for TDD:**
- `db?: Database` — defaults to `getDb()`
- `computeFn?: (db, ticker) => TechnicalIndicatorResult | null` — defaults to `computeAllIndicators` result adapter
- `getWatchlist?: (db) => string[]` — defaults to `db.prepare("SELECT code FROM watchlist").all()`
- `nowFn?: () => Date` — defaults to `() => new Date()`

**Acceptance Criteria**
- `src/scheduler/taAlertScanJob.ts` created
- `src/__tests__/1307-ta-alert-scan-job.test.ts` passes with 0 failures (TDD in task 1308)
- Alert fires when RSI > 70 (type `ta_overbought`)
- Alert fires when RSI < 30 (type `ta_oversold`)
- No alert fires when RSI is between 30 and 70
- No alert fires when RSI is null (insufficient price history)
- Cooldown: second scan within 4h for same ticker+type produces 0 additional alerts
- Job registered in `jobs.ts` with cron `*/15 2-8 * * 1-5` and job name `taAlertScanJob`
- `bun tsc --noEmit` 0 errors
- No changes to Alert Commander, morning briefing, cascade pipeline, or VPS proxies

---

### 1308 — test(ta-alert): TDD test 1307-ta-alert-scan-job.test.ts

**Branch:** `task/1307-1308-ta-alert-scan-job` (same branch as 1307)
**Layer:** test
**Depends on:** 1307 (taAlertScanJob implementation)
**Status:** Backlog

**Test cases (minimum):**
1. `fires ta_overbought alert when RSI > 70` — inject `computeFn` returning `{ rsi14: 74.2, ... }`, assert 1 alert row in `alerts` with `alert_type = "ta_overbought"`
2. `fires ta_oversold alert when RSI < 30` — inject `rsi14: 27.8`, assert `alert_type = "ta_oversold"`
3. `fires no alert when RSI is neutral (50.0)` — assert 0 alert rows
4. `fires no alert when RSI is null` — inject `computeFn` returning `{ rsi14: null, ... }`, assert 0 alert rows
5. `cooldown suppresses second fire within 4 hours` — first scan fires 1 alert, second scan 30 min later fires 0
6. `cooldown does not suppress after 4 hours` — first scan fires 1 alert, second scan 5h later fires 1 more
7. `scans all watchlist tickers` — inject 3 tickers, 2 overbought, assert `fired = 2, scanned = 3`
8. `returns { scanned: 0, fired: 0 } when watchlist is empty`

**Acceptance Criteria**
- `bun test ./src/__tests__/1307-ta-alert-scan-job.test.ts` shows ≥8 pass / 0 fail
- In-memory SQLite, injectable deps, no real I/O
- `bun tsc --noEmit` 0 errors

