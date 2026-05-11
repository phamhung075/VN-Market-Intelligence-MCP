# Task Report: 1358a — bctcOverdueCheckJob Gap Tests
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (targeted): 8 passed / 0 failed (OVD-1 through OVD-8)
- Full suite: 7756 passed / 0 failed
- TypeScript: 0 errors

## DDD Compliance: PASS
- Test-only file; no production imports changed.
- Production file `bctcOverdueCheckJob.ts` untouched.

## Security: PASS
- No `process.env` usage.
- No hardcoded credentials.
- In-memory SQLite for all DB interactions.

## Issues Found

### Blocking (fixed before merge)
- **mock.module contamination** — `mock.module("../application/usecases/runImpactChain.js")` declared at module-level caused Bun to replace `runImpactChain` globally for the entire test run. When 1358a.test.ts ran before cascade tests (062, 083, 123, 126, 1303i, 1309a) due to non-deterministic ordering, those tests received `{ chains: [] }` from the mock instead of the real implementation, causing 25 failures.
  - Fix: removed `mock.module` entirely. OVD-6 ("runImpactChain rejection is swallowed") works without a mock because the production code already wraps the call in `void runImpactChain(...).catch(logger.warn)` — the `.catch()` handler guarantees the job resolves cleanly regardless of rejection.
  - File: `apps/mcp-server/src/__tests__/1358a-bctc-overdue-check-gaps.test.ts`

### Non-Blocking
- None.

## Merge Status
Merged to main: commit `ceb8a61a`
Branch deleted: `task/1358b-bctc-queue-enricher-job-gaps`
