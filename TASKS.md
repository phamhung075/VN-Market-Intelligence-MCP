# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 122 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1358 | test(ohlcv-aggregator): TDD 1358-ohlcv-daily-aggregator.test.ts — written FIRST | Done | QA |
| 1359 | feat(ohlcv-aggregator): ohlcvDailyAggregatorJob + wire jobs.ts | Done | Dev |

> Req spec: `docs/REQ_122.md` | Tech design: `docs/TECH_122.md` | PO sign-off: 2026-04-17

---

## Sprint 123 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1360 | test(ohlcv-backfill-queue): TDD — written FIRST, must be RED | Done | QA |
| 1361 | feat(ohlcv-backfill-queue): backfill queue endpoint + VPS poll script | Done | Dev |

> Req spec: `docs/REQ_123.md` | Tech design: `docs/TECH_123.md` | PO sign-off: 2026-04-17

---

## Sprint 124 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1362 | test(vps-deploy-backfill): TDD — deploy script wires ohlcv-backfill-poll.sh | Done | QA |
| 1363 | feat(vps-deploy-backfill): deploy-vinahost.sh — add backfill poller as 6th service | Done | Dev |

> Goal: Wire ohlcv-backfill-poll.sh into deploy-vinahost.sh so the VPS poller is installed automatically — without this, the Sprint 123 queue mechanism is dead (VPS never polls it)
> Tech design: `docs/TECH_124.md` | PO sign-off: 2026-04-17

---

## Sprint 125 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1364 | test(france-ta-detail): TDD — franceSummaryJob TA section shows ticker signals not just count | Done | QA |
| 1365 | feat(france-ta-detail): franceSummaryJob — replace taCount with top 3 non-neutral TA signals | Done | QA |

> Goal: Enrich France morning briefing TA section with actionable ticker-level RSI/MA20 signals so the user sees which watchlist stocks are overbought/oversold each morning, not just a count.
> Req spec: `docs/REQ_125.md` | Tech design: `docs/TECH_125.md`

---

## Task Details (active tasks only)

### Task 1364 — test(france-ta-detail): TDD tests for TA signal detail in France briefing

**Branch**: `task/1364-france-ta-detail-tdd`
**Layer**: test
**Depends on**: none

**Context**: The France morning briefing (`franceSummaryJob.ts`) currently shows only a count of TA signals (`taCount`). The user gets "Tin hieu ky thuat (TA): 5 tin hieu" with no indication of which tickers are overbought/oversold. Since the OHLCV pipeline is now healthy (8-10 rows per watchlist ticker), the TA signals are actionable. This sprint enriches the briefing TA section with top 3 non-neutral signals (ticker, RSI status, price vs MA20).

**Files to read first**
- `src/scheduler/franceSummaryJob.ts` (existing job + formatFranceSummaryVI)
- `src/application/usecases/assembleBriefing.ts` (`defaultComputeTa`, `TaSignal` type)
- `src/__tests__/1352-ohlcv-startup-probe.test.ts` or similar for in-memory DB pattern

**Files to create**
- CREATE: `src/__tests__/1364-france-ta-detail.test.ts`

Line 1: `process.env["DB_PATH"] = ":memory:";`

**Acceptance Criteria** (all RED before 1365, all GREEN after)
- AC-1: `formatFranceSummaryVI` called with `taSignals=[{code:"VHM",rsiStatus:"overbought",rsi14:78.2,priceVsMa20:"above"}]` → message contains "VHM" and "qua mua"
- AC-2: `formatFranceSummaryVI` called with empty `taSignals` → message contains "Khong co tin hieu ky thuat" (not just count 0)
- AC-3: `runFranceSummary` with DB containing ≥8 daily_ohlcv rows for a ticker → sent message includes ticker code and RSI status string
- AC-4: `runFranceSummary` with empty daily_ohlcv → sent message does NOT crash, sends with "Khong co tin hieu ky thuat"
- `bun tsc --noEmit` 0 errors

---

### Task 1365 — feat(france-ta-detail): replace taCount with top-3 TA signal detail in France briefing

**Branch**: `task/1365-france-ta-detail-impl`
**Layer**: scheduler/application
**Depends on**: 1364 (TDD tests RED)

**Files to read first**
- `src/__tests__/1364-france-ta-detail.test.ts` (AC definitions)
- `src/scheduler/franceSummaryJob.ts` (full file)
- `src/application/usecases/assembleBriefing.ts` (`defaultComputeTa`, `TaSignal` type)

**Files to modify**
- MODIFY: `src/scheduler/franceSummaryJob.ts`:
  - Add `fetchTaSignals(db, watchlistCodes)` helper — calls `defaultComputeTa` for each watchlist ticker, returns top 3 non-neutral signals sorted by RSI deviation from 50
  - Update `FranceSummaryResult` to include `taSignals: TaSignalRow[]` (replace `taCount`)
  - Update `formatFranceSummaryVI` signature: replace `taCount: number` with `taSignals: TaSignalRow[]`
  - Update TA section in formatted output: list ticker + "qua mua" / "qua ban" + RSI value + above/below MA20

**Acceptance Criteria**
- All 4 AC tests from 1364 pass
- Watchlist codes fetched from `watchlist` table (same pattern as evening summary)
- Max 3 non-neutral signals shown (overbought RSI>70, oversold RSI<30; or above/below MA20 if RSI neutral)
- Neutral-only tickers not shown (section says "Khong co tin hieu" when all tickers neutral)
- Backward-compatible: `alreadySentToday` guard and dedup logic unchanged
- `bun tsc --noEmit` 0 errors
- Full suite 0 new failures
