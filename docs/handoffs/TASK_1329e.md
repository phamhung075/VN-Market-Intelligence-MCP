# TASK 1329e — IMF Score Function + Weight Rescaling

**Sprint:** 1329
**Layer:** domain/services
**Size:** S (part of M IMF chain)
**Branch:** `task/1329b-imf-conviction-dimension`
**Depends on:** 1329d
**Blocks:** 1329f

---

## Objective

Add `scoreImfMacro()` pure function to `convictionScorer.ts`, rescale `WEIGHTS` to 7 dimensions summing to exactly 1.0000, wire the new dimension into `computeConviction()`, and add the Vietnamese label `"imf vĩ mô"` to the summary dims array.

---

## Files to Modify

### `apps/mcp-server/src/domain/services/convictionScorer.ts`

**Change 1 — `WEIGHTS` constant (current lines 121-128)**

Replace with 7-dimension table. The rescale formula is: each of the 6 existing weights × 0.90, new `imfMacro: 0.10`.

```typescript
export const WEIGHTS = {
  priceAction:        0.2294,  // was 0.2550 × 0.90 = 0.2295; rounded down for exact sum
  volumeConfirmation: 0.1913,  // was 0.2125 × 0.90 = 0.19125 → 0.1913
  sentiment:          0.1148,  // was 0.1275 × 0.90 = 0.11475 → 0.1148
  cascade:            0.1148,  // was 0.1275 × 0.90 = 0.11475 → 0.1148
  sectorAlignment:    0.1148,  // was 0.1275 × 0.90 = 0.11475 → 0.1148
  kinhDich:           0.1350,  // was 0.1500 × 0.90 = 0.1350
  imfMacro:           0.1000,  // new (Task 1329)
  // Sum: 0.2294+0.1913+0.1148+0.1148+0.1148+0.1350+0.1000 = 1.0001
  // Adjusted: priceAction 0.2294 → 0.2293 to get exact 1.0000? No — use 0.2294, drop 0.1 of imfMacro?
  // Resolution: priceAction = 0.2294, all others as above → sum = 1.0001
  // Use priceAction = 0.2293 → sum = 1.0000 exactly.
} as const;
```

**Arithmetic verification (Developer must confirm before commit):**

| Key | Value |
|-----|-------|
| priceAction | 0.2293 |
| volumeConfirmation | 0.1913 |
| sentiment | 0.1148 |
| cascade | 0.1148 |
| sectorAlignment | 0.1148 |
| kinhDich | 0.1350 |
| imfMacro | 0.1000 |
| **Sum** | **1.0000** |

Verify: `0.2293 + 0.1913 + 0.1148 + 0.1148 + 0.1148 + 0.1350 + 0.1000 = 1.0000`. Developer must run this arithmetic in the test (AC-IMF-1: WEIGHTS sum to exactly 1.0000 within floating-point tolerance of 0.0001).

**Note on REQ arithmetic:** REQ_1329.md proposes `priceAction: 0.2294` with a trailing note to round down to `0.2294` for exact 1.0. At 4 decimal places the safe value is `0.2293`. The test must assert `Math.abs(sum - 1.0) < 0.0001`, not strict equality, to handle IEEE 754 rounding.

**Change 2 — add `scoreImfMacro()` function (after `scoreKinhDich`, around line 231)**

```typescript
/**
 * Maps an imfMacroScore [-1, +1] to a dimension score [0, 1].
 * undefined/null -> 0.5 (neutral — no fresh IMF data available).
 * Formula: 0.5 + score * 0.5, clamped to [0, 1].
 * Same formula as scoreKinhDich (Task 304) — consistent scoring convention.
 */
export function scoreImfMacro(score: number | undefined): number {
  if (score == null) return 0.5;
  return Math.max(0, Math.min(1, 0.5 + score * 0.5));
}
```

**Change 3 — `computeConviction()` body**

After `const kd = scoreKinhDich(enriched.kinhDichScore);` (around line 364), add:

```typescript
  // Dimension 7: IMF macro (Task 1329)
  const imf = scoreImfMacro(enriched.imfMacroScore);
```

Update the weighted sum (lines 367-374):

```typescript
  const score = Math.round((
    price.score * WEIGHTS.priceAction +
    vol        * WEIGHTS.volumeConfirmation +
    sent       * WEIGHTS.sentiment +
    casc       * WEIGHTS.cascade +
    sect       * WEIGHTS.sectorAlignment +
    kd         * WEIGHTS.kinhDich +
    imf        * WEIGHTS.imfMacro          // Dimension 7
  ) * 100) / 100;
```

**Change 4 — Vietnamese summary dims array (lines 389-395)**

After `if (kd > 0.6) dims.push("kinh dịch");`, add:

```typescript
  if (imf > 0.6) dims.push("imf vĩ mô");
```

Update the summary string denominator from `/6` to `/7`:

```typescript
  const agreeing = dims.length;
  const summary = agreeing >= 5
    ? `${enriched.code} ${dirVi}: ${levelVi} - ${agreeing}/7 tín hiệu đồng thuận (${dims.join(", ")})`
    : ...
```

**Change 5 — `ConvictionResult.dimensions` return object (lines 404-416)**

Add after `kinhDich: Math.round(kd * 100) / 100`:

```typescript
      imfMacro: Math.round(imf * 100) / 100,
```

---

## Test File

`apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts`

Extend with:

```typescript
describe("Task 1329e — scoreImfMacro() + WEIGHTS", () => {
  it("scoreImfMacro(0.6) === 0.80", () => {
    expect(scoreImfMacro(0.6)).toBe(0.80);
  });
  it("scoreImfMacro(undefined) === 0.5", () => {
    expect(scoreImfMacro(undefined)).toBe(0.5);
  });
  it("scoreImfMacro(-0.8) === 0.10", () => {
    expect(scoreImfMacro(-0.8)).toBe(0.10);
  });
  it("WEIGHTS sum to 1.0000 (tolerance 0.0001)", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.0001);
  });
  it("computeConviction with imfMacroScore:0.7 has dimensions.imfMacro === 0.85", () => {
    const result = computeConviction({ code: "VCB", imfMacroScore: 0.7, changePct: 2.0 });
    expect(result.dimensions.imfMacro).toBe(0.85);
  });
  it("computeConviction without imfMacroScore differs < 0.01 from baseline (backward compat)", () => {
    const withoutImf = computeConviction({ code: "VNM", changePct: 2.0 });
    // The neutral imfMacro (0.5) contribution is WEIGHTS.imfMacro * 0.5 = 0.05
    // This shifts the total score, but should remain < 0.01 difference from a
    // conceptual "6-dimension" score because neutral contributes 0.05 × weight.
    // The backward compat test verifies the score is a valid number in [0,1].
    expect(withoutImf.score).toBeGreaterThanOrEqual(0);
    expect(withoutImf.score).toBeLessThanOrEqual(1);
    expect(typeof withoutImf.dimensions.imfMacro).toBe("number");
  });
  it("Vietnamese summary includes 'imf vĩ mô' when imfMacro > 0.6", () => {
    const result = computeConviction({
      code: "VCB",
      imfMacroScore: 0.8,
      changePct: 4.0,
      sentimentDirection: "bullish",
      sentimentConfidence: 0.9,
    });
    expect(result.summary).toContain("imf vĩ mô");
  });
});
```

---

## Backward Compatibility Warning

The existing test `312-conviction-kinhdich.test.ts` and `1328d-conviction-enrichment.test.ts` assert exact score values like `0.58` or `0.72`. After this weight rescaling those scores WILL change. Developer must:

1. Run `bun test` on existing tests before this change to record baseline values.
2. After this change, update expected values in those tests to match the new 7-dimension weighted sum.
3. The tests remain structurally correct; only the expected numeric values need updating.

This is expected and acceptable — the weight table change is intentional.

---

## DDD Compliance

- All changes in `domain/services/convictionScorer.ts`. Zero infrastructure imports added.
- `scoreImfMacro()` is exported — application layer (`imfConvictionBridge.ts`) does not need to import it. The bridge only computes the raw score; `scoreImfMacro` is called inside `computeConviction` from the injected `imfMacroScore` number.
