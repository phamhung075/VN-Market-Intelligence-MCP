# Fixer Handoff — TASK 1352a (CHANGES_REQUESTED)

## Context
Task 1352a adds 7 wrapper-level tests for `macroIndicatorRefreshJob` and `marketScanJob`.
All 7 tests pass at runtime. Two TSC issues block merge.

## File to Fix
`apps/mcp-server/src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts`

---

## Blocking Issue 1 — TS2307: `?test=XX` query-string imports fail TSC (7 occurrences)

Lines: 89, 135, 185, 242, 312, 366, 414

Each looks like:
```typescript
const { macroIndicatorRefreshJob } = await import(
  "../scheduler/macro/macroIndicatorRefreshJob.js?test=A1"
);
```

TypeScript cannot resolve module paths with URL query strings. Bun handles them at runtime (cache-busting), but `tsc` fails.

**Fix strategy**: The `?test=` trick was used to give each test group a fresh module instance (so `mock.module()` applies). The correct pattern in this codebase is to put `mock.module()` calls inside `beforeEach()` and import the module once without a query string.

Look at `src/__tests__/1351b-vps-proxy-watchdog-job.test.ts` for the established pattern:
- `mock.module(...)` calls at top of file or in `beforeEach()`
- Single `import { fn } from "...(no query string)"` at file level or once per describe

For each group (A1–A4, B1–B3), consolidate `mock.module()` calls into `beforeEach()` within the describe block and import the subject module once. Since each group already has its own `describe()`, the mock setup in `beforeEach()` is sufficient to isolate state.

**After fix**: `bun tsc --noEmit 2>&1 | grep "1352a.*TS2307"` must return 0 lines.

---

## Blocking Issue 2 — TS2488: destructuring from `T | undefined` (2 occurrences)

Lines 140 and 198:
```typescript
const [job, durationMs, errorCount, successCount] = recordMetricsCalls[0];
```

With `noUncheckedIndexedAccess` enabled, `recordMetricsCalls[0]` is typed as `[string, number, number, number] | undefined`. Destructuring fails.

**Fix** (apply to both lines 140 and 198):
```typescript
const callArgs = recordMetricsCalls[0];
expect(callArgs).toBeDefined();
const [job, durationMs, errorCount, successCount] = callArgs!;
```

**After fix**: `bun tsc --noEmit 2>&1 | grep "1352a.*TS2488"` must return 0 lines.

---

## Verification Checklist

1. `bun tsc --noEmit 2>&1 | grep 1352a` → 0 lines
2. `bun test src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts 2>&1 | tail -5` → 7 pass / 0 fail
3. No changes to any source file outside `src/__tests__/`

## After Fix

Commit:
```
fix(1352a): replace ?test= cache-bust imports with mock.module + add null guards for noUncheckedIndexedAccess
```

Then notify QA for re-review.

## Context: Pre-existing Regressions (NOT your responsibility)
The full suite shows 663 failures — these are from the `feat/bctc-pull-pdf` merge (commit `7b52678d`) which predates 1352a. Do not attempt to fix them in this task. Focus only on the 9 TSC errors in `1352a` (and 2 TSC errors in `1352b` if 1352b is also assigned).
