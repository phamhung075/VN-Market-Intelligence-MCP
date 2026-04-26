# Task Report: 1342a — Write failing tests for DB integrity check job (RED phase)
date: 2026-04-26
outcome: APPROVED

## Test Results
- Unit tests (1342a file): 0 pass / 12 fail (all intentional RED — correct)
- Full suite (baseline): 6684 pass / 218 pre-existing fail (non-1342a) + 12 new RED = 230 fail total
- TypeScript: 0 errors (`bun tsc --noEmit` clean)
- Baseline preserved: 6684 >= 6684 requirement met

## Failure Reason Verification
All 12 tests fail with:
  `TypeError: runIntegrityCheck is not a function` (tests 1-8)
  `@ts-expect-error` guard active — module not yet exported (tests 9-11)
  `@ts-expect-error` guard active — module does not exist yet (test 12)
Correct reason: missing exports/modules, NOT import errors or syntax errors.

## Source File Guard
- `git diff main..task/1342a-db-integrity-check-red --name-only` → single file only:
  `apps/mcp-server/src/__tests__/1342a-db-integrity-check.test.ts`
- No production source files modified. PASS.

## DDD Compliance: PASS
- Test file imports infrastructure via dynamic import (`checkpoint.js`, `jobs.js`, `integrityCheckJob.js`) — acceptable for test files
- No domain→infrastructure violations in production code (no production code modified)

## Security: PASS
- No `process.env` usage (uses `Bun.env` on line 211/221)
- No hardcoded credentials or secrets

## Code Quality Notes
- All 12 tests have `@ts-expect-error` guards with descriptive comments — correct pattern
- Injectable `fakeDb` + `sendWorkFn` pattern consistent with existing checkpoint.ts test patterns
- Tests cover: happy path, corruption detection, error handling, skip logic (WAL threshold), alert message content, CRONS key, env override, smoke export check
- Test 10 (ESM cache issue) correctly documents module caching limitation with a comment
- No trivially-passing assertions (all are meaningful behavior specifications)

## Issues Found
### Blocking
(none)

### Non-Blocking
(none)

## Merge Status
- Merged: `b3319d4b merge(1342a): failing tests for DB integrity check job (RED phase)`
- Branch deleted: `task/1342a-db-integrity-check-red` (local, no remote existed)
- Downstream unblocked: 1342b (Todo → ready to start)
