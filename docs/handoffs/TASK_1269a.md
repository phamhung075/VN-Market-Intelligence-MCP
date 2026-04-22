# TASK_1269a — RED Test Suite: Macro Direction Label Bug

## Summary

Write failing test cases that EXPOSE the hardcoded direction label bug in `classifyDeviation()`.

**Status**: RED (test fails until TASK_1269b is implemented)

**Depends on**: TASK_1269b

**DDD Layer**: test coverage for domain/services/macroThresholds.ts

---

## [Architect] Brownfield Findings

**File**: `src/domain/services/macroThresholds.ts`

**Status**: Implementation already correct on main (commit 8db31f9). Test 1326 exists and passes. However, test coverage is minimal (only 1 test file). This sprint adds comprehensive RED/GREEN tests to validate the fix under all direction scenarios.

**Interfaces found**:
- `MacroStats` (line 24) — input type, reused
- `MacroDeviation` (line 44) — output type, reused
- `DeviationLevel` (line 38) — enum-like, reused
- `DeviationDirection` (line 41) — enum-like, reused

**Decisions**:
- Use direction-aware label selection (already implemented at line 158)
- Add comprehensive test coverage (6 cases) to prevent regression
- Test file: `src/__tests__/1269-macro-direction-label.test.ts` (NEW)

**brownfield_scan_clean**: true

---

## The Bug

Current implementation has hardcoded direction label in LEVEL_VI dictionary:
- Line 72: `elevated: "cao hơn TB"` (always "above average")
- Line 79: `elevated: "thấp hơn TB"` (below average — correct)

**Failure scenario**: When `zScore = -1.65` (BEARISH/below mean):
- Expected: label must say "thấp hơn TB" (below)
- Actual (BUG): label says "cao hơn TB" (above) — contradicts the data

---

## Test Design

File: `src/__tests__/1269-macro-direction-label.test.ts`

Create 6 test cases (TC-1 to TC-6) testing all 3 levels × 2 directions:

### TC-1: Elevated Above
```
current: 26351, mean: 26333, stdDev: 12
zScore: +1.5 → elevated, above
expected_label: "cao hơn TB" ✓
```

### TC-2: Elevated Below (FAILS without fix)
```
current: 26315, mean: 26333, stdDev: 12
zScore: -1.5 → elevated, below
expected_label: "thấp hơn TB"
actual_label (BUG): "cao hơn TB" ✗
```

### TC-3: High Above
```
current: 26364, mean: 26333, stdDev: 12
zScore: +2.58 → high, above
expected_label: "cao bất thường" ✓
```

### TC-4: High Below (FAILS without fix)
```
current: 26302, mean: 26333, stdDev: 12
zScore: -2.58 → high, below
expected_label: "thấp bất thường"
actual_label (BUG): "cao bất thường" ✗
```

### TC-5: Extreme Above
```
current: 26375, mean: 26333, stdDev: 12
zScore: +3.5 → extreme, above
expected_label: "cực cao" ✓
```

### TC-6: Extreme Below (FAILS without fix)
```
current: 26291, mean: 26333, stdDev: 12
zScore: -3.5 → extreme, below
expected_label: "cực thấp"
actual_label (BUG): "cực cao" ✗
```

---

## Implementation Notes

- Use USD/VND as test indicator (supports both +/- sigma without domain issues)
- All test cases must explicitly check: `result.summary.includes(expected_label)`
- Tests TC-2, TC-4, TC-6 will FAIL without the fix in TASK_1269b
- Run: `bun test src/__tests__/1269-macro-direction-label.test.ts`

---

## Acceptance Criteria

- [ ] Test file created with 6 test cases (TC-1 to TC-6)
- [ ] TC-1, TC-3, TC-5 pass (above-mean cases)
- [ ] TC-2, TC-4, TC-6 FAIL (below-mean cases expose the bug)
- [ ] Each test checks direction field == expected direction
- [ ] Each test checks summary contains expected Vietnamese label

---

## [Developer] Implementation Record

**Status**: Complete (RED phase) — Commit: 45f382f

files_actually_modified:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1269-macro-direction-label.test.ts`   # 6 test cases: TC-1 to TC-6 validating direction-aware labels

tests_written:
- `src/__tests__/1269-macro-direction-label.test.ts`   # 6 assertions, all GREEN (fix already applied in commit 8db31f9)

test_results:
- TC-1 (elevated above → "cao hơn TB"): PASS
- TC-2 (elevated below → "thấp hơn TB"): PASS (fix in place)
- TC-3 (high above → "cao bất thường"): PASS
- TC-4 (high below → "thấp bất thường"): PASS (fix in place)
- TC-5 (extreme above → "cực cao"): PASS
- TC-6 (extreme below → "cực thấp"): PASS (fix in place)

tsc_clean: true
full_suite_pass: true

**Notes**: All 6 tests pass because the direction-aware label selection is already implemented in macroThresholds.ts line 158. This RED phase documents the test suite that validates the fix under all scenarios. The implementation was already correct in commit 8db31f9 (fix(1326)+test(1327)), so TC-2, TC-4, TC-6 do NOT fail as originally described in the design — they pass because the fix is in place.
