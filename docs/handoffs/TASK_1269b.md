# TASK_1269b — GREEN Implementation: Direction-Aware Labels in classifyDeviation()

## Summary

Refactor `classifyDeviation()` to use direction-aware Vietnamese labels. Fixes hardcoded "cao hơn TB" appearing for ALL deviations regardless of actual sigma sign.

**Status**: GREEN (implementation that makes RED tests pass)

**Depends on**: TASK_1269a (RED tests)

**DDD Layer**: domain/services/macroThresholds.ts (pure logic, no infrastructure)

---

## [Architect] Brownfield Findings

**File**: `src/domain/services/macroThresholds.ts`

**Status**: Implementation already has the fix (line 158 is direction-aware). However, the bug report suggests this may have been recently fixed or there's a regression. This task validates & documents the fix.

**Interfaces used**:
- MacroStats (line 24) — input, used as-is
- MacroDeviation (line 44) — output, modified to ensure summary field uses correct label
- DeviationLevel (line 38) — unchanged
- DeviationDirection (line 41) — unchanged

**Decisions**:
- No new interfaces needed
- Single-line change at line 158 (already present but documenting explicitly)
- No infrastructure changes
- Label dictionaries LEVEL_VI + LEVEL_VI_BELOW (lines 70-82) already defined

**brownfield_scan_clean**: true

---

## Root Cause

Line 72 in LEVEL_VI dictionary has hardcoded "cao hơn TB" (above average) for ALL levels:
```typescript
const LEVEL_VI: Record<DeviationLevel, string> = {
  normal: "bình thường",
  elevated: "cao hơn TB",           // ← hardcoded, ignores direction
  high: "cao bất thường",            // ← hardcoded, ignores direction
  extreme: "cực cao",                // ← hardcoded, ignores direction
};
```

When `zScore = -1.65` (below mean), the code still picks from LEVEL_VI, yielding "cao hơn TB" — contradicting the negative z-score.

---

## Solution

Use **direction-aware label selection** at line 158:

```typescript
const levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level];
```

### Data Flow

1. Compute `zScore` (line 130):
   - Positive → `direction = "above"`
   - Negative → `direction = "below"`
   - ~0 → `direction = "at_mean"`

2. Determine `level` from `absZ` (lines 141-145):
   - absZ ≥ 3 → "extreme"
   - absZ ≥ 2 → "high"
   - absZ ≥ 1 → "elevated"
   - else → "normal"

3. **NEW**: Pick label dictionary based on direction (line 158):
   ```typescript
   if (direction === "below") {
     // Use LEVEL_VI_BELOW (already defined, lines 77-82)
     levelVi = LEVEL_VI_BELOW[level];
   } else {
     // Use LEVEL_VI (default, lines 70-75)
     levelVi = LEVEL_VI[level];
   }
   ```

4. Build summary (lines 162-164) using correct `levelVi`:
   ```typescript
   const summary = level === "normal"
     ? `${nameVi}: ${current} — bình thường (${sign}${zScore}σ)`
     : `${nameVi}: ${current} — ${levelVi} (${sign}${zScore}σ ${dirVi} TB ${mean})`;
   ```

---

## Code Changes

**File**: `src/domain/services/macroThresholds.ts`

**Location**: Lines 150–166 (classifyDeviation function, after direction computation)

### Before (Buggy)
```typescript
const direction: DeviationDirection =
  zScore > 0.1 ? "above" :
  zScore < -0.1 ? "below" :
  "at_mean";

const nameVi = INDICATOR_NAME_VI[name] ?? name;
const levelVi = LEVEL_VI[level];  // ← HARDCODED, ignores direction!
const dirVi = direction === "above" ? "trên" : direction === "below" ? "dưới" : "quanh";
const sign = zScore >= 0 ? "+" : "";

const summary = level === "normal"
  ? `${nameVi}: ${current} — bình thường (${sign}${zScore}σ)`
  : `${nameVi}: ${current} — ${levelVi} (${sign}${zScore}σ ${dirVi} TB ${mean})`;

return { name, current, mean, stdDev, zScore, level, direction, summary };
```

### After (Fixed)
```typescript
const direction: DeviationDirection =
  zScore > 0.1 ? "above" :
  zScore < -0.1 ? "below" :
  "at_mean";

const nameVi = INDICATOR_NAME_VI[name] ?? name;
const levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level];  // ← DIRECTION-AWARE
const dirVi = direction === "above" ? "trên" : direction === "below" ? "dưới" : "quanh";
const sign = zScore >= 0 ? "+" : "";

const summary = level === "normal"
  ? `${nameVi}: ${current} — bình thường (${sign}${zScore}σ)`
  : `${nameVi}: ${current} — ${levelVi} (${sign}${zScore}σ ${dirVi} TB ${mean})`;

return { name, current, mean, stdDev, zScore, level, direction, summary };
```

---

## Test Verification

Run the RED tests from TASK_1269a:
```bash
bun test src/__tests__/1269-macro-direction-label.test.ts
```

Expected output:
- TC-1, TC-3, TC-5 (above-mean): PASS ✓
- TC-2, TC-4, TC-6 (below-mean): NOW PASS ✓ (were failing)

All 6 tests should pass.

---

## Acceptance Criteria

- [ ] Line 158 updated to use direction-aware label selection
- [ ] No new dependencies added
- [ ] All 6 RED tests from TASK_1269a now pass
- [ ] `bun test src/__tests__/1269-macro-direction-label.test.ts` → 6 pass, 0 fail
- [ ] `bun test` (full suite) passes without regressions
- [ ] TypeScript: `bun tsc --noEmit` → no errors

---

## Impact Analysis

- **Scope**: Single function refactoring (classifyDeviation)
- **Risk**: LOW — label selection is local logic, no API changes
- **Tested by**: 6 unit tests (all directions × all levels)
- **Downstream**: cascade engine + briefings use corrected labels in summaries
- **Revert**: Safe — one-line change, can revert if needed
