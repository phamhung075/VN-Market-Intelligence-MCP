# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 092 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1304 | feat(briefing): integrate TA signals (RSI/SMA) into morning briefing | Dev | application | 1302 | — | Todo |

**WIP:** 0 In Progress. 0 Review.

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

### 1304 — feat(briefing): integrate TA signals (RSI/SMA) into morning briefing

**Branch:** `task/1304-ta-signals-morning-briefing`
**Layer:** application
**Depends on:** 1302 (technicalIndicators domain service, merged)
**Status:** Todo

**Problem:** The `technicalIndicators.ts` domain service (RSI/MACD/SMA/Bollinger Bands) was added in sprint 090 as an MCP tool only. The morning briefing (`assembleBriefing.ts` + `morningBriefingJob.ts`) does not call it, so users never see TA signals in their daily Telegram briefing.

**Solution:** Add a `taSummary` field to `DailyBriefing`, populate it in `assembleBriefing.ts` by calling `computeTechnicalIndicators` for each watchlist ticker, and render a compact "TA Signals" section in `formatBriefingMessage`.

**Signal rules (simple, no noise):**
- RSI > 70 → "overbought"
- RSI < 30 → "oversold"
- Price > SMA20 → "above MA20"
- Price < SMA20 → "below MA20"
- Only include tickers with at least one signal (silent skip if neutral)

**Acceptance Criteria**
- `src/__tests__/1304-ta-morning-briefing.test.ts` passes with 0 failures (TDD first)
- `formatBriefingMessage` output includes "TA Tín hiệu:" section when signals exist, omits section when none
- `assembleBriefing.ts` calls `computeTechnicalIndicators` per watchlist ticker (injectable for tests)
- `bun tsc --noEmit` shows 0 errors
- No change to Alert Commander, cascade pipeline, or VPS proxies

