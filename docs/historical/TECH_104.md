# TECH-104: Direction-Aware Level Label in classifyDeviation

status: APPROVED_BY_ARCHITECT
req_ref: REQ-104

## Brownfield Impact

- Files modified: `src/domain/services/macroThresholds.ts`
- Files created: `src/__tests__/1326-macro-deviation-direction.test.ts`
- Files deleted: none
- Breaking changes: no — public API of `classifyDeviation()` and `MacroDeviation` type are unchanged; only the `summary` string value changes for below-mean deviations

## Architecture Decision

The fix is fully contained in the domain layer — `macroThresholds.ts` is a pure function file with no infrastructure imports. Adding `LEVEL_VI_BELOW` as a parallel sibling constant to `LEVEL_VI` keeps the label lookup exhaustive and type-checked without touching any upstream callers. The direction value (`"above" | "below" | "at_mean"`) is already computed at line 132–135 of the current file, so the fix is a one-line conditional replacement at line 138.

## DDD Layer Plan

| Component         | Layer  | File Path                                                    | New/Modify |
| ----------------- | ------ | ------------------------------------------------------------ | ---------- |
| LEVEL_VI_BELOW    | domain | src/domain/services/macroThresholds.ts                       | MODIFY     |
| LEVEL_VI.extreme  | domain | src/domain/services/macroThresholds.ts                       | MODIFY     |
| levelVi lookup    | domain | src/domain/services/macroThresholds.ts (line 138)            | MODIFY     |
| Direction TDD     | test   | src/__tests__/1326-macro-deviation-direction.test.ts         | NEW        |

## Interface Contracts

### No interface changes

`MacroStats`, `MacroDeviation`, `DeviationLevel`, `DeviationDirection` — all unchanged. `classifyDeviation(stats: MacroStats): MacroDeviation` signature unchanged.

### Internal constant additions — `src/domain/services/macroThresholds.ts`

```typescript
// Rename: "cực đoan" → "cực cao" (direction-explicit, symmetric with LEVEL_VI_BELOW)
const LEVEL_VI: Record<DeviationLevel, string> = {
  normal:   "bình thường",
  elevated: "cao hơn TB",
  high:     "cao bất thường",
  extreme:  "cực cao",          // was "cực đoan"
};

// NEW — symmetric below-mean labels
const LEVEL_VI_BELOW: Record<DeviationLevel, string> = {
  normal:   "bình thường",
  elevated: "thấp hơn TB",
  high:     "thấp bất thường",
  extreme:  "cực thấp",
};
```

### Line 138 replacement in `classifyDeviation()`

```typescript
// BEFORE (line 138):
const levelVi = LEVEL_VI[level];

// AFTER:
const levelVi = direction === "below" ? LEVEL_VI_BELOW[level] : LEVEL_VI[level];
```

No other lines in the function change.

## Task Breakdown

Execution order is TDD-first (1327 before 1326):

| Order | Task | Title | Depends On |
| ----- | ---- | ----- | ---------- |
| 1 | 1327 | test: write 1326-macro-deviation-direction.test.ts (6 cases, all failing) | none |
| 2 | 1326 | fix: direction-aware levelVi in macroThresholds.ts (make tests pass) | 1327 |

Both tasks share branch `task/1326-1327-macro-alert-direction`.

### Test cases for task 1327

| TC | MacroStats input | Assert summary contains | Assert does NOT contain |
| -- | ---------------- | ----------------------- | ----------------------- |
| 1 (AC-1) | current=26364, mean=26333, stdDev=12, n=30 → zScore≈+2.6 | "cao bất thường" | "thấp bất thường" |
| 2 (AC-2) | current=26302, mean=26333, stdDev=12, n=30 → zScore≈-2.6 | "thấp bất thường" | "cao bất thường" |
| 3 (AC-3) | current=26375, mean=26333, stdDev=12, n=30 → zScore≈+3.5 | "cực cao" | — |
| 4 (AC-4) | current=26291, mean=26333, stdDev=12, n=30 → zScore≈-3.5 | "cực thấp" | — |
| 5 (AC-5) | current=26340, mean=26333, stdDev=12, n=30 → zScore≈+0.6 | "bình thường" | — |
| 6 (AC-6) | production regression: current=26302, mean=26333.2, stdDev=12, n=30 | "thấp bất thường" | "cao bất thường" |

TC-1 and TC-6 use the same value family; TC-6 uses the exact production values from the bug report to serve as a named regression guard.

All 6 tests call `classifyDeviation()` directly — no DB, no HTTP, no Telegram.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| `LEVEL_VI_BELOW` missing a key (TypeScript not exhaustive) | Low | Medium | Declare as `Record<DeviationLevel, string>` — compiler enforces all 4 keys |
| UTF-8 diacritics mangled in test string comparison | Low | Medium | Use `toContain("thấp bất thường")` exact match; Bun test runner is UTF-8 native |
| Rename "cực đoan" → "cực cao" breaks downstream string comparisons | Low | Low | No existing tests assert on "cực đoan" (confirmed by brownfield: only `LEVEL_VI` const uses it); AC-3 test will catch regressions |
| `at_mean` + non-normal level uses LEVEL_VI (above labels) | Very Low | Very Low | Acceptable fallback per REQ-104 edge case note; no test required |

## Security Review

- SQL parameterized? N/A — no SQL in this change
- File paths validated? N/A — no file I/O
- External HTTP rate-limited? N/A — pure in-memory
- Secrets via Bun.env only? N/A — no secrets
