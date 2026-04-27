# Task Report: 1352b — Scheduler Job Wrapper Tests: foreignFlowFetcherJob
date: 2026-04-27
outcome: CHANGES_REQUESTED

## Test Results
- Unit tests (targeted, 5 cases): 5 passed / 0 failed [151ms]
- Full suite: 6918 pass / 664 fail
- TypeScript: 4 new errors introduced by 1352b (2 blocking new, 2 same-pattern as 1352a pre-existing)

## DDD Compliance: PASS
Only `src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts` added (267 lines, 1 file).
No domain layer touched. Test imports from `infrastructure/` and `domain/models/` — permitted in `__tests__/`.

## Security: PASS
No `process.env` usage, no hardcoded credentials, no API keys, no raw SQL.

## Issues Found

### Blocking

**B-1: TS2353 — `cacheStore` not declared in `runForeignFlowFetcherJob` overrides type**
- File: `src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts`
- Lines: 145, 167
- Error: `TS2353: Object literal may only specify known properties, and 'cacheStore' does not exist in type '{ now?: () => Date; fetchFn?: (url: string, opts?: any) => Promise<Response>; }'.`
- Root cause: `runForeignFlowFetcherJob` (in `foreignFlowFetcherJob.ts` lines 57-62) declares overrides as `{ now?, fetchFn? }` only. The test passes `cacheStore` which gets forwarded to `fetchForeignFlowWithFallback` (which does accept `cacheStore`). The production function's overrides type must be widened to include `cacheStore`.
- Fix: In `apps/mcp-server/src/scheduler/market-data/foreignFlowFetcherJob.ts`, add `cacheStore?` to the overrides parameter type of `runForeignFlowFetcherJob`:
  ```typescript
  export async function runForeignFlowFetcherJob(
    overrides?: {
      now?: () => Date;
      fetchFn?: (url: string, opts?: any) => Promise<Response>;
      cacheStore?: { get: (key: string) => unknown };
    },
  ): Promise<ForeignFlowFetcherJobResult>
  ```
  The `CacheStore` type is defined in `foreignFlowFetcher.ts` — import it or use a compatible structural type.

**B-2: TS2307 — `?test=C4` and `?test=C5` query-string cache-busting imports fail TypeScript**
- File: `src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts`
- Lines: 200, 247
- Error: `TS2307: Cannot find module '../scheduler/market-data/foreignFlowFetcherJob.js?test=C4' or its corresponding type declarations.`
- This is the same pattern as B-1 from the 1352a CHANGES_REQUESTED report (lines 89, 135, 185, 242, 312, 366, 414 in 1352a). Both 1352a and 1352b use `?test=XX` cache-busting which TypeScript's module resolver cannot handle.
- Fix: Same as 1352a B-1 fix — replace `?test=XX` dynamic imports with plain `.js` imports. Use `mock.module()` reset in `beforeEach()`/`afterEach()` hooks to isolate mock state instead of query-string deduplication. See established pattern in `src/__tests__/1351b-vps-proxy-watchdog-job.test.ts`.

### Non-Blocking (pre-existing, not caused by 1352b)

**N-1: 664 suite failures — pre-date 1352b**
- The `feat/bctc-pull-pdf` merge (commit `7b52678d`) remains the source of 663-664 failures.
- 1352b commit (`132d035f`) adds 1 file only. Zero 1352b-named tests appear in the fail list.
- Baseline: same as 1352a QA (6918 pass). 1352b added 5 passing tests (now included in 6918).
- Full suite crashes via Bun OOM (RSS ~1.4-2.3GB, C++ panic) before final summary line — confirmed by multiple runs. Suite count 6918/664 extracted from pre-crash output.

**N-2: TS2307 pre-existing errors in 1352a test file (9 errors from 1352a — already blocking that task)**
- `src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts` has 9 TSC errors already reported as blocking in TASK_REPORT_1352a.md. These are not introduced by 1352b.

## Merge Status
BLOCKED — 2 blocking TSC issues.

### Fixer Instructions

**For B-1 (production source file fix):**
1. Open `apps/mcp-server/src/scheduler/market-data/foreignFlowFetcherJob.ts`
2. Widen the `runForeignFlowFetcherJob` overrides type to include `cacheStore`:
   - Import or inline the `CacheStore` type from `foreignFlowFetcher.ts` (or use structural type: `{ get: (key: string) => unknown }`)
   - Add `cacheStore?: CacheStore` to the overrides parameter type at line 58
3. Run `bun tsc --noEmit 2>&1 | grep "1352b" | grep "TS2353"` — must return 0 lines

**For B-2 (same pattern as 1352a B-1):**
1. In the 1352b test file, replace:
   - Line 199: `import("../scheduler/market-data/foreignFlowFetcherJob.js?test=C4")` → `import("../scheduler/market-data/foreignFlowFetcherJob.js")`
   - Line 246: `import("../scheduler/market-data/foreignFlowFetcherJob.js?test=C5")` → `import("../scheduler/market-data/foreignFlowFetcherJob.js")`
2. Verify mock isolation still works by checking that Case 4 and Case 5 each call `mock.module(...)` before the import — since `mock.module()` is hoisted/registered before the dynamic import executes, the mock will apply. The `?test=XX` suffix was adding cache-busting redundancy, not the actual mock mechanism.
3. Run `bun tsc --noEmit 2>&1 | grep "1352b"` — must return 0 lines
4. Run `bun test src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts` — must show 5/5 pass

**Verify after both fixes:**
- `bun tsc --noEmit 2>&1 | grep "1352b"` — 0 lines
- `bun test src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts` — 5/5 pass
- No new source file regressions beyond the pre-existing 664 baseline
