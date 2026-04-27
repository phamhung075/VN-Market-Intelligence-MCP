# Handoff: TASK 1352b — Fixer (TSC Blocking Issues)

## Status
CHANGES_REQUESTED by QA

## Context
1352b test file (`src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts`) passes all 5 tests at runtime but has 4 TSC errors — 2 new (blocking), 2 same-pattern as pre-existing 1352a B-1.

## Blocking Issues to Fix

### B-1: `cacheStore` not in `runForeignFlowFetcherJob` overrides type (2 errors, lines 145 + 167)

**File to change:** `apps/mcp-server/src/scheduler/market-data/foreignFlowFetcherJob.ts`

Current overrides type (lines 58-61):
```typescript
overrides?: {
  now?: () => Date;
  fetchFn?: (url: string, opts?: any) => Promise<Response>;
},
```

Fix — add `cacheStore`:
```typescript
overrides?: {
  now?: () => Date;
  fetchFn?: (url: string, opts?: any) => Promise<Response>;
  cacheStore?: { get: (key: string) => unknown };
},
```

The `CacheStore` interface is defined in `src/infrastructure/fetchers/foreignFlowFetcher.ts` — you may import it instead of inlining a structural type. The key point: `cacheStore` must appear in the overrides type so TypeScript accepts passing it in Cases 2 and 3.

### B-2: `?test=C4` and `?test=C5` query-string imports fail TypeScript (2 errors, lines 200 + 247)

**File to change:** `apps/mcp-server/src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts`

Line 199-200:
```typescript
// BEFORE:
const { runForeignFlowFetcherJob } = await import(
  "../scheduler/market-data/foreignFlowFetcherJob.js?test=C4"
);
// AFTER:
const { runForeignFlowFetcherJob } = await import(
  "../scheduler/market-data/foreignFlowFetcherJob.js"
);
```

Line 246-247:
```typescript
// BEFORE:
const { runForeignFlowFetcherJobCron } = await import(
  "../scheduler/market-data/foreignFlowFetcherJob.js?test=C5"
);
// AFTER:
const { runForeignFlowFetcherJobCron } = await import(
  "../scheduler/market-data/foreignFlowFetcherJob.js"
);
```

The `mock.module("../infrastructure/fetchers/foreignFlowFetcher.js", ...)` calls before these imports are sufficient for mock isolation — the `?test=XX` cache-bust suffix is redundant.

## Verification After Fix

```bash
cd apps/mcp-server
bun tsc --noEmit 2>&1 | grep "1352b"   # must return 0 lines
bun test src/__tests__/1352b-foreign-flow-fetcher-job-wrapper.test.ts  # must show 5/5 pass
```

## Pre-existing Context (do NOT fix in this task)
- 9 TSC errors in `1352a-scheduler-job-wrappers-macro-marketscan.test.ts` (handled separately in TASK_1352a_fixer.md)
- 664 suite failures from `feat/bctc-pull-pdf` merge (pre-existing, separate sprint)
