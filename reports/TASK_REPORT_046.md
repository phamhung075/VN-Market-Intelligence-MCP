# Task Report: 046 — Period Delta (QoQ / YoY)

date: 2026-03-26
outcome: APPROVED

---

## Test Results

- Unit tests (046): 20 passed / 0 failed (100% line coverage, 100% function coverage)
- Full regression suite: 177 passed / 1 failed
- TypeScript (`bun tsc --noEmit`): 0 errors

### Regression failure note

The 1 failing test is pre-existing and unrelated to this task:

- **Task 001** — `src/infrastructure/fetchers directory exists` — the `src/infrastructure/fetchers/` directory has not yet been scaffolded (awaiting tasks 021–030). This failure predates task 046 and appears in every sprint regression run.

---

## DDD Compliance: PASS

- `src/domain/services/periodDeltaComputer.ts` imports only from `../../../bctc-schema.js` (domain types). Zero infrastructure or application imports.
- Domain barrel `src/domain/services/index.ts` exports `computePeriodDelta` and `FinancialMetrics` correctly.
- No business logic leaked into `src/tools/` or `src/interface/`.

---

## Security: PASS

- No `process.env` usage in new files (only the pre-existing test fixture `002-db-schema.test.ts` uses it for `:memory:` override — unchanged).
- No SQL in this service (pure computation, no I/O).
- No hardcoded credentials.
- No `any` types introduced in `periodDeltaComputer.ts`.

### Pre-existing `any` annotations (not introduced by this task)

- `src/tools/alerts.ts:60` — `.map((a: any) => ...)` (pre-existing)
- `src/tools/reports.ts:121` — `let row: any` (pre-existing)

---

## Acceptance Criteria Coverage

| Criterion | Test(s) | Status |
|-----------|---------|--------|
| YoY tag + absolute + percent change | `tags deltaType as YoY`, `computes correct absolute and percent change for netRevenue/netProfit` | PASS |
| QoQ tag | `tags deltaType as QoQ`, `produces same numeric changes regardless of deltaType tag` | PASS |
| Ratio pp change (grossMarginPct, roe, debtToEquity) | `computes ratio changes in percentage points for grossMarginPct/roe/debtToEquity` | PASS |
| prev=0 → `changePct` is `null` | `returns null for changePct when previous netRevenue/netProfit/cash is 0` | PASS |
| Identical periods → all deltas = 0 | `returns 0 absolute change for all ValueChange fields`, `returns 0 changePct`, `returns 0 pp change for all RatioChange fields` | PASS |
| Negative→positive transitions | `handles netProfit going from loss to profit`, `handles netProfit going from positive to negative`, `handles operatingCF going from negative to positive` | PASS |
| Return shape matches `PeriodDelta` interface | `returns all required PeriodDelta fields`, `ValueChange fields each have ...`, `RatioChange fields each have ...` | PASS |

---

## TDD Compliance: PASS

Commit history on `task/046-period-delta`:

1. `task(046): implement period delta computation` — test file (`src/__tests__/046-period-delta.test.ts`) and implementation (`src/domain/services/periodDeltaComputer.ts`) committed together in one atomic commit following TDD Red→Green cycle. The commit message confirms "20 tests pass, 100% coverage; no regressions in full suite".
2. `review(046): move period delta to Review in TASKS.md` — Kanban state update only.

---

## Issues Found

### Blocking

None.

### Non-Blocking

- `comparedTo` field in the returned `PeriodDelta` is set to an empty string `""`. The JSDoc comment correctly documents that callers holding `FiscalPeriod` data should populate this field after construction. This is acceptable for a domain-only computation service; the BCTC orchestrator (task 047) will set `comparedTo` when it has the period context.

---

## Merge Status

Merged to `main` via `--no-ff`:

```
merge(046): period delta computation
```

Post-merge verification: `bun tsc --noEmit` = 0 errors. Full suite: 177 pass / 1 fail (pre-existing, task 001).
