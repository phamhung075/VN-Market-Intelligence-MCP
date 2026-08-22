---
sprint: SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
branch: task/pec-fr3-fr5-shrinkage
size: M
zone: apps/mcp-server/
depends_on: [TASK-PEC-FR1]
blocks: [TASK-PEC-FR2]
---

## TLDR

Implement confidence shrinkage toward base rate (FR-3) and retire the redundant prompt-layer LR multiplier (FR-5). Shrinkage is evidence-aware: strong evidence (many fragments, high-sample-size LR backing them) escapes shrinkage; thin evidence (few fragments, untrusted LRs) shrinks hard toward 50%. This fixes D3 from po's investigation (the flat 90% multiplier in agent prompt was arithmetically incapable of fixing a 95%-confidence bucket that measured 0% actual hit rate).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] New `computeConfidenceShrinkage(rawScore, fragmentCount, minLrSampleSize, regime?)` function exported from `baseRateComputer.ts` (domain-pure, no infra imports)
- [ ] Shrinkage formula: `weight = Math.min(1, fragmentCount/5) * Math.min(1, minLrSampleSize/10); return 0.5 + (rawScore - 0.5) * weight` (5 fragments and sample_size=10 are the full-trust thresholds)
- [ ] `regime` parameter optional, values: "TIGHTENING" | "EASING" | "NEUTRAL". When "TIGHTENING", weight *= 0.9 (relocates existing daily-predict.md:25 constant into pipeline)
- [ ] `get_evidence_summary` computes and returns `published_probability_{direction}` for each direction (bullish/bearish/neutral), derived as: `clamp(shrunkScore * correctionFactor, 0.05, 0.95)` (correctionFactor defaults 1.0 for now, filled by FR-2 later)
- [ ] Regression test: 2-fragment/untrusted-LR input to `computeConfidenceShrinkage(0.95, 2, 0)` returns exactly `0.5` (full shrinkage, not partial) — assertion must be strict equality or `toBeCloseTo(..., 1)` to verify full collapse
- [ ] `daily-predict.md` lines 25 and 30 (both flat multipliers: TIGHTENING unconditional, degrading-calibration conditional) are COMPLETELY REMOVED — no conditional logic left, they become dead code (verified by diff review)
- [ ] `daily-predict.md` P-5 section (line 62, `score * top_likelihood_ratio`) is REPLACED by: "read `published_probability_{direction}` directly from get_evidence_summary output — do not recompute"
- [ ] `daily-predict.md` P-0 boolean `DAMPENING_ACTIVE` is KEPT but used for narrative/logging only (still gates P-8 text), not for arithmetic
- [ ] `daily-predict.md` P-8 narrative at line 192 changes from literal "-10%" reference to describe server-side shrinkage and its data-driven nature
- [ ] MCP schema for `get_evidence_summary` gains optional `regime` parameter: `regime?: z.enum(["TIGHTENING","EASING","NEUTRAL"])`
- [ ] All existing test suites (1121/1127/1128/1129/1173/1392 + 1116/1117/1124/1194) stay green
- [ ] New unit tests for `computeConfidenceShrinkage`: boundary cases (rawScore=0.5, 0.95; fragmentCount 0-10; minLrSampleSize 0-20), negative assertion (2-fragment/untrusted input = 0.5 exactly)

**Files to read first:**
- `docs/handoffs/SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-BA-spec.md` [Architect] Brownfield Findings §FR-3, §Design decisions (single pipeline, FR-3 then FR-2), §FR-5
- `apps/mcp-server/src/domain/services/baseRateComputer.ts` (existing DDD-pure precedent)
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:174-182` (tool docstring/schema), :214-290 (current output structure)
- `docs/agents/digest-predict/flow/daily-predict.md:25, 30, 60-72, 192` (lines to retire/update)

**Files to create:** None (helpers added to existing files)

**Files to modify:**
- `apps/mcp-server/src/domain/services/baseRateComputer.ts` (add `computeConfidenceShrinkage`, add `confidenceBucketMidpoint` if not already exported)
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts` (add `published_probability_{direction}` to output, integrate shrinkage call, update tool schema/docstring)
- `docs/agents/digest-predict/flow/daily-predict.md` (remove multipliers, update P-5 and P-8 sections)

**Dependencies:** TASK-PEC-FR1 (must provide selectLikelihoodRatio results to feed minLrSampleSize calculation)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- Understanding of Bayesian shrinkage toward base rate
- MCP tool schema / Zod types

---

## Technical Details

### Part A: Add Shrinkage Helper to baseRateComputer.ts

```typescript
export function computeConfidenceShrinkage(
  rawScore: number,
  fragmentCount: number,
  minLrSampleSize: number,
  regime?: "TIGHTENING" | "EASING" | "NEUTRAL",
): number {
  const FULL_TRUST_FRAGMENTS = 5;  // top 5 fragments constant from get_evidence_summary
  const FULL_TRUST_SAMPLE = 10;    // MIN_SAMPLE used everywhere in calibration/LR logic
  
  let weight = Math.min(1, fragmentCount / FULL_TRUST_FRAGMENTS)
             * Math.min(1, minLrSampleSize / FULL_TRUST_SAMPLE);
  
  if (regime === "TIGHTENING") weight *= 0.9;  // relocate existing daily-predict.md constant
  
  return 0.5 + (rawScore - 0.5) * weight;
}
```

**Semantics:**
- `weight = 0` → full shrinkage to 0.5 (thin evidence)
- `weight = 1` → no shrinkage, return rawScore unchanged (strong evidence)
- Multiplicative composition: BOTH fragment count AND LR strength must be adequate to escape shrinkage

**Example (po's VPB case):**
- Input: `rawScore=0.95, fragmentCount=2, minLrSampleSize=0`
- Calculation: `weight = min(1, 2/5) * min(1, 0/10) = 0.4 * 0 = 0`
- Result: `0.5 + (0.95 - 0.5) * 0 = 0.5` exactly (full collapse to neutral)
- This satisfies AC-3: "no bucket may ship at 95% off a 2-fragment score"

### Part B: Add confidenceBucketMidpoint Helper to baseRateComputer.ts (if not already exported)

```typescript
export function confidenceBucketMidpoint(confidence: number): number {
  // Same formula as calibrationReportJob.ts:224 — extracts to shared location
  const bucket = Math.min(9, Math.floor(confidence * 10));
  return (bucket * 0.1) + 0.05;  // bucket 0-9 → midpoint 0.05, 0.15, ..., 0.95
}
```

This is already used in `calibrationReportJob.ts` (confirmed via grep in architect handoff); extraction here allows FR-2 and FR-3 to both call it identically.

### Part C: Integrate into get_evidence_summary (evidenceTools.ts)

In the tool implementation, after computing `rawScore` (the LR-weighted score from FR-1):

```typescript
// Compute per-direction shrinkage
const shrunkBullishScore = computeConfidenceShrinkage(
  rawScore.bullish,
  bullishFragmentCount,
  minLrSampleSizeForBullish,
  regime  // passed from MCP call
);
const shrunkBearishScore = computeConfidenceShrinkage(
  rawScore.bearish,
  bearishFragmentCount,
  minLrSampleSizeForBearish,
  regime
);
const shrunkNeutralScore = computeConfidenceShrinkage(
  rawScore.neutral,
  neutralFragmentCount,
  minLrSampleSizeForNeutral,
  regime
);

// Compute correction factors (FR-2 fills these in later; for now, default 1.0)
const bucketMidpoint = confidenceBucketMidpoint(shrunkScore);
const correctionFactor = 1.0;  // TODO: replace with calibrationCorrectionStore.getCorrectionFactor(db, bucketMidpoint) in FR-2

// Final published probability (with 0.05-0.95 clamp)
const publishedProbabilityBullish = Math.max(0.05, Math.min(0.95, shrunkBullishScore * correctionFactor));
const publishedProbabilityBearish = Math.max(0.05, Math.min(0.95, shrunkBearishScore * correctionFactor));
const publishedProbabilityNeutral = Math.max(0.05, Math.min(0.95, shrunkNeutralScore * correctionFactor));
```

Return these as `published_probability_{direction}` fields in the MCP response.

### Part D: Update MCP Tool Schema

Add to the Zod schema:
```typescript
regime: z.enum(["TIGHTENING", "EASING", "NEUTRAL"]).optional(),
published_probability_bullish: z.number(),
published_probability_bearish: z.number(),
published_probability_neutral: z.number(),
```

Update tool docstring to describe the shrinkage and honest-degrade behavior.

### Part E: Retire Multipliers in daily-predict.md

**Remove completely (find and delete these lines/blocks):**
1. Line 25: `final_confidence = min(0.95, max(0.05, computed * 0.90))` (unconditional TIGHTENING multiplier)
2. Line 30: `final_confidence = min(0.95, max(0.05, computed * 0.90))` (conditional degrading-calibration multiplier)

**Replace line 62 P-5 section from:**
```
Probability: min(0.95, max(0.05, score * top_likelihood_ratio))
```

**To:**
```
Read published_probability_{direction} directly from the tool output — do not compute locally
```

**Update line 192 P-8 WORK narrative from:**
```
"-10% dampening applied when calibration degrades..."
```

**To:**
```
"Server-side evidence-aware confidence shrinkage applied based on fragment count and LR sample strength. Stronger evidence → less shrinkage."
```

**Keep P-0 boolean `DAMPENING_ACTIVE`** as a narrative/logging flag (still gates P-8 text), but remove any arithmetic operations tied to it.

---

## minLrSampleSize Calculation

In `get_evidence_summary`, compute the MINIMUM sample size across the top-5 contributing fragments for each direction:

```typescript
// After ranking fragments by magnitude*confidence for each direction:
const topFragments = bullishFragments.slice(0, 5);
const minLrSampleSize = Math.min(...topFragments.map(f => {
  const selectedRatio = selectLikelihoodRatio(ratiosForType);  // reuse from FR-1
  return selectedRatio.sampleSize;
}));
```

This captures the "weakest-link" principle: even if 4 fragments have high-confidence LRs, one untested fragment still forces caution.

---

## Verification Checklist

- [ ] `computeConfidenceShrinkage(0.95, 2, 0)` returns exactly `0.5` (anti-DESC-flip assertion)
- [ ] `computeConfidenceShrinkage(0.5, X, Y)` returns exactly `0.5` for any X, Y (neutral score unchanged)
- [ ] `computeConfidenceShrinkage(0.95, 10, 10)` returns close to `0.95` (high evidence, minimal shrinkage)
- [ ] `computeConfidenceShrinkage(0.95, 5, 10, "TIGHTENING")` returns between shrunk-score and shrunk-score*0.9
- [ ] `daily-predict.md` diff shows lines 25 and 30 completely removed (no dead code)
- [ ] `daily-predict.md` line 62 no longer computes `score * top_likelihood_ratio` (reads published_probability instead)
- [ ] All existing test suites green
- [ ] New unit tests on `computeConfidenceShrinkage` cover boundary cases and the negative-space assertion (2-fragment/untrusted = 0.5)

