# Task Report 1497 — compact
date: 2026-04-19
outcome: CHANGES_REQUESTED

changed: [src/__tests__/1497-sbv-rates-fix.test.ts (NEW, RED only)]
missing: src/infrastructure/fetchers/sbv.ts (fix not applied), src/infrastructure/db/schema.ts (+4 cols not applied), src/interface/mcp/server.ts (payload type unchanged)

bun test src/__tests__/1497-sbv-rates-fix.test.ts: 1 pass / 2 fail
bun test src/__tests__/028-sbv-rates.test.ts: 14 pass / 0 fail
tsc: not run (implementation absent — no point)
ddd: N/A (no implementation to scan)

verdict: CHANGES_REQUESTED
blocking_issues:
  - src/infrastructure/fetchers/sbv.ts:53 — `??` never replaced with `||`; DEFAULT_OVERNIGHT_RATE still returns NaN for empty string
  - src/infrastructure/fetchers/sbv.ts:57 — same `??` bug for DEFAULT_REFINANCING_RATE
  - src/infrastructure/fetchers/sbv.ts — SbvMacroSnapshot +4 fields not added (claimed in review request)
  - src/infrastructure/db/schema.ts — +4 cols + ALTER TABLE migration not added
  - src/interface/mcp/server.ts:891-917 — payload type + finalSnapshot not updated

summary: Branch is RED-only. Single commit `test(1497): RED — SBV rates non-zero test`. No GREEN commit exists. `git diff main...task/1497-sbv-rates-fix` shows only test file added — zero production code changed.

### Fix — 2026-04-19
- **Issue**: All 5 blocking issues from CHANGES_REQUESTED
- **Root cause**: GREEN implementation never committed; ?? vs || bug; +4 schema fields not added
- **Fix**:
  - `src/infrastructure/fetchers/sbv.ts:53,57` — `??` → `||` for SBV_OVERNIGHT_RATE + SBV_REFINANCING_RATE
  - `src/infrastructure/fetchers/sbv.ts` — SbvMacroSnapshot +4 fields; DEFAULT_ constants for 4 new rates; fetchSbvRates builds full snapshot; storeSbvSnapshot writes all 8 cols
  - `src/infrastructure/db/schema.ts` — +4 cols in sbv_rates + sbv_rates_history DDL; idempotent ALTER TABLE loop for existing prod DBs
  - `src/interface/mcp/server.ts:891-917` — payload type + finalSnapshot include 4 new optional fields
  - `src/__tests__/1497-sbv-rates-fix.test.ts` — currentSbvDefault uses `||` (GREEN helper)
  - `src/__tests__/028-sbv-rates.test.ts` — setupTestDb + SBV-10/11 fixtures updated for new interface
- **Tests added**: None (existing tests updated to match new interface)
- **Verified**: `bun test` PASS (17/17) | `bun tsc --noEmit` PASS

### Fix — 2026-04-19
- **Issue**: schema.ts on branch task/1497-sbv-rates-fix missing 1489 tracked_indicators dedup block (stale branch pre-merge)
- **Root cause**: branch created before task 1489 merged to main; schema.ts lacked hour_bucket column, UNIQUE constraint, trigger, and test-cleanup DELETE; merge also left duplicate property artifacts in SbvMacroSnapshot interface, object literals in sbv.ts/server.ts/028 test fixtures, and a RED-phase 1497 test file (add/add conflict)
- **Fix**: git merge main; resolved all conflicts keeping both 1489 and 1497 changes; removed 6 sets of merge-artifact duplicate object keys; corrected persist block arg count (12→9); replaced stale RED test file with GREEN 10-test suite
- **Tests added**: None
- **Verified**: `bun test` 1489=5/5, 1497=10/10, 028=14/14 PASS | `bun tsc --noEmit` PASS
