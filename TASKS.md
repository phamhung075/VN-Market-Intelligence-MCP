# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

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
