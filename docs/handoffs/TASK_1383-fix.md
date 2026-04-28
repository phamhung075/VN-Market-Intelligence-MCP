# TASK_1383 — Fixer Handoff: TSC errors in test file

## Status: CHANGES_REQUESTED by QA

## Blocking Issue: 2 TSC type errors in test mock

File: `apps/mcp-server/src/__tests__/1383-macro-alert-dispatch.test.ts`

### Error 1 — Line 70 (AC-1 pollNewsFn mock)

Current:
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, alerts: [] }),
```

Required fix:
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, alerts: 0, duplicates: 0, errors: 0 }),
```

### Error 2 — Line 120 (AC-2 pollNewsFn mock)

Current:
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, alerts: [] }),
```

Required fix:
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, alerts: 0, duplicates: 0, errors: 0 }),
```

### Why

`PollNewsResult` interface (apps/mcp-server/src/application/usecases/pollNews.ts line 64) requires:
- `fetched: number`
- `inserted: number`
- `duplicates: number`  ← MISSING in both mocks
- `alerts: number`      ← was `[]` (never[]) in both mocks — must be number 0
- `errors: number`      ← MISSING in both mocks

## Verification

After fix:
1. `bun tsc --noEmit` must return 0 errors
2. `bun test --testPathPattern="1383"` — both AC-1 and AC-2 must pass
3. Full suite baseline must stay >= 7915 tests

## No other changes needed

The runtime fix (intelligenceCycleJob.ts line ~949) is correct and already on main.
The 1285 and 1294 test updates are correct.
Only the 2 mock objects in 1383-macro-alert-dispatch.test.ts need patching.
