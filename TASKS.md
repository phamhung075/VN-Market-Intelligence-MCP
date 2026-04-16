# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 101 — Active

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

### 1318 — fix(evening-summary): diagnose + fix predictionSignals always empty

**Branch:** `task/1318-1319-prediction-signals-evening`
**Layer:** application/usecases + scheduler + test
**Status:** Todo
**Tech ref:** `docs/TECH_100.md`

**Confirmed root causes (BA analysis 2026-04-15 — no investigation needed):**
1. RC-1: `prediction_signals` table has 0 rows within 24h — signals never stored in production
2. RC-2: `predictionMarketJob.ts` exits early (`return`) on `fetchPolymarkets` failure (geo-block from France) before reaching `detectPredictionSignals` or `storePredictionSignals`
3. RC-3: `assembleEveningSummary.ts` swallows errors in prediction signals `catch` block silently — no log, no visibility

**Fix 1 — `predictionMarketJob.ts` (FR-4):** Replace bare `return` in the `fetchPolymarkets` catch block with a fallback to `loadPreviousSnapshot(db)` (helper already exists at line 70). Signal detection continues against cached data. 83 rows already in `prediction_markets` table.

**Fix 2 — `assembleEveningSummary.ts` (FR-2):** Replace `catch { /* best-effort */ }` at line 319 with `catch (err) { logger.warn("[assembleEveningSummary] prediction signals query failed", { error: ... }) }`.

**Files to change:**
- `src/scheduler/predictionMarketJob.ts` — fallback on fetch failure (lines 345–350)
- `src/application/usecases/assembleEveningSummary.ts` — add logger.warn to catch block (line 319)
- `src/__tests__/1318-prediction-signals-evening.test.ts` — new TDD test (task 1319)

**Acceptance Criteria (from REQ-100):**
- AC-1: `predictionSignals.length >= 1` when DB has HIGH/CRITICAL signal within 24h
- AC-2: `predictionSignals === []` when all signals older than 24h
- AC-3: `logger.warn` called (not swallowed) when `getRecentPredictionSignals` throws
- AC-4: `predictionMarketJob` does NOT exit early when `fetchPolymarkets` throws; `detectPredictionSignals` is called with cached snapshot
- AC-5: `bun tsc --noEmit` 0 errors

---

### 1319 — test(evening-summary): TDD test 1318-prediction-signals-evening.test.ts

**Branch:** `task/1318-1319-prediction-signals-evening` (same branch as 1318)
**Layer:** test
**Depends on:** 1318 (fix implementation)
**Status:** Todo
**Tech ref:** `docs/TECH_100.md`

**Write tests FIRST (all failing), then apply fixes from task 1318.**

**Test cases (4 required by REQ-100 AC-1 to AC-4):**
1. TC-1 (AC-1): Seed `prediction_signals` row with `severity='high'` and `detected_at=now()` → `assembleEveningSummary` returns `predictionSignals.length >= 1`, `severity === 'high'`
2. TC-2 (AC-2): Seed signal with `detected_at = 25h ago` → `predictionSignals.length === 0`
3. TC-3 (AC-3): Drop `prediction_signals` table before call → no exception propagates; `predictionSignals === []`; `logger.warn` was called
4. TC-4 (AC-4): Seed 2 `prediction_markets` rows; call `runPredictionMarketPoll` with `fetchFn` that throws → job does not throw; signal detection path was reached (assert via DB row count or injected spy)

**Acceptance Criteria:**
- `bun test src/__tests__/1318-prediction-signals-evening.test.ts` >= 4 pass / 0 fail
- In-memory SQLite via `new Database(":memory:")` + `initDatabase(db)`, injectable deps, no real I/O
- `bun tsc --noEmit` 0 errors
