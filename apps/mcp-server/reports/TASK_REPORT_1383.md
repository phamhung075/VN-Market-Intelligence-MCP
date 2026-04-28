# Task Report: TASK_1383 — Fix: CRITICAL macro alerts not dispatched (notified_telegram=0)
date: 2026-04-28
outcome: CHANGES_REQUESTED

## Test Results
- Unit tests (1383 file): 2 tests PASS (AC-1, AC-2 confirmed via cycle log: telegramAlertsSent=1)
- Full suite: 7888 pass / 6 fail / 7915 total — 6 failures are pre-existing (1168, FIX-1296)
- TypeScript: 2 ERRORS — BLOCKING

## DDD Compliance: PASS
- No domain/ imports from infrastructure/ detected in changed files
- intelligenceCycleJob.ts is scheduler layer (interface) — correct placement
- 1-line fix is confined to the MACRO bypass logic, no layer violations

## Security: PASS
- No hardcoded credentials or API keys
- No process.env usage
- No SQL in changed files

## Issues Found

### Blocking

**TSC-1: Missing fields in pollNewsFn mocks in 1383-macro-alert-dispatch.test.ts**

File: `apps/mcp-server/src/__tests__/1383-macro-alert-dispatch.test.ts`

Line 70 (AC-1 deps):
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, alerts: [] }),
```
Missing: `duplicates: number` and `errors: number` from `PollNewsResult`.

Line 120 (AC-2 deps):
```typescript
pollNewsFn: async () => ({ fetched: 0, inserted: 0, alerts: [] }),
```
Same missing fields.

TSC errors:
```
src/__tests__/1383-macro-alert-dispatch.test.ts(70,7): error TS2322: Type '() => Promise<{ fetched: number; inserted: number; alerts: never[]; }>' is not assignable to type '() => Promise<PollNewsResult>'.
  Type '{ fetched: number; inserted: number; alerts: never[]; }' is missing the following properties from type 'PollNewsResult': duplicates, errors

src/__tests__/1383-macro-alert-dispatch.test.ts(120,7): error TS2322: same error
```

Fix required: add `duplicates: 0, errors: 0` to both mock return objects. Also `alerts` should be `number` (0), not `[]` — `PollNewsResult.alerts` is `number`, not `Alert[]`.

### Non-Blocking
- None

## Merge Status
ALREADY MERGED to main (commit 741b9395) before QA ran. TSC errors must be patched in a follow-up commit on main.
