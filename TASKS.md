# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 121 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1356 | test(ta-diag): TDD 1356-ta-diag.test.ts — written FIRST | Done | QA |
| 1357 | feat(ta-diag): TaDiag block in assembleEveningSummary | Done | Dev |

> Req spec: `docs/REQ_121.md` — DONE (BA)
> Tech design: `docs/TECH_121.md` — DONE (Architect)

---

## Sprint 120 — COMPLETE (2026-04-17)

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1354 | test(prediction-diag): TDD 1354-prediction-signals-fallback.test.ts — written FIRST | Done | QA |
| 1355 | feat(prediction-diag): predictionDiag block + medium-severity fallback in assembleEveningSummary | Done | QA |

---

## Task Details (active tasks only)

### Task 1356 — test(ta-diag): TDD test (written FIRST, must be RED)

**Branch**: `task/1356-ta-diag-tdd`
**Layer**: test
**Depends on**: none

**Files to create**
- CREATE: `src/__tests__/1356-ta-diag.test.ts`

**Files to read first**
- `src/application/usecases/assembleEveningSummary.ts` (EveningSummary interface, taSummary assembly step)
- `src/__tests__/1354-prediction-signals-fallback.test.ts` (injection pattern for assembleEveningSummary)
- `src/__tests__/1312-evening-summary-ta.test.ts` (taSummary test pattern)

**Acceptance Criteria**

Line 1: `process.env["DB_PATH"] = ":memory:";`
Use injectable `computeTaFn` + `getOhlcvRowCountFn` options in `assembleEveningSummary`.

- AC-1: 2 watchlist tickers, both with 15+ OHLCV rows, both returning TaSignal → `taDiag.tickersWithSignal === 2`, `taDiag.tickersBelowThreshold === 0`, `taDiag.ohlcvRowsMin >= 15`, `taDiag.ohlcvRowsMax >= 15`
- AC-2: 2 watchlist tickers, both sparse (3 rows each) → `taDiag.tickersWithSignal === 0`, `taDiag.tickersBelowThreshold === 2`, `taDiag.ohlcvRowsMin === 3`, `taDiag.ohlcvRowsMax === 3`
- AC-3: 1 ticker has signal, 1 sparse → `taDiag.tickersWithSignal === 1`, `taDiag.tickersBelowThreshold === 1`
- AC-4: `computeTaFn` throws → `taDiag` defaults to `{ tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 }`, no crash
- All 4 tests RED before 1357; GREEN after 1357

---

### Task 1357 — feat(ta-diag): TaDiag block in assembleEveningSummary

**Branch**: `task/1357-ta-diag-impl`
**Layer**: application/usecases
**Depends on**: 1356 (TDD tests written, confirmed RED)

**Files to modify**
- MODIFY: `src/application/usecases/assembleEveningSummary.ts`
  - Add `TaDiag` interface: `{ tickersWithSignal: number; tickersBelowThreshold: number; ohlcvRowsMin: number; ohlcvRowsMax: number }`
  - Add `taDiag: TaDiag` field to `EveningSummary`
  - Add optional `getOhlcvRowCountFn?: (code: string, db: Database) => number` to `AssembleEveningSummaryOptions`
  - In taSummary assembly step: for each watchlist ticker, call `getOhlcvRowCountFn` (default: `SELECT COUNT(*) FROM daily_ohlcv WHERE code = ?`), track min/max/threshold counts alongside existing `defaultComputeTa` calls

**Files to read first**
- `src/application/usecases/assembleEveningSummary.ts` (full taSummary assembly step)
- `src/infrastructure/db/schema.ts` (daily_ohlcv table definition)

**Acceptance Criteria**

- All 4 AC tests from 1356 pass, 0 failures
- `bun tsc --noEmit` 0 errors
- `TaDiag` interface exported from `assembleEveningSummary.ts`
- `taDiag` present in evening JSON report (same pattern as `predictionDiag` — JSON only, NOT in Telegram)
- Telegram formatter untouched
- Full suite 0 new failures
