# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 120 — Active

| ID | Title | Status | Role |
|----|-------|--------|------|
| 1354 | test(prediction-diag): TDD 1354-prediction-signals-fallback.test.ts — written FIRST | Done | QA |
| 1355 | feat(prediction-diag): predictionDiag block + medium-severity fallback in assembleEveningSummary | Review | Dev |

> Tech design: `docs/TECH_120.md` (APPROVED_BY_ARCHITECT)

---

## Task Details (active tasks only)

### Task 1354 — test(prediction-diag): TDD test

**Branch**: `task/1354-prediction-diag-tdd`
**Layer**: test
**Depends on**: none

**Files to create**
- CREATE: `src/__tests__/1354-prediction-signals-fallback.test.ts`

**Files to read first**
- `src/application/usecases/assembleEveningSummary.ts` lines 335-347 (Step 5 prediction signals)
- `src/infrastructure/db/predictionStore.ts` lines 73-130 (`getRecentPredictionSignals` query)
- `src/__tests__/1318-prediction-signals-evening.test.ts` (pattern: in-memory DB + `assembleEveningSummary` import)

**Acceptance Criteria**

**Given** `src/__tests__/1354-prediction-signals-fallback.test.ts` with line 1: `process.env["DB_PATH"] = ":memory:";`, injecting signals via `getPredictionSignalsFn` option (no `mock.module`)
**When** `bun test 1354` runs before task 1355 is applied
**Then**
- AC-1: 2 signals (high + critical) → `predictionSignals` length 2, `predictionDiag.stored` === 2
- AC-2: 4 medium signals, 0 high/critical → `predictionSignals` length 3 (capped), `predictionDiag.stored` === 4
- AC-3: 0 signals → `predictionSignals` === [], `predictionDiag.stored` === 0
- AC-4: 5 signals (2 high + 2 medium + 1 low) → `predictionSignals` length 2 (high only), `predictionDiag.stored` === 5
- AC-5: `getPredictionSignalsFn` throws → `predictionSignals` === [], `predictionDiag.stored` === 0; `logger.warn` called with message containing "prediction"
- All 5 tests RED before 1355; GREEN after 1355

---

### Task 1355 — feat(prediction-diag): predictionDiag + medium fallback

**Branch**: `task/1355-prediction-diag-impl`
**Layer**: application/usecases
**Depends on**: 1354 (TDD tests written, confirmed RED)

**Files to modify**
- MODIFY: `src/application/usecases/assembleEveningSummary.ts`
  - Add `PredictionDiag` interface above `EveningSummary`
  - Add `predictionDiag: PredictionDiag` field to `EveningSummary`
  - Add optional `getPredictionSignalsFn` to `AssembleEveningSummaryOptions`
  - Replace Step 5 (lines 335-347) with medium-fallback + diag block per TECH_120

**Files to read first**
- `src/application/usecases/assembleEveningSummary.ts` lines 50-65 (types) + 335-347 (Step 5)
- `src/infrastructure/db/predictionStore.ts` lines 73-130 (`getRecentPredictionSignals`)

**Acceptance Criteria**

**Given** task 1354 tests exist and are RED
**When** changes applied and `bun test 1354` runs
**Then**
- All 5 AC tests pass, 0 failures
- `bun tsc --noEmit` 0 errors
- `PredictionDiag { stored: number }` interface exported from `assembleEveningSummary.ts`
- Fallback: no high/critical → up to 3 medium signals from last 24h
- `predictionDiag.stored` = COUNT of all `prediction_signals` rows in last 24h (any severity)
- Telegram formatter untouched — `predictionDiag` is JSON-only, not sent to Telegram
- Full suite 0 new failures
