# TASK 1329d — IMF Conviction Input: 7th Dimension Types

**Sprint:** 1329
**Layer:** domain/services
**Size:** S (part of M IMF chain)
**Branch:** `task/1329b-imf-conviction-dimension` (shared branch for 1329d–1329g)
**Depends on:** 1329a+1329b+1329c merged to main
**Blocks:** 1329e

---

## Objective

Add `imfMacroScore?: number` to `ConvictionInput` and `imfMacro: number` to `ConvictionResult.dimensions`. This is a pure type change — no logic yet. 1329e will add the scoring function and weight rescaling on top of these types.

---

## Files to Modify

### `apps/mcp-server/src/domain/services/convictionScorer.ts`

**Change 1 — `ConvictionInput` interface (after line 78, after `agentSignalsMajority?`)**

Add field:
```typescript
  // Dimension 7: IMF macro economic signal (Task 1329)
  /**
   * IMF macro sentiment score in [-1, +1].
   * Injected by the caller via imfConvictionBridge.getImfMacroScoreForConviction().
   * undefined -> neutral (no fresh IMF data, maps to 0.5).
   */
  imfMacroScore?: number;
```

**Change 2 — `ConvictionResult.dimensions` object (after line 98, after `kinhDich: number`)**

Add field:
```typescript
    /** IMF macro dimension score [0, 1]. 0.5 = neutral/no fresh data. */
    imfMacro: number;
```

**Change 3 — module-level JSDoc (lines 1-26)**

Update the dimensions list in the file header from "6 independent signal dimensions" to "7 independent signal dimensions" and add:
```
 *   7. IMF macro    — what do IMF economic indicators say? (imfMacroScore)
```

Update conviction level comment from `6 dimensions` to `7 dimensions` where referenced in `computeConviction`'s JSDoc.

---

## What NOT to change in this task

- `WEIGHTS` constant — untouched (1329e owns this)
- `computeConviction()` body — untouched (1329e adds scoring call and weighted sum update)
- `ConvictionResult.summary` string — untouched (1329e adds `"imf vĩ mô"` label)
- No new imports required — pure TypeScript interface extension

---

## Test File

`apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts`

This test file is created fresh in 1329d and extended by 1329e–1329g.

Initial test (type-level, compile-time check via `bun tsc --noEmit` + runtime shape check):

```typescript
import { describe, it, expect } from "bun:test";
import { computeConviction } from "../domain/services/convictionScorer.js";

describe("Task 1329d — ConvictionInput/Result types: imfMacro dimension", () => {
  it("ConvictionInput accepts imfMacroScore field", () => {
    // TypeScript compile check — if this compiles, the field exists on the interface
    const result = computeConviction({ code: "VCB", imfMacroScore: 0.5 });
    expect(result).toBeDefined();
  });

  it("ConvictionResult.dimensions includes imfMacro field", () => {
    const result = computeConviction({ code: "VCB" });
    expect(typeof result.dimensions.imfMacro).toBe("number");
  });

  it("imfMacroScore undefined produces dimensions.imfMacro = 0.5 (neutral)", () => {
    const result = computeConviction({ code: "VCB" });
    expect(result.dimensions.imfMacro).toBe(0.5);
  });
});
```

The third test will only pass after 1329e wires in `scoreImfMacro`. Write it now as a failing test (TDD) — it documents the contract.

---

## DDD Compliance

- Pure interface extension in `domain/services`. Zero imports changed. Zero infrastructure touched.
- `imfMacroScore` is injected by the caller (application layer) — same pattern as `kinhDichScore`. `computeConviction()` stays pure (NFR-IMF-1).

---

## Backward Compatibility

`imfMacroScore?: number` is optional. All 4 existing call sites (`scanMarket.ts:505`, `assembleBriefing.ts:972`, `portfolioTools.ts:351`, and the test files) compile unchanged because TypeScript allows calling a function without passing optional fields. Existing tests pass without change.

The `dimensions` shape change (adding `imfMacro`) is a non-breaking addition. No downstream code destructures `dimensions` with a rest/spread that would fail on extra fields.
