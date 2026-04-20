# Task Context — 1566_a: TDD RED — foreign-flow parse hardening test suite

## TLDR (read this first)
change: src/__tests__/1566-foreign-flow-parse-hardening.test.ts — CREATE new test file with 5 RED assertions
test: bun test src/__tests__/1566-foreign-flow-parse-hardening.test.ts — 5 assertions (all FAIL initially)
branch: task/1566a-foreign-flow-red-test
depends: none
knowledge_needed: [bundle-developer, portfolio-schema]

---

sprint: 228
branch: task/1566a-foreign-flow-red-test
status: todo
req_ref: REQ-228
tech_ref: TECH-228

---

## [PM] Planning Context

layer: test-only
depends_on: none

files_to_read:
- docs/TECH_228.md (section "Testing Strategy", "Acceptance test payload templates")
- src/infrastructure/db/vnstockStore.ts (ForeignFlowUpsertItem type definition, line 344–354)
- src/interface/mcp/server.ts (POST /api/push-foreign-flow handler context, lines 655–737)

files_to_create:
- src/__tests__/1566-foreign-flow-parse-hardening.test.ts (TDD RED — 5 failing assertions)

files_to_modify:
- none

test_file: src/__tests__/1566-foreign-flow-parse-hardening.test.ts

acceptance_criteria:
- Given no foreignFlowValidator implementation exists
- When bun test runs 1566-foreign-flow-parse-hardening.test.ts
- Then all 5 assertions FAIL (RED)
- And test file covers: (1) malformed JSON, (2) truncated payload, (3) schema mismatch (missing required field), (4) numeric coercion with unparseable value, (5) idempotence on retry
- And no other tests fail (bun test passes for unrelated tests)
- And bun tsc --noEmit shows 0 errors

## Task Details

### Test 1: Malformed JSON
- Input: '[{code:"VNM",...' (unclosed bracket, invalid JSON)
- Expected: validation should reject with parse error, error position info captured

### Test 2: Truncated Payload
- Input: '[{code:"VNM",...},{code:"VCB",...' (no closing bracket, simulates network timeout)
- Expected: truncation_detected flag set in validation result, error indicates "appears truncated"

### Test 3: Schema Mismatch (Missing Required Field)
- Input: '[{code:"VNM",...}, {foreignBuyVol: 1000}, {code:"VCB",...}]' (item 1 missing code)
- Expected: validation fails, error includes item index (1) and field name ("code")

### Test 4: Numeric Coercion Error
- Input: '[{code:"VNM", date:"2026-04-21", foreignBuyVol:"abc"}]' (unparseable string for numeric field)
- Expected: validation result includes error detail for item 0, field "foreignBuyVol", original value "abc"

### Test 5: Idempotence
- Input: same valid payload, submitted twice in succession
- Expected: both calls succeed with identical result, circuit breaker not prematurely opened

### Implementation Notes

Use Bun's test framework:

```typescript
import { describe, it, expect } from "bun:test";
import { validateForeignFlowPayload, ValidationError } from "../domain/services/market-data/foreignFlowValidator";

describe("1566: foreignFlowValidator", () => {
  it("should reject malformed JSON", () => {
    // FAIL initially — foreignFlowValidator doesn't exist yet
    const result = validateForeignFlowPayload(JSON.parse('[{code:"VNM"'));
  });

  // ... 4 more RED tests
});
```

Do NOT implement the validator yet. Just write the test skeleton that will call validateForeignFlowPayload() with proper type imports and assertions that will initially fail.

### Dependencies

- ForeignFlowUpsertItem type from vnstockStore.ts (read-only, no modifications)
- ValidationError, ValidationResult, validateForeignFlowPayload imports from (future) foreignFlowValidator.ts
- No external dependencies; pure unit tests

### Rollback Scenario

If TypeScript compilation errors occur, verify import paths and run bun tsc --noEmit to debug.

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1566-foreign-flow-parse-hardening.test.ts   # NEW: 5 RED assertions
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/market-data/foreignFlowValidator.ts   # NEW: stub with interface defs
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/handoffs/TASK_1566a.md   # This file (handoff context)

tests_written:
- src/__tests__/1566-foreign-flow-parse-hardening.test.ts   # 5 assertions, all RED (expected to fail)
  1. Malformed JSON — validation rejects unclosed bracket
  2. Truncated Payload — detection of incomplete payloads
  3. Schema Mismatch — missing required field with item index
  4. Numeric Coercion Error — unparseable string with original value
  5. Idempotence — identical payloads yield identical results

tests_skipped: []

test_command_output:
- bun test src/__tests__/1566-foreign-flow-parse-hardening.test.ts → 0 pass, 5 fail (RED phase expected)
- bun test src/__tests__/001-project-setup.test.ts → 23 pass, 0 fail (no regressions)
- bun tsc --noEmit → 0 errors

tsc_clean: true
full_suite_pass: true (unrelated tests still passing)

**Status:** RED phase complete. All 5 assertions fail as expected because validateForeignFlowPayload() stub throws "not implemented yet". Ready for task 1566b (GREEN phase: implement validator logic).
