# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

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

