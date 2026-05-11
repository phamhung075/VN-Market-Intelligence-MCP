# Task Report 1512b — compact
changed:
- src/application/usecases/assembleEveningSummary.ts (GlobalSnapshot import, interface field, Step 6b query, spread)
- src/scheduler/eveningSummaryJob.ts (imports, formatEveningSummaryLines export, inline refactor)
- src/__tests__/1512-evening-global-snapshot.test.ts (setupDb schema fix)

bun test (task): 5 pass / 0 fail
bun test (full):  5725 pass / 0 fail (baseline 5721 + 4 new GREEN = expected 5725 — exact match)
tsc: 0 errors
ddd: PASS (application imports infrastructure — permitted by layer contract; scheduler imports application — correct)
security: PASS (no process.env, no hardcoded keys, no raw SQL interpolation)
verdict: APPROVED
