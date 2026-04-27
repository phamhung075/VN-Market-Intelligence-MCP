# Task Report: 1352a — Scheduler Job Wrapper Tests: macroIndicatorRefreshJob + marketScanJob
date: 2026-04-27
outcome: CHANGES_REQUESTED

## Test Results
- Unit tests (targeted): 7 passed / 0 failed
- Full suite: 6918 passed / 663 failed
- TypeScript: 9 new errors introduced by 1352a (7 TS2307 + 1 TS2488 in 1352a file; 2 TS2307 in 1352b file)

## DDD Compliance: PASS
Only `src/__tests__/` modified. No source file changes. Domain layer untouched.

## Security: PASS
No credentials, no `process.env`, no hardcoded secrets, no SQL.

## Issues Found

### Blocking

**B-1: TSC TS2307 — `?test=` query-string cache-busting imports not resolvable by TypeScript**
- File: `src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts`
- Lines: 89, 135, 185, 242, 312, 366, 414
- Error: `TS2307: Cannot find module '../scheduler/macro/macroIndicatorRefreshJob.js?test=A1' or its corresponding type declarations.`
- All 7 dynamic `import("...js?test=XX")` calls fail TSC because TypeScript's module resolver does not handle URL query strings. This pattern is unique to sprint 1352 — no prior test file uses it.
- Fix: Replace `?test=XX` suffix with a plain import path. Each test group already uses separate `describe()` blocks. Bun's `mock.module()` resets between test files automatically; since all groups are in one file, use `mock.restore()` or `beforeEach()`/`afterEach()` hooks with `mock.module()` reset to isolate state instead of query-string deduplication.
- Alternative fix (minimal): Use a type-only `@ts-ignore` comment on each dynamic import line — but this is not preferred as it masks real type errors.

**B-2: TSC TS2488 — destructuring from `T | undefined` without null guard**
- File: `src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts`
- Lines: 140, 198
- Error: `TS2488: Type '[string, number, number, number] | undefined' must have a '[Symbol.iterator]()' method that returns an iterator.`
- Cause: `noUncheckedIndexedAccess` is enabled in tsconfig. Array index access `recordMetricsCalls[0]` returns `[string, number, number, number] | undefined`. Destructuring directly fails.
- Fix: Add a null guard before destructuring:
  ```typescript
  const callArgs = recordMetricsCalls[0];
  expect(callArgs).toBeDefined();
  const [job, durationMs, errorCount, successCount] = callArgs!;
  ```
  Or: `expect(recordMetricsCalls[0]).toBeDefined(); const [job, ...] = recordMetricsCalls[0]!;`

### Non-Blocking (context — not caused by 1352a)

**N-1: 663 test suite regressions pre-date 1352a**
- The `feat/bctc-pull-pdf` merge (commit `7b52678d`) introduced broad test failures (Tasks 084, 1101, 1104, 1124, 1290, 1289, 1296, etc.) that dropped the suite from 7598 pass / 0 fail to ~6918 pass / 663 fail.
- 1352a commit (`9e9e0dc0`) only adds 1 new file and contributes 7 new passing tests.
- These regressions are outside 1352a scope but must be addressed before sprint 1352 can close.

## Merge Status
BLOCKED — 2 blocking TSC issues in the test file. Fix required before merge.

Fixer instructions:
1. Replace all `?test=XX` query-string dynamic imports with plain `.js` imports. Bun's `mock.module()` is registered globally before import — the query-string was used to force Bun to re-evaluate the module per test group. Instead, refactor: move each test group's mocks into `beforeEach()` and import the module once at file top (or once per describe block without the query suffix). See `src/__tests__/1351b-vps-proxy-watchdog-job.test.ts` for the established pattern.
2. Add non-null assertions after `expect(...).toBeDefined()` guards before destructuring `recordMetricsCalls[0]` at lines 140 and 198.
3. Run `bun tsc --noEmit 2>&1 | grep 1352a` — must return 0 lines.
4. Run `bun test src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts` — must show 7/7 pass.
