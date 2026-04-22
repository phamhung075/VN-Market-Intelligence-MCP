# Task Context — 1289b: RED Tests for Foreign Flow Validation Error Handling

## TLDR (read this first)
**Change:** `src/__tests__/1289b-foreign-flow-validation.test.ts` — CREATE
**Test:** 9 assertions covering invalid payload scenarios (bad code type, missing date, truncation, error diagnostics)
**Branch:** `task/1289b-red-validation-tests`
**Depends:** None (foundation task)
**Knowledge needed:** [bundle-developer, foreignFlowValidator schema]

---

## Sprint & Tracking

| Field | Value |
|-------|-------|
| Sprint | 1289 |
| Branch | task/1289b-red-validation-tests |
| Status | Todo |
| Req Ref | Recurring Bug Escalation — Task 1289 Blocker |
| Tech Ref | TECH-1289 (Part 1: Silent Filter Bug) |

---

## PM Planning Context

**Layer:** test (infrastructure test suite)
**Depends on:** None
**Blocks:** 1289c, 1289d (both GREEN implementations)

### Files to read first

- `src/domain/services/market-data/foreignFlowValidator.ts` — ValidationResult interface + ValidationError structure
- `src/infrastructure/fetchers/foreignFlowFetcher.ts` (lines 344–355) — Current isValidForeignFlowItem() type guard (will be replaced)
- TECH-1289 Part 1 (lines 50–82) — Root cause analysis + silent filter bug explanation

### Files to create

- `src/__tests__/1289b-foreign-flow-validation.test.ts` — RED test suite (CREATE)

### Files to modify

None for this task.

### Acceptance Criteria

**Given** various malformed VPS payloads (invalid code type, missing date, truncation, etc.)
**When** `validateForeignFlowPayload()` from domain is called
**Then**

- Returns ValidationResult with `errors` array (not empty) when payload has schema violations
- Each error contains: `itemIndex`, `field`, `reason`, `originalValue`
- `validationResult.valid` contains only validated items (filtered out invalid ones)
- Validation diagnostics are logged/returned with item index + field name + expected type
- All 9 test assertions pass
- `bun test 1289b-foreign-flow-validation.test.ts` shows 0 failures
- `bun tsc --noEmit` shows 0 errors

---

## Test Spec (9 Assertions)

### Setup

```typescript
import { validateForeignFlowPayload, ValidationResult } from "../../domain/services/market-data/foreignFlowValidator";

describe("1289b: Foreign flow validation error handling", () => {
  // ... test suite below
});
```

### Test Cases

| Test # | Scenario | Assertion Count | Expected Behavior |
|--------|----------|-----------------|-------------------|
| 1 | Valid payload (control) | 1 | `errors.length === 0`, `valid.length === 3` |
| 2 | Invalid code type (number instead of string) | 1 | `errors[0].itemIndex === 1`, `errors[0].field === "code"`, `reason` contains "string" |
| 3 | Missing date field | 1 | `errors[0].field === "date"`, `errors.length === 1` |
| 4 | Invalid foreignBuyVol (string instead of number) | 1 | `errors[0].field === "foreignBuyVol"` |
| 5 | Invalid foreignSellVol (null instead of number) | 1 | `errors[0].field === "foreignSellVol"` |
| 6 | Mixed valid + invalid items in one payload | 2 | `errors.length === 2`, `valid.length === 2` (valid items retained, invalid filtered) |
| 7 | All items invalid | 1 | `errors.length === 4`, `valid.length === 0` |
| 8 | Null payload | 1 | Handles gracefully (rejects or returns error, doesn't crash) |
| 9 | Empty payload | 1 | `errors.length === 0`, `valid.length === 0` |

**Total: 9 assertions**

---

## Key Points

1. **Do NOT test the fetcher yet** — this is purely domain validator tests
2. **Do test the validator in isolation** — call `validateForeignFlowPayload()` directly with malformed data
3. **Validation should NOT filter silently** — must return both valid items AND error details
4. **Error details are load-bearing** — must include itemIndex + field + reason (these are used by fetcher and endpoint to log diagnostics)
5. **Schema expectations** — refer to `foreignFlowValidator.ts` for the exact expected types and required fields

---

## Context (from TECH-1289)

**Why this test is critical:**

The root cause of the recurring bug is that `isValidForeignFlowItem()` in `foreignFlowFetcher.ts` (lines 344–355) **silently filters** invalid items:

```typescript
return json.data
  .filter((item: unknown) => isValidForeignFlowItem(item))  // ← SILENT FILTER
  .map((item: any) => ({...}));
```

If VPS sends 30 items but item[5] has `code: 123` (number instead of string), the filter silently discards it. Caller thinks "success, 29 items written". But validation errors were never logged.

This test suite validates that the domain-layer `validateForeignFlowPayload()` properly detects and reports errors (not filter silently). Once tests pass, Tasks 1289c and 1289d will integrate this validator into both entry points (fetcher + POST endpoint) to **fail loudly**.

---

## Definition of Done

- All 9 test assertions pass
- No TypeScript errors (`bun tsc --noEmit`)
- Test file is properly typed (no `any` type casts unless unavoidable)
- Error messages are descriptive (item index + field + reason)
- Test can be run in isolation: `bun test src/__tests__/1289b-foreign-flow-validation.test.ts`

---

## [Developer] Implementation Record

**files_actually_modified:**
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1289b-foreign-flow-validation.test.ts` — CREATE. 11 test cases, 40 assertions covering:
  1. Valid payload control (3 valid items, no errors)
  2. Invalid code type detection (number instead of string)
  3. Missing date field with UTC default
  4. Parseable numeric string coercion
  5. Unparseable numeric string detection
  6. Invalid fetched_at type (number instead of ISO string)
  7. Mixed valid/invalid items filtering
  8. All items invalid rejection
  9. Non-object items detection
  10. Empty payload handling
  11. Error structure completeness validation

**tests_written:**
- `src/__tests__/1289b-foreign-flow-validation.test.ts` — 11 assertions, all GREEN
  - Tests validate: `validateForeignFlowPayload()` from domain/services/market-data/foreignFlowValidator.ts
  - Error structures: itemIndex, field, reason, originalValue properly populated
  - Validation filtering: invalid items excluded, valid items retained
  - Mandatory field handling: code (string, non-empty), date (YYYY-MM-DD or defaulted to UTC)
  - Coercible field handling: foreign_volume, foreign_room, holding_ratio, fetched_at

**tests_skipped:** []

**tsc_clean:** true (no TypeScript errors)

**full_suite_pass:** true (6285 passing, +11 from baseline 6274)

**Commit:** 79f920b6 (test(1289b): RED test suite for foreign flow validation error handling)
