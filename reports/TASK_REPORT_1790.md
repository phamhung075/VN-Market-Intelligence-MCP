# Task Report: 1790 — alertDigestJob dedup guard fix
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests (1790-alert-digest-dedup.test.ts): 5 passed / 0 failed
- Regression (188-alert-digest.test.ts): 23 passed / 0 failed
- Full suite (on task/1793-pollnews-cooldown): 8342 passed / 30 failed (baseline 8330/30 — +12 pass, 0 new failures)
- TypeScript: 0 errors

## DDD Compliance: PASS
- `alertDigestJob.ts` in `interface/scheduler` — imports from `infrastructure/db/schema.js` permitted (interface → infrastructure allowed)
- No domain layer violations

## Security: PASS
- No hardcoded credentials
- No `process.env` usage (uses `Bun.env` indirectly via imported modules)
- No SQL in the modified scheduler code

## Issues Found
### Blocking
None.

### Non-Blocking
- Branch commit was stacked on `task/1793-pollnews-cooldown` rather than `task/1790-alert-digest-dedup`. Branch naming was inconsistent with commit content. Handled during QA merge by merging the correct branch containing the 1790 fix.

## Changes Verified
- `apps/mcp-server/src/scheduler/alerts/alertDigestJob.ts`:
  - Added `import { getDb } from "../../infrastructure/db/schema.js"`
  - Replaced `if (db && alreadySentToday(db))` with `const effectiveDb = db ?? getDb(); if (alreadySentToday(effectiveDb))`
  - Old `if (db &&` pattern confirmed absent
- `apps/mcp-server/src/__tests__/1790-alert-digest-dedup.test.ts`: 5 tests added

## Merge Status
Merged to main via `merge(1790+1793)` commit `c18fd46f` on 2026-04-30.
Branch `task/1790-alert-digest-dedup` deleted. Branch `task/1793-pollnews-cooldown` deleted.
