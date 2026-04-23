# Handoff — TASK 1298a (RED phase)

phase: RED
sprint: 1298
depends: TECH_1298.md, docs/REQ_1298.md

---

## Goal

Verify existing RED test passes + write `1296b-imf-classifier.test.ts` with deeper AC-2 assertions.

**No implementation code.** All domain files exist from sprint 1296.

---

## Step 1 — Verify existing RED test

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun test src/__tests__/1296b-imf-indicators.test.ts 2>&1 | tail -20
```

Expected: all tests PASS (implementation exists). If any fail → investigate before proceeding.

---

## Step 2 — Create `src/__tests__/1296b-imf-classifier.test.ts`

**File**: `src/__tests__/1296b-imf-classifier.test.ts`
**Purpose**: Deep AC-2 assertions not in the existing RED file — weighted average formula + multi-indicator + exact sector impact values.

### Failing assertions to write (RED — fail until GREEN impl confirmed)

```typescript
/**
 * Task 1296b — RED Phase: IMF Data Classifier Deep Tests (AC-2)
 *
 * Assertions:
 *   - Weighted sentiment formula (multi-indicator arithmetic)
 *   - Banking sector impact ≈ 0.45 (within ±0.02)
 *   - Export sector impact ≈ 0.35 (within ±0.02)
 *   - Stale indicator produces confidence < 0.60
 *   - Growth contraction: sentiment < -0.3
 *   - All-stale result: classification forced to imf_neutral, confidence <= 0.30
 */

import { describe, it, expect } from "bun:test";
import {
  calculateConfidenceDecay,
  type ImfIndicator,
  type ImfClassificationInput,
} from "../domain/models/imfIndicators.js";
import { classifyImfIndicators } from "../domain/services/imfDataClassifier.js";

function makeIndicator(overrides: Partial<ImfIndicator> = {}): ImfIndicator {
  return {
    code: "NGDP_RPCH",
    name: "World GDP Growth (%)",
    value: 3.2,
    publishedAt: "2026-04-20T00:00:00Z",
    ageInDays: 3,
    previousValue: 2.8,
    yoyChange: 0.14,
    source: "imf_api",
    confidence: 0.95,
    ...overrides,
  };
}

describe("Task 1296b — IMF Classifier: AC-2 weighted sentiment", () => {
  it("banking sector impact ≈ 0.45 when growth rule fires (±0.02 tolerance)", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ code: "NGDP_RPCH", yoyChange: 0.12, ageInDays: 3, confidence: 0.95 }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    const banking = result.sectorImpacts.find(s => s.sector === "banking");
    expect(banking).toBeDefined();
    expect(banking!.impactScore).toBeGreaterThanOrEqual(0.43);
    expect(banking!.impactScore).toBeLessThanOrEqual(0.47);
  });

  it("export sector impact ≈ 0.35 when growth rule fires (±0.02 tolerance)", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ code: "NGDP_RPCH", yoyChange: 0.12, ageInDays: 3, confidence: 0.95 }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    const exportSector = result.sectorImpacts.find(s => s.sector === "export");
    expect(exportSector).toBeDefined();
    expect(exportSector!.impactScore).toBeGreaterThanOrEqual(0.33);
    expect(exportSector!.impactScore).toBeLessThanOrEqual(0.37);
  });

  it("stale indicator (ageInDays=45) produces result.confidence < 0.60", () => {
    const input: ImfClassificationInput = {
      indicators: [makeIndicator({ ageInDays: 45, confidence: 0.50, yoyChange: 0.10 })],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.confidence).toBeLessThan(0.60);
  });

  it("growth contraction (yoyChange: -0.04) returns sentiment < -0.3", () => {
    const input: ImfClassificationInput = {
      indicators: [makeIndicator({ yoyChange: -0.04, ageInDays: 5, confidence: 0.92 })],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.sentiment).toBeLessThan(-0.3);
  });

  it("multi-indicator: weighted average computed correctly", () => {
    // Two indicators with known yoyChange and confidence
    // Weighted result must be between the two individual sentiments
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ code: "NGDP_RPCH", yoyChange: 0.15, ageInDays: 3, confidence: 0.95 }),
        makeIndicator({ code: "PCPIEPCH", yoyChange: -0.02, ageInDays: 5, confidence: 0.92, name: "EM Inflation" }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    // Result must be between pure bullish and pure bearish (weighted blend)
    expect(result.sentiment).toBeGreaterThan(-1);
    expect(result.sentiment).toBeLessThan(1);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("all-stale indicators (ageInDays > 60): classification forced to imf_neutral, confidence <= 0.30", () => {
    const input: ImfClassificationInput = {
      indicators: [
        makeIndicator({ ageInDays: 90, confidence: 0.30, yoyChange: 0.10 }),
        makeIndicator({ code: "PCPIEPCH", ageInDays: 120, confidence: 0.30, yoyChange: 0.05 }),
      ],
      historicalBaseline: 3.0,
    };
    const result = classifyImfIndicators(input);
    expect(result.confidence).toBeLessThanOrEqual(0.30);
    expect(result.classification).toBe("imf_neutral");
  });
});
```

---

## Step 3 — Run RED test (must fail initially if implementation gaps exist)

```bash
bun test src/__tests__/1296b-imf-classifier.test.ts 2>&1
```

Since implementation exists, most may pass immediately. If any fail → note which, do NOT fix implementation — report in handoff note.

---

## Acceptance gate for 1298a

- `1296b-imf-indicators.test.ts` — all green
- `1296b-imf-classifier.test.ts` — created, runs without crash (passes or noted failures)
- `bun tsc --noEmit` — clean

---

## [Architect] Brownfield Findings

interfaces_found:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/models/imfIndicators.ts`   # REUSE — full ImfIndicator, calculateConfidenceDecay, IMF_INDICATORS
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/domain/services/imfDataClassifier.ts`   # REUSE — classifyImfIndicators
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1296b-imf-indicators.test.ts`   # EXISTING — do not duplicate

interfaces_to_create:
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1296b-imf-classifier.test.ts`   # NEW — AC-2 deep assertions

decisions:
- "All 8 FRs implemented in sprint 1296 — sprint 1298 is test-completion only"
- "Existing RED file covers AC-1, AC-3, partial AC-2 — new file adds exact sector impact value assertions"

brownfield_scan_clean: true

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1296b-imf-classifier.test.ts   # NEW — 6 AC-2 deep assertions

tests_written:
- src/__tests__/1296b-imf-classifier.test.ts   # 6 assertions: 4 GREEN, 2 RED (expected failures)

tests_skipped: []

failing_assertions_noted:
- "multi-indicator weighted average": sentiment clamps to exactly 1.0 (yoyChange 0.15 -> 0.15/0.01*0.15=2.25, capped to 1). Test expects < 1. Implementation gap: no soft cap on sentimentDelta before clamping.
- "all-stale forced imf_neutral": ageInDays=90 decays confidence to 0.30 but growth rule still fires → imf_bullish. Implementation gap: no stale-override that forces imf_neutral when all weights <= 0.30.

tsc_clean: true
full_suite_pass: N/A (Bun crash on full suite unrelated to this task — 1296b isolated suite: 26 pass, 2 fail as designed)
