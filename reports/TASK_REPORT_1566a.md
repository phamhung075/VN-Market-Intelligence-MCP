# Task Report 1566a — TDD RED test suite for foreign-flow parse hardening

## Summary

**Verdict:** APPROVED

**Status:** RED phase complete. All 5 assertions fail as expected (stub validators throw "not implemented yet"). Test structure correct, imports valid, no regressions.

## Verification Details

### Changed Files (by line range)

- `src/__tests__/1566-foreign-flow-parse-hardening.test.ts` — NEW: 5 RED test blocks (lines 46–190)
  - Test 1 (lines 46–68): Malformed JSON validation
  - Test 2 (lines 77–88): Truncated payload detection
  - Test 3 (lines 97–119): Schema mismatch (missing required field)
  - Test 4 (lines 128–154): Numeric coercion error reporting
  - Test 5 (lines 163–189): Idempotence verification

- `src/domain/services/market-data/foreignFlowValidator.ts` — NEW: stub with interface definitions (lines 1–82)
  - `ValidationError` interface (lines 20–29)
  - `ValidationResult` interface (lines 34–39)
  - `isForeignFlowUpsertItem()` stub (lines 46–49)
  - `validateForeignFlowPayload()` stub (lines 64–67)
  - `coerceNumericField()` stub (lines 75–81)

- `docs/handoffs/TASK_1566a.md` — handoff + [Developer] Implementation Record

### Test Execution

```
Test Result: 0 pass, 5 fail (RED phase expected)
  ✗ 1. Malformed JSON: rejects unclosed bracket
  ✗ 2. Truncated Payload: detects incomplete JSON
  ✗ 3. Schema Mismatch: rejects missing mandatory field (code)
  ✗ 4. Numeric Coercion Error: reports unparseable numeric field
  ✗ 5. Idempotence: submitting identical valid payload twice

Each assertion fails with: "validateForeignFlowPayload() not implemented yet — task 1566b"
```

Full suite status: **5955 pass, 21 skip, 6 fail** (the 5 RED tests + 1 pre-existing failure)

### TypeScript Check

```
bun tsc --noEmit → 0 errors
```

### DDD Compliance

- `src/domain/services/market-data/foreignFlowValidator.ts` imports `ForeignFlowUpsertItem` using `import type` from `infrastructure/db/vnstockStore.ts` — type-only import, acceptable (no runtime coupling)
- No cross-layer imports beyond type-only declarations
- Domain layer clean ✓

### Test Quality

1. **Malformed JSON test:** Validates rejection of unclosed bracket with error position info
2. **Truncated payload test:** Checks detection of incomplete JSON (network timeout scenario)
3. **Schema mismatch test:** Verifies missing required field error includes item index and field name
4. **Numeric coercion test:** Confirms unparseable numeric field error includes item index, field, and original value
5. **Idempotence test:** Ensures identical payloads yield identical results on retry (circuit breaker validation)

All tests use proper test data builders (`makeValidItem()`) and follow Bun test framework conventions.

### Import Paths

- Test file → validator: `../domain/services/market-data/foreignFlowValidator.js` ✓
- Test file → infrastructure type: `../infrastructure/db/vnstockStore.js` ✓
- Validator → infrastructure type: `../../../infrastructure/db/vnstockStore.js` ✓
- All paths use `.js` extensions (Bun ESM requirement) ✓

### No Regressions

- Core project setup tests: **23 pass, 0 fail** ✓
- Full suite: **5955 pass, 21 skip, 6 fail** (6 fail = 5 new RED tests + 1 pre-existing)
- No previously-passing tests broken ✓

## Next Step

Task 1566b: Implement validator logic to make all 5 assertions GREEN.

---

## [QA] Review Record

**verdict:** APPROVED

**blocking_issues:** []

**non_blocking:** []

**files_confirmed_clean:**
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1566-foreign-flow-parse-hardening.test.ts`
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/market-data/foreignFlowValidator.ts`

**merge_commit:** (pending user approval)
