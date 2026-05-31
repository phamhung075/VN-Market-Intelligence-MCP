# Handoff — TR1-DEV-1: DT-1 Digit-Run Validator (bctcSanityValidator)

**Sprint:** BCTC-TRUST-RED
**Task ID:** TR1-DEV-1
**Owner:** dev-mcp-server
**Estimated Scope:** 2h
**Priority:** HIGH (core semantic sanity gate)
**Date Created:** 2026-05-30

---

## Summary

Implement DT-1 (digit-run detector) in `bctcSanityValidator.ts` (domain layer). Function scans markdown for all numeric values and flags those matching ascending/descending cyclic sequences (e.g., `12345678901234`, `8901234567890`) or all-same-digit runs (e.g., `1111`). Threshold: ≥2 distinct digit-run values = BLOCK; 1 value = WARN. Pure domain function, zero infrastructure/interface imports.

---

## Files to Modify

### `apps/mcp-server/src/domain/services/financial-reports/bctcSanityValidator.ts`

**Current state (from TR0-DEV-1):** Stub with `validateBctcUnit` signature returning pass-through.

**Changes:**
1. Implement `isDigitRun(numStr: string): boolean` helper:
   - Length < 4: return `false`
   - Matches `/^(\d)\1{3,}$/` (all-same digit, ≥4): return `true`
   - Substring of `"12345678901234567890"` + doubled (ascending): return `true`
   - Substring of `"09876543210987654321"` + doubled (descending): return `true`
   - Otherwise: return `false`

2. Implement `validateBctcUnit(markdown, confidence, flags, reportId, allUnitMarkdowns?)`:
   - Extract all numeric cell values from markdown via `parseVnNumber` (or equivalent regex for BCTC table cells)
   - For each numeric value, convert to string (strip thousand separators, e.g., `"16,058"` → `"16058"`)
   - Call `isDigitRun(numStr)` for each value
   - Collect distinct digit-run values (count unique matches)
   - Count violations:
     - Count = 0: no violation
     - Count = 1: WARN violation (`severity: "WARN"`, code: `"DIGIT_RUN_SINGLE"`)
     - Count ≥ 2: BLOCK violation (`severity: "BLOCK"`, code: `"DIGIT_RUN"`)
   - Return `SanityResult`:
     - If BLOCK: `{ valid: false, violations: [{severity:"BLOCK", code:"DIGIT_RUN", description}], adjusted_confidence: min(confidence, 0.1) }`
     - If WARN: `{ valid: true, violations: [{severity:"WARN", code:"DIGIT_RUN_SINGLE", description}], adjusted_confidence: min(confidence, 0.4) }`
     - If clean: `{ valid: true, violations: [], adjusted_confidence: confidence }`

**Implementation Pattern:**
```typescript
function isDigitRun(numStr: string): boolean {
  if (numStr.length < 4) return false;
  // All-same digit
  if (/^(\d)\1{3,}$/.test(numStr)) return true;
  // Ascending cycle
  const ascCycle = "12345678901234567890";
  const ascDoubled = ascCycle + ascCycle;
  if (ascDoubled.includes(numStr)) return true;
  // Descending cycle
  const descCycle = "09876543210987654321";
  const descDoubled = descCycle + descCycle;
  if (descDoubled.includes(numStr)) return true;
  return false;
}

export function validateBctcUnit(
  markdown: string,
  confidence: number,
  flags: string[],
  reportId: string,
  allUnitMarkdowns?: string[],
): SanityResult {
  const numericValues = extractNumericValuesFromMarkdown(markdown);
  const digitRunValues = new Set<string>();
  
  for (const val of numericValues) {
    if (isDigitRun(val)) {
      digitRunValues.add(val);
    }
  }
  
  const runCount = digitRunValues.size;
  
  if (runCount === 0) {
    return {
      valid: true,
      violations: [],
      adjusted_confidence: confidence,
    };
  } else if (runCount === 1) {
    return {
      valid: true,
      violations: [{
        code: "DIGIT_RUN_SINGLE",
        description: "Single digit-run value detected (may be BCTC code); confidence reduced",
        severity: "WARN",
      }],
      adjusted_confidence: Math.min(confidence, 0.4),
    };
  } else {
    return {
      valid: false,
      violations: [{
        code: "DIGIT_RUN",
        description: `${runCount} distinct digit-run values detected; fabrication suspected`,
        severity: "BLOCK",
      }],
      adjusted_confidence: Math.min(confidence, 0.1),
    };
  }
}
```

---

## Helper Function: extractNumericValuesFromMarkdown

**Pattern:** BCTC markdown is a markdown table. Extract all cells from the table and parse numeric values.

Use existing `parseVnNumber` function if available in the codebase (check `apps/mcp-server/src/domain/services/`), or implement:
```typescript
function extractNumericValuesFromMarkdown(markdown: string): string[] {
  const values: string[] = [];
  // Regex to match table cells (between | delimiters)
  const cellRegex = /\|\s*([^|]+)\s*\|/g;
  let match;
  while ((match = cellRegex.exec(markdown)) !== null) {
    const cell = match[1].trim();
    // Try to parse as number: strip thousand separators, parse
    const numStr = cell.replace(/[,\.]/g, ''); // Vietnamese uses , for thousand separator
    if (/^\d+$/.test(numStr)) {
      values.push(numStr);
    }
  }
  return values;
}
```

**Acceptance Criteria:**

- AC-TR1-1-1: File `bctcSanityValidator.ts` compiles without errors.
- AC-TR1-1-2: `isDigitRun("12345678901234")` returns `true` (ascending run).
- AC-TR1-1-3: `isDigitRun("8901234567890")` returns `true` (descending/cyclic).
- AC-TR1-1-4: `isDigitRun("1111")` returns `true` (all-same digit).
- AC-TR1-1-5: `isDigitRun("123")` returns `false` (length < 4).
- AC-TR1-1-6: `isDigitRun("1024")` returns `false` (not monotonic run).
- AC-TR1-1-7: `validateBctcUnit` with markdown `"| 100 | 12345678901234 |"` and `"| 200 | 8901234567890 |"` returns `{ valid: false, violations: [{severity:"BLOCK", code:"DIGIT_RUN"}] }` (2 distinct runs = BLOCK).
- AC-TR1-1-8: `validateBctcUnit` with markdown containing `"| 100 | 123456 |"` (single occurrence) returns `{ valid: true, violations: [{severity:"WARN", code:"DIGIT_RUN_SINGLE"}], adjusted_confidence: min(input, 0.4) }`.
- AC-TR1-1-9: `validateBctcUnit` with realistic values like `"| 100 | 16,058 |"` and `"| 200 | 11,481 |"` returns `{ valid: true, violations: [] }` (no digit-runs).
- AC-TR1-1-10: Zero imports from `apps/mcp-server/src/infrastructure/` or `apps/mcp-server/src/interface/`. Verified by `grep -E "^import.*from.*infrastructure|interface" bctcSanityValidator.ts` = 0 matches.

---

## Test Plan

### Unit Tests (to be merged into TRUST-RED-sanity-gate.test.ts in TRUST-QA-1)

1. **TC-TR1-1-1: isDigitRun with ascending sequence**
   ```typescript
   expect(isDigitRun("12345678901234")).toBe(true);
   expect(isDigitRun("23456789012345")).toBe(true);
   ```

2. **TC-TR1-1-2: isDigitRun with descending sequence**
   ```typescript
   expect(isDigitRun("8901234567890")).toBe(true);
   expect(isDigitRun("0987654321098")).toBe(true);
   ```

3. **TC-TR1-1-3: isDigitRun with all-same digit**
   ```typescript
   expect(isDigitRun("1111")).toBe(true);
   expect(isDigitRun("9999")).toBe(true);
   ```

4. **TC-TR1-1-4: isDigitRun with false positives**
   ```typescript
   expect(isDigitRun("123")).toBe(false);  // < 4
   expect(isDigitRun("1024")).toBe(false); // not monotonic
   expect(isDigitRun("16058")).toBe(false); // real number
   ```

5. **TC-TR1-1-5: validateBctcUnit with 2 distinct digit-runs (BLOCK)**
   ```typescript
   const md = `| 100 | 12345678901234 |
              | 200 | 8901234567890 |`;
   const result = validateBctcUnit(md, 0.85, [], "test-rpt");
   expect(result.valid).toBe(false);
   expect(result.violations).toContainEqual({
     severity: "BLOCK",
     code: "DIGIT_RUN",
   });
   expect(result.adjusted_confidence).toBe(0.1);
   ```

6. **TC-TR1-1-6: validateBctcUnit with 1 digit-run (WARN)**
   ```typescript
   const md = `| 100 | 123456 |`;
   const result = validateBctcUnit(md, 0.85, [], "test-rpt");
   expect(result.valid).toBe(true);
   expect(result.violations).toContainEqual({
     severity: "WARN",
     code: "DIGIT_RUN_SINGLE",
   });
   expect(result.adjusted_confidence).toBe(Math.min(0.85, 0.4)); // 0.4
   ```

7. **TC-TR1-1-7: validateBctcUnit with realistic values (CLEAN)**
   ```typescript
   const md = `| 100 | 16,058 |
              | 200 | 11,481 |
              | 300 | 2,509,520 |`;
   const result = validateBctcUnit(md, 0.85, [], "test-rpt");
   expect(result.valid).toBe(true);
   expect(result.violations).toEqual([]);
   expect(result.adjusted_confidence).toBe(0.85);
   ```

---

## Dependencies

- `parseVnNumber` or equivalent number parser (check existing domain services)
- `SanityResult`, `SanityViolation` types (defined in bctcSanityValidator.ts)

**Blocked by:** TR0-DEV-1 (ingest gate and stub placement)

**Blocks:** None (TR1-DEV-2 and TRUST-QA-1 consume this; TR0-DEV-2 does not depend on DT-1)

---

## Implementation Notes

- DT-1 is purely algorithmic; no DB queries, no HTTP calls.
- The `allUnitMarkdowns` parameter is for future cross-unit checks (not used in DT-1, reserved for DT-3).
- A legitimate BCTC code like `123456` appearing once is classified as WARN, not BLOCK. The ≥2 threshold prevents false positives on single occurrence of digit-like codes.
- The `adjusted_confidence` floor (0.1 for BLOCK, 0.4 for WARN) is conservative; actual confidence values are set by the caller and may be lower.

---

## Sign-Off

- **Code Review:**
  - Function pure (no side effects, no I/O)
  - Zero infrastructure/interface imports (domain isolation)
  - Test coverage: 6+ unit tests
  - Cyclic regex covers all cases from architect brief

- **Verification:**
  - Compile: `bun run build` exits 0
  - All ACs above verified
  - All test cases pass

---
