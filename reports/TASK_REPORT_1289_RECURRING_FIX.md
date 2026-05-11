# Task Report: 1289 (recurring) — DDD Layer Violation Fix

**Date:** 2026-04-22
**Task:** Fix DDD violation in foreign flow validator
**Verification of:** Commit a7c00ca5
**Status:** APPROVED

---

## Issue Found & Fixed

**DDD Violation:** `src/domain/services/market-data/foreignFlowValidator.ts` line 17 imported `WriteForeignFlowItem` from `infrastructure/db/ohlcvForeignFlowStore.ts`.

**Architecture rule broken:** Domain layer MUST NEVER import from infrastructure layer. This breaks the DDD boundary and creates unnecessary coupling.

---

## Resolution

Moved `WriteForeignFlowItem` interface from infrastructure to domain models, then updated all imports:

| File | Action |
|------|--------|
| `src/domain/models/shared-types.ts` | Added `WriteForeignFlowItem` interface (domain source) |
| `src/infrastructure/db/ohlcvForeignFlowStore.ts` | Changed to import type from domain |
| `src/infrastructure/fetchers/foreignFlowFetcher.ts` | Changed to import type from domain |
| `src/interface/mcp/server.ts` | Changed to import type from domain |
| 4 test files | Updated imports to use domain source |

---

## Test Results

| Test Suite | Result |
|-----------|--------|
| Foreign flow tests (1132) | 14/14 PASS |
| Validator integration (1289c) | 6/6 PASS |
| Full regression suite | 6313/6313 PASS, 0 FAIL |
| TypeScript strict | 0 errors |
| DDD compliance (1321) | 4/4 PASS ✓ |

---

## Code Quality Checks

| Check | Status | Notes |
|-------|--------|-------|
| SQL injection | PASS | Parameterized `stmt.run()` in ohlcvForeignFlowStore.ts:42–49 |
| Type safety | PASS | No `any`, no unsafe `!` assertions |
| DDD layers | PASS | 0 infrastructure imports found in domain/ |
| Error handling | PASS | Defensive field coercion with safe defaults |

---

## Functional Verification

The validation logic from commit a7c00ca5 (skip failed validation indices, write valid items only) remains unchanged. This fix is structural only — moving a type to the correct layer to enforce architecture.

**Validation path still:**
1. Domain validator rejects items with missing/invalid fields
2. Server builds `failedIndices` set from validation errors
3. Loops over payload, skips failed indices
4. Extracts matching raw item, coerces fields safely
5. Writes valid items only to `daily_ohlcv` table
6. Non-fatal error handling (logs, doesn't crash)

---

## Verdict

**APPROVED** ✓

All tests pass. DDD compliance verified. Code is architecturally sound. Ready for merge.

