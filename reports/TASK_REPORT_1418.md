# Task Report: 1418 — Fix TSC Errors in 1383 + 1397c Test Files (QA 2026-04-29)
# (Historical: original 1418 = Diacritics Wave 6 signed off 2026-04-18, see below)

date: 2026-04-29
outcome: APPROVED

## QA Sign-off (2026-04-29)

### Test Results
- Targeted (1383): 10 passed / 0 failed
- Targeted (1397c): 5 passed / 0 failed
- Full suite: 8076 passed / 0 failed / 38 skipped
- TypeScript: 0 errors

### What Was Fixed by Developer (commit 4a2a30a2)
- `1383-macro-alert-dispatch.test.ts`: added missing `duplicates`/`errors` fields to `PollNewsResult` mock objects
- `1397c-vn-index-refresh.test.ts`: added non-null assertion on `_storeCalls[0]`

### Additional QA Fixes Applied
- Added missing `afterEach` import to `026-hose-prices.test.ts` and `027-hnx-prices.test.ts`
- Added missing `beforeEach, afterEach` imports to `1027-inline-schema-removal.test.ts`
  (these 3 files were modified by 1419 but had the imports omitted, causing 4 TSC errors)

### DDD Compliance: PASS
### Security: PASS
### Merge Status: APPROVED — committed 2026-04-29

---

# Historical Record: 1418 — Diacritics Wave 6 (original)

date: 2026-04-18
outcome: APPROVED
sprint: 149
merge_commit: 277f4df (task/1418-diacritics-wave6 → main)

---

## Test Results

| Suite | Pass | Fail |
|-------|------|------|
| 1418-diacritics-wave6.test.ts (46 assertions) | 46 | 0 |
| 190-export-snapshot.test.ts | 20 | 0 |
| 223-target-allocation.test.ts | 17 | 0 |
| Full suite | 5362 | 0 |
| TypeScript (bun tsc --noEmit) | clean | — |

Note: Bun 1.3.11 emits a known C++ crash after test run completes — occurs after "Ran 5383 tests across 405 files" reporting, does not affect test validity (0 fail confirmed before crash).

---

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| 1418-diacritics-wave6.test.ts 46/46 GREEN | PASS |
| Full suite 5316+ pass, 0 fail | PASS (5362 pass) |
| bun tsc --noEmit clean | PASS |
| No .describe() / server.tool schema strings changed | PASS |
| exportPortfolioSnapshot.ts line 211 → accented sentinel | PASS |
| 190-export-snapshot.test.ts line 254 updated atomically | PASS |

---

## DDD Compliance: PASS

`interface/` tools import `infrastructure/` — correct per layer rules (interface layer may use infrastructure).
`application/usecases/exportPortfolioSnapshot.ts` — no upward violations.
No `domain/` file imports `infrastructure/` or `application/`.

---

## Security: PASS

No `process.env` in any modified file. No hardcoded credentials. No SQL interpolation introduced.

---

## Files Verified

| File | Check |
|------|-------|
| `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1418-diacritics-wave6.test.ts` | NEW — 46 assertions, all GREEN |
| `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/customAlertTools.ts` | 3 strings fixed |
| `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/changelogTools.ts` | 4 strings fixed |
| `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/tools/targetAllocationTools.ts` | 12 strings fixed |
| `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/exportPortfolioSnapshot.ts` | JSDoc line 63 + sentinel line 211 fixed |
| `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/190-export-snapshot.test.ts` | line 254 updated atomically with sentinel |
| `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/223-target-allocation.test.ts` | lines 257+288 regex updated |

---

## Issues Found

### Blocking
none

### Non-Blocking
- `190-export-snapshot.test.ts` line 12 is a JSDoc comment still containing `"(khong the ghi file)"` — comment only, not an assertion, no test impact.

---

## Merge Status

Already merged: `277f4df` — `chore: merge task/1418-diacritics-wave6 → main (sprint 149)`
Branch deleted. TASKS.md updated.
