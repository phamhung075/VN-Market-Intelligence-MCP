# Task Report: 1346c-a — Alert Quality: Volume Spike + Sentiment Negation + VJC Alias
date: 2026-04-27
outcome: CHANGES_REQUESTED

## Test Results
- Unit tests (1320, 1321, 1322): 14 passed / 0 failed
- Full suite (worktree): 7262 passed / 106 failed / 21 skipped
  - All 106 failures are pre-existing (LanceDB, embedding pipeline, Sprint 1338 doc
    invariants, Task 105 evening summary, Task 1300b memory tools)
  - Baseline comparison: 1346a report = 7235 pass / 171 fail → this branch has MORE
    passing tests and FEWER failures → zero regressions
- TypeScript: 2 errors (BLOCKING — see issues below)

## DDD Compliance: PASS
- `sentimentClassifier.ts` — zero imports from infrastructure/ or application/ (confirmed by grep)
- `stockAliases.ts` — zero imports from infrastructure/ or application/ (confirmed by grep)
- `scanMarket.ts` is in application/usecases/ — correct layer for orchestration

## Security: PASS
- No `process.env` usage in any modified file
- No hardcoded credentials, secrets, or API keys
- SQL in `getAvgVolumeSync` uses parameterized queries (? placeholders)
- No PDF path traversal concern (domain-only changes)

## Issues Found

### Blocking

**scanMarket.ts:130 — TS2345: `string | undefined` not assignable to `string`**

```
src/application/usecases/scanMarket.ts(130,18): error TS2345:
  Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
  Type 'undefined' is not assignable to type 'string'.
```

Root cause: `new Date().toISOString().split("T")[0]` returns `string | undefined`
in strict TypeScript (array index access). The `??` on the right side of the
assignment does not help because TypeScript types the entire RHS expression as
`string | undefined`, making `today` typed as `string | undefined`.

Fix: replace the split expression to guarantee `string`:
```typescript
// Line 115 — replace:
const today = todayUtc ?? new Date().toISOString().split("T")[0];

// With:
const today = todayUtc ?? (new Date().toISOString().split("T")[0] ?? "");
```

Or equivalently:
```typescript
const today = todayUtc ?? new Date().toISOString().substring(0, 10);
```

`String.prototype.substring(0, 10)` always returns `string`, never `undefined`.

**scanMarket.ts:139 — TS2345: same root cause, second `.get()` call**

Same fix resolves both: once `today` is typed as `string` (not `string | undefined`),
both `.get(code, today, HISTORY_LIMIT)` and `.get(code, today)` will type-check.

### Non-Blocking
None.

## Merge Status
BLOCKED — TypeScript must be clean before merge.
Branch: task/1346c-a-alert-quality-domain (worktree: agent-a5e75f73)
