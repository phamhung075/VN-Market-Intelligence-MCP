# Task Report: 1295 — SSC fallback regression fix
date: 2026-04-15
outcome: APPROVED

## Test Results

| Scope | Pass | Fail |
|---|---|---|
| `1025-ssc-adf-pdf-discovery.test.ts` (targeted) | 10 | 0 |
| Full suite | 4696 | 27 |
| TypeScript (`bun tsc --noEmit`) | — | 0 errors |

Baseline on `main` for the targeted file: 8 pass / 2 fail (cases 7 and 8 were broken).
After fix: 10 pass / 0 fail. The 2 regressions are resolved.

The 27 full-suite failures are all pre-existing (tasks 137, 278, 1124, 1192, 1282, 1294, 297, OCR e2e, cron-registry count, etc.) — none introduced by this branch.

## Commit Scope

| File | Expected | Actual |
|---|---|---|
| `src/__tests__/1025-ssc-adf-pdf-discovery.test.ts` | modified | modified |
| `TASKS.md` | not required | modified (task status update — acceptable) |
| Production code | no changes | no changes |

The commit modifies only the test file and TASKS.md. No production source files were touched, confirming this is a pure test fix.

## Diff Summary

Two call sites in test cases 7 and 8 changed from:

```
listSscDocuments("VCB", "quarterly", 2025, mockClient)
```

to:

```
listSscDocumentsWithFlag("VCB", "quarterly", 2025, false, mockClient)
```

The `false` flag bypasses the `disableSscPolling` feature gate, ensuring the SSC code path is exercised regardless of runtime config.

## DDD Compliance: PASS

No new imports in `src/domain/`. Pre-existing violation in `intradayAnalyzer.ts` (imports from `infrastructure/`) is out of scope for this task.

## Security: PASS

No `process.env` usage introduced. No SQL changes. No HTTP fetchers added.

## Issues Found

### Blocking
None.

### Non-Blocking
- Pre-existing DDD violation: `src/domain/services/intradayAnalyzer.ts` imports from `infrastructure/`. Not introduced by this task.
- 27 pre-existing test failures unrelated to SSC fallback logic.

## Merge Status

APPROVED — merge to `main`.
