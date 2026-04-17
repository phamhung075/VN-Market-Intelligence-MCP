# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 108 — Active

| ID | Title | Status |
|----|-------|--------|
| 1332 | test(source-health): TDD test 1332-pollnews-source-display-name.test.ts — written FIRST | Review |
| 1333 | fix(source-health): add SOURCE_DISPLAY_NAMES map to pollNews — record health under display name | Review |

---

## Sprint 107 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1331 | test(ta): TDD test 1330-ta-daily-ohlcv.test.ts — written FIRST | Done |
| 1330 | fix(ta): rewrite defaultComputeTa to use daily_ohlcv.close instead of market_prices_history ticks | Done |

---

## Sprint 106 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1329 | fix(test-timeout): 278-cycle-peer-sync — add DB_PATH=:memory: + inject getRecentAlertHistoryFn in buildBaseDeps | Done |

---

## Sprint 105 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1328 | fix(test-timeout): 137-fix-alert-pipeline Step E — add DB_PATH=:memory: + inject getRecentAlertHistoryFn [TECH_105] | Done |

---

## Sprint 104 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1327 | test(macro-alert): TDD test 1326-macro-deviation-direction.test.ts (6 cases, all failing first) | Done |
| 1326 | fix(macro-alert): direction-aware level label in classifyDeviation — "thấp bất thường" for below-mean | Done |

---

## Sprint 103 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1324 | fix(push-news): extend SourceFetchers + wire all 9 VPS sources in push-news handler | Done |
| 1325 | test(push-news): TDD test 1324-push-news-all-sources.test.ts | Done |

---

## Sprint 102 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1322 | feat(evening): add newsCount diagnostic field to EveningSummary | Done |
| 1323 | feat(evening): update eveningSummaryJob formatter — show "(N tin tức hôm nay)" | Done |

---

## Sprint 101 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1320 | refactor(ddd): create domain/models/shared-types.ts — move shared types out of infra | Done |
| 1321 | test(ddd): TDD boundary test — zero infra imports in domain/ | Done |

---

## Sprint 100 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1318 | fix(evening-summary): diagnose + fix predictionSignals always empty | Done |
| 1319 | test(evening-summary): TDD test 1318-prediction-signals-evening.test.ts | Done |

---

## Sprint 099 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1316 | feat(france-summary): rewrite franceSummaryJob — Vietnamese digest to MARKET channel | Done |
| 1317 | test(france-summary): TDD test 1316-france-summary-rewrite.test.ts | Done |

---

## Sprint 098 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1315 | test(ta-notifier): TDD test 1314-ta-alert-notifier.test.ts — written FIRST | Done |
| 1314 | feat(ta-notifier): implement taAlertNotifierJob.ts — forward unnotified TA alerts to Telegram market channel | Done |

---

## Sprint 097 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1312 | feat(evening-summary): add taSummary (RSI/MA20 at close) to EveningSummary type + Telegram message | Done |
| 1313 | test(evening-summary): TDD test 1312-evening-summary-ta.test.ts | Done |

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

### 1332 — test(source-health): TDD test pollnews-source-display-name

**Branch:** `task/1332-1333-source-display-name`
**Layer:** test
**Depends on:** none (TDD-first)
**Status:** Review
**Role:** Dev

**Root cause to prove:** `pollNews` calls `globalSourceTracker.recordSuccess("reuters")` using the raw fetcher key. The test (and the health UI) checks `"Reuters RSS"` — a different bucket. The test on line 164-200 of `1227-source-health-empty-result.test.ts` manually seeds failures on `"Reuters RSS"`, then runs `pollNews` with Reuters returning items, then asserts `"Reuters RSS"` status is `"ok"`. But `pollNews` updates the `"reuters"` bucket, not `"Reuters RSS"` — so the assertion fails.

**Files to read first:**
- `src/application/usecases/pollNews.ts` lines 430–475 — the health tracking loop and `recordSuccess`/`recordFailure` call sites
- `src/__tests__/1227-source-health-empty-result.test.ts` lines 124–200 — the two pollNews integration tests

**Files to create:**
- CREATE: `src/__tests__/1332-pollnews-source-display-name.test.ts`

**Test cases (3 required — must FAIL before task 1333 fix):**
1. TC-1: `pollNews` with `reuters: async () => [item]` → `globalSourceTracker.getHealth("Reuters RSS").status === "ok"` (fails: pollNews records under `"reuters"` not `"Reuters RSS"`)
2. TC-2: `pollNews` with `cafef: async () => []` → `globalSourceTracker.getHealth("CafeF RSS").consecutiveFailures > 0` (fails: recorded under `"cafef"`)
3. TC-3: After TC-1, `globalSourceTracker.getHealth("reuters")` is either absent or at default state (confirms old key is no longer used)

**Acceptance Criteria:**

**Given** `src/__tests__/1332-pollnews-source-display-name.test.ts` written before the fix
**When** `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` runs (before task 1333)
**Then** TC-1 and TC-2 FAIL (proving the bug). TC-3 passes.
After task 1333: all 3 pass.
`bun tsc --noEmit` 0 errors.

---

### 1333 — fix(source-health): SOURCE_DISPLAY_NAMES map in pollNews

**Branch:** `task/1332-1333-source-display-name` (same as 1332)
**Layer:** application/usecases
**Depends on:** 1332 (tests written and confirmed failing)
**Status:** Review
**Role:** Dev

**Files to read first:**
- `src/application/usecases/pollNews.ts` lines 430–475 — health tracking loop
- `src/__tests__/1332-pollnews-source-display-name.test.ts` — confirm TC-1 and TC-2 are red

**Files to modify:**
- MODIFY: `src/application/usecases/pollNews.ts`
  - Add constant before the health tracking loop:
    ```ts
    const SOURCE_DISPLAY_NAMES: Record<string, string> = {
      reuters: "Reuters RSS",
      cafef: "CafeF RSS",
      vnexpress: "VnExpress RSS",
      vneconomy: "VnEconomy RSS",
      tradingeconomics: "Trading Economics RSS",
    };
    ```
  - Replace `globalSourceTracker.recordSuccess(name)` with `globalSourceTracker.recordSuccess(SOURCE_DISPLAY_NAMES[name] ?? name)`
  - Replace both `globalSourceTracker.recordFailure(name, ...)` calls with `globalSourceTracker.recordFailure(SOURCE_DISPLAY_NAMES[name] ?? name, ...)`

**Acceptance Criteria:**

**Given** `src/__tests__/1332-pollnews-source-display-name.test.ts` with TC-1+TC-2 failing
**When** fix applied and `bun test src/__tests__/1332-pollnews-source-display-name.test.ts` runs
**Then** all 3 pass.
`bun test src/__tests__/1227-source-health-empty-result.test.ts` — all 8 pass / 0 fail (the 2 pre-existing failures eliminated).
Full suite regression: 0 new failures vs Sprint 107 baseline.
`bun tsc --noEmit` 0 errors.

---

### 1331 — test(ta): TDD test 1330-ta-daily-ohlcv.test.ts

**Branch:** `task/1330-1331-ta-daily-ohlcv`
**Layer:** test
**Depends on:** none (TDD-first)
**Status:** Backlog
**Role:** Dev

**Files to read first:**
- `src/application/usecases/assembleBriefing.ts` lines 504–535 — current `defaultComputeTa()` signature and return type `TaSignal | null`
- `src/infrastructure/db/schema.ts` lines 134–148 — `daily_ohlcv` schema (code, date, open, high, low, close, volume)

**Files to create:**
- CREATE: `src/__tests__/1330-ta-daily-ohlcv.test.ts`

**Test cases (4 required — written before production change):**
1. TC-1: `daily_ohlcv` has 0 rows for ticker → `defaultComputeTa()` returns null
2. TC-2: `daily_ohlcv` has 14 rows (< 15) → returns null
3. TC-3: `daily_ohlcv` has 20 rows with known close prices → returns non-null `TaSignal` with `code`, `rsi14`, `rsiStatus`, `ma20`, `priceVsMa20`, `currentPrice` all defined
4. TC-4: `daily_ohlcv` has 20 rows where last close > MA20 → `priceVsMa20 === "above"`

**Acceptance Criteria:**

**Given** a fresh `daily_ohlcv` table with synthetic close prices
**When** `bun test src/__tests__/1330-ta-daily-ohlcv.test.ts` runs (before task 1330 fix is applied)
**Then**
- TC-1, TC-2: pass (null return for insufficient data — already correct)
- TC-3, TC-4: FAIL (production code reads `market_prices_history`, not `daily_ohlcv` — proves the bug)
- After task 1330 is applied: all 4 pass
- `bun tsc --noEmit` 0 errors

---

### 1330 — fix(ta): rewrite defaultComputeTa to use daily_ohlcv

**Branch:** `task/1330-1331-ta-daily-ohlcv` (same as 1331)
**Layer:** application/usecases
**Depends on:** 1331 (tests written and confirmed failing)
**Status:** Backlog
**Role:** Dev

**Files to read first:**
- `src/application/usecases/assembleBriefing.ts` lines 504–535 — full `defaultComputeTa()` function
- `src/__tests__/1330-ta-daily-ohlcv.test.ts` — confirm tests exist and TC-3/TC-4 are red

**Files to modify:**
- MODIFY: `src/application/usecases/assembleBriefing.ts`
  - In `defaultComputeTa()`: replace the `market_prices_history` query with:
    ```sql
    SELECT date, close AS close_price
    FROM daily_ohlcv
    WHERE code = ?
    ORDER BY date ASC
    LIMIT 60
    ```
  - Remove the `GROUP BY date(fetched_at)` grouping and the `AVG(price)` aggregation — `daily_ohlcv` already has one row per day with the official close price
  - Keep the `if (rows.length < 15) return null` guard unchanged
  - Keep all downstream RSI/MA20 computation unchanged — only the data source changes

**Acceptance Criteria:**

**Given** `src/__tests__/1330-ta-daily-ohlcv.test.ts` exists with TC-3/TC-4 failing
**When** fix is applied and `bun test src/__tests__/1330-ta-daily-ohlcv.test.ts` runs
**Then**
- All 4 tests pass / 0 fail
- TC-3: `defaultComputeTa()` returns non-null signal from `daily_ohlcv` data
- TC-4: `priceVsMa20 === "above"` when last close exceeds MA20
- No regression in other TA tests (`bun test` full suite 0 new failures)
- `bun tsc --noEmit` 0 errors

---

### 1329 — fix(test-timeout): 278-cycle-peer-sync DB isolation

**Branch:** `task/1329-test278-timeout`
**Layer:** test (test file only — no production code changes)
**Depends on:** none
**Status:** Backlog
**Role:** Dev

**Root cause:** `src/__tests__/278-cycle-peer-sync.test.ts` does NOT set `process.env["DB_PATH"] = ":memory:"` at file top. The comment on line 15 incorrectly claims this is impossible; task 1328 (test 137 fix) proved the pattern works — set `:memory:` at line 1 AND inject `getRecentAlertHistoryFn: async () => []` into `buildBaseDeps()`. Without this, the cycle's cooldown `getDb()` calls hit the production SQLite file, causing all 10 tests to timeout at 5s (50s wasted per full suite run).

**Files to read first:**
- `src/__tests__/278-cycle-peer-sync.test.ts` — full file, understand `buildBaseDeps()` and all 10 test call-sites
- `src/__tests__/137-fix-alert-pipeline.test.ts` lines 1–5 — confirm the working pattern for `:memory:` + `getRecentAlertHistoryFn` injection

**Files to modify:**
- MODIFY: `src/__tests__/278-cycle-peer-sync.test.ts`
  - ADD line 1: `process.env["DB_PATH"] = ":memory:";` (before all imports — same pattern as test 1192 and test 137)
  - ADD `getRecentAlertHistoryFn: async () => []` to the `buildBaseDeps()` return object — this automatically covers all 10 tests
  - REMOVE or UPDATE the incorrect comment on line 15 ("We cannot use DB_PATH=:memory: because...") — this comment is wrong; the real reason for past timeout was missing `getRecentAlertHistoryFn`

**Acceptance Criteria:**

**Given** the modified test file
**When** `bun test ./src/__tests__/278-cycle-peer-sync.test.ts` runs
**Then**
- All 10 tests pass / 0 fail
- Total test file runtime under 10s
- `bun tsc --noEmit` 0 errors
- Full suite: 0 new failures vs Sprint 105 baseline (4885 pass, 14 fail pre-existing)

---

### 1327 — test(macro-alert): TDD test 1326-macro-deviation-direction.test.ts

**Branch:** `task/1326-1327-macro-alert-direction`
**Layer:** test
**Depends on:** none (TDD-first — write failing tests before fix)
**Status:** In Progress
**Role:** Dev

**Files to create:**
- CREATE: `src/__tests__/1326-macro-deviation-direction.test.ts`

**Files to read first:**
- `src/domain/services/macroThresholds.ts` — understand `classifyDeviation()` signature and `MacroStats` type
- `docs/TECH_104.md` — 6 test case input values and assert strings

**Test cases (6 required — all must FAIL before task 1326 is applied):**
1. TC-1 (AC-1): `current=26364, mean=26333, stdDev=12, n=30` → zScore≈+2.6 → summary contains "cao bất thường", not "thấp bất thường"
2. TC-2 (AC-2): `current=26302, mean=26333, stdDev=12, n=30` → zScore≈-2.6 → summary contains "thấp bất thường", not "cao bất thường"
3. TC-3 (AC-3): `current=26375, mean=26333, stdDev=12, n=30` → zScore≈+3.5 → summary contains "cực cao"
4. TC-4 (AC-4): `current=26291, mean=26333, stdDev=12, n=30` → zScore≈-3.5 → summary contains "cực thấp"
5. TC-5 (AC-5): `current=26340, mean=26333, stdDev=12, n=30` → zScore≈+0.6 → summary contains "bình thường"
6. TC-6 (regression): `current=26302, mean=26333.2, stdDev=12, n=30` → summary contains "thấp bất thường", not "cao bất thường"

**Acceptance Criteria:**

**Given** a fresh checkout on `task/1326-1327-macro-alert-direction` before 1326 is applied
**When** `bun test src/__tests__/1326-macro-deviation-direction.test.ts` runs
**Then**
- All 6 tests call `classifyDeviation()` directly — no DB, no HTTP, no Telegram
- TC-2, TC-4, TC-6 fail (proving the bug exists — before-only labels)
- TC-1, TC-3, TC-5 pass (above-mean path already correct)
- After task 1326 is applied: all 6 pass / 0 fail
- `bun tsc --noEmit` 0 errors

---

### 1326 — fix(macro-alert): direction-aware level label in classifyDeviation

**Branch:** `task/1326-1327-macro-alert-direction` (same as 1327)
**Layer:** domain/services
**Depends on:** 1327 (tests written and confirmed failing)
**Status:** In Progress
**Role:** Dev

**Files to read first:**
- `src/domain/services/macroThresholds.ts` — full file, find `LEVEL_VI` const and line 138
- `src/__tests__/1326-macro-deviation-direction.test.ts` — confirm tests exist and are red

**Files to modify:**
- MODIFY: `src/domain/services/macroThresholds.ts`
  - Add `LEVEL_VI_BELOW: Record<DeviationLevel, string>` with keys `{ normal: "bình thường", elevated: "thấp hơn TB", high: "thấp bất thường", extreme: "cực thấp" }`
  - Rename `LEVEL_VI.extreme` from `"cực đoan"` → `"cực cao"`
  - Replace line 138: `const levelVi = LEVEL_VI[level]` → `const levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level]`

**Acceptance Criteria:**

**Given** `src/__tests__/1326-macro-deviation-direction.test.ts` exists with 6 failing tests
**When** the fix is applied to `macroThresholds.ts` and `bun test src/__tests__/1326-macro-deviation-direction.test.ts` runs
**Then**
- All 6 tests pass / 0 fail
- AC-2: below-mean high → summary contains "thấp bất thường", not "cao bất thường"
- AC-4: below-mean extreme → summary contains "cực thấp"
- AC-3: above-mean extreme → summary contains "cực cao" (not "cực đoan")
- No other test files regress (`bun test` full suite passes)
- `bun tsc --noEmit` 0 errors

---

## Task Details (Sprint 105)

### 1328 — fix(test-timeout): 137 Step E tests — DB isolation + missing dep injection

**Branch:** `task/1328-test137-step-e-timeout`
**Layer:** test (test file only — no production code changes)
**Depends on:** none
**Status:** Backlog
**Role:** Dev

**Root cause:** `src/__tests__/137-fix-alert-pipeline.test.ts` has no `process.env["DB_PATH"] = ":memory:"` at file top. The 4 Step E tests call `runIntelligenceCycle` which internally calls `getDb()` via dynamic imports at multiple points (macro alert step A2.5, step E cooldown, etc.). Without `:memory:` set before module load, these resolve to the real production SQLite file — triggering WAL replay, disk I/O, and potential lock contention. Result: 30s timeout per test × 4 = 120s wasted in every full suite run, masking real regressions.

**Files to read first:**
- `src/__tests__/137-fix-alert-pipeline.test.ts` — full file, identify all 4 Step E test cases
- `src/scheduler/intelligenceCycleJob.ts` lines 585–870 — understand all `getDb()` call sites inside the cycle so we know which deps to inject

**Files to modify:**
- MODIFY: `src/__tests__/137-fix-alert-pipeline.test.ts`
  - ADD line 1: `process.env["DB_PATH"] = ":memory:";` (before all imports — same pattern as test 1192)
  - In all 4 Step E test fixtures (`runIntelligenceCycle` calls), ADD: `getRecentAlertHistoryFn: async () => []` to prevent fallthrough to `getCooldownDb()` real-DB path
  - Verify the 4 existing Step E tests still correctly test their AC (no semantic change — only DB isolation fix)

**Acceptance Criteria:**

**Given** the modified test file
**When** `bun test ./src/__tests__/137-fix-alert-pipeline.test.ts` runs
**Then**
- All Step E tests (4 cases) pass / 0 fail
- Total test file runtime under 10s
- `bun tsc --noEmit` 0 errors
- Full suite: 0 new failures vs baseline (4890 pass baseline from Sprint 104)
