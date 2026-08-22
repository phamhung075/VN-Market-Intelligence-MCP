---
sprint: SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
branch: task/pec-fr1-lr-weighted
size: M
zone: apps/mcp-server/
depends_on: [TASK-PEC-PREP-GETLR, TASK-PEC-PREP-FIXTURES]
blocks: [TASK-PEC-FR3-FR5]
---

## TLDR

Implement LR-weighted evidence score aggregation: each fragment's contribution to its direction's aggregate score is now multiplied by its own likelihood ratio (from evidence_likelihood_ratios table) before averaging, fixing D1 from po's investigation (ACB fragments with LR<1.0 were unweighted and treated at full strength despite being empirically anti-predictive).

Also extract and share the horizon-selection algorithm into a reusable `selectLikelihoodRatio` helper function that both `evidenceAccumulatorJob` and `evidenceTools` will use identically.

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] New `selectLikelihoodRatio(candidates: RatioCandidate[]): { likelihoodRatio: number; trusted: boolean; sampleSize: number; horizonDays: number | null }` function exported from `baseRateComputer.ts` (domain-pure, no infra imports)
- [ ] `RatioCandidate` is a structural interface (not imported from infra; only fields: `likelihood_ratio`, `sample_size`, `horizon_days`) allowing structural typing with `LikelihoodRatioRow[]` without infra coupling
- [ ] Selection algorithm: prefer shortest-horizon row with `sample_size >= 10` (TRUSTED); else largest-sample-size row (UNTRUSTED); no cross-horizon blending (identical to existing logic at evidenceTools.ts:249-290)
- [ ] `evidenceAccumulatorJob.ts` now imports and calls `selectLikelihoodRatio` for each (evidence_type, direction) pair, using cached `getLikelihoodRatios(db, evidence_type, direction)` results to avoid redundant queries
- [ ] Per-fragment contribution: `contribution = magnitude * confidence * likelihoodRatio` instead of just `magnitude * confidence`; likelihoodRatio comes from `selectLikelihoodRatio`
- [ ] Neutral-prior guard: fragments with no LR row (or LR row with `sample_size < 10`) get `likelihoodRatio = 1.0` from `selectLikelihoodRatio`'s fallback, reusing `clampLikelihoodRatio(0.1, 5.0)` bounds verbatim
- [ ] `evidence_scores.{direction}_score = sum(contribution) / count` (normalization unchanged, only numerator changes from unweighted to weighted)
- [ ] Acceptance identity assertion: ACB bullish score `0.3012 = (0.4224 + 0.1800) / 2` must NO LONGER HOLD when fixtures seed a real LR row with `sample_size >= 10` and `likelihood_ratio != 1.0`
- [ ] Existing tests in `1118-evidence-accumulator-job.test.ts` stay green (neutral-prior default means existing fixtures without LR rows behave identically to before)
- [ ] New test case in 1118 seeding a trusted (`sample_size >= 10`, `likelihood_ratio != 1.0`) LR row and proving the weighted numerator changes the final score
- [ ] All existing suites (1121/1127/1128/1129/1173/1392, plus 1116/1117/1124/1194 from NFR-2) stay green

**Files to read first:**
- `docs/handoffs/SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-BA-spec.md` [Architect] Brownfield Findings §FR-1, §Design decisions (selectLikelihoodRatio), §Regression-risk finding (first bullet)
- `apps/mcp-server/src/infrastructure/db/likelihoodRatioStore.ts:122-185` (getLikelihoodRatios/getLikelihoodRatio signatures and neutral-prior pattern)
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts:249-290` (existing horizon-selection logic to refactor into shared helper)
- `apps/mcp-server/src/scheduler/news-analysis/evidenceAccumulatorJob.ts:18-27, 94-119` (current import list and per-direction score loop)
- `apps/mcp-server/src/domain/services/baseRateComputer.ts` (existing DDD-pure precedent, see header docstring)

**Files to create:** None (helpers added to existing files)

**Files to modify:**
- `apps/mcp-server/src/domain/services/baseRateComputer.ts` (add `RatioCandidate` interface + `selectLikelihoodRatio` function)
- `apps/mcp-server/src/scheduler/news-analysis/evidenceAccumulatorJob.ts` (import selectLikelihoodRatio, add getLikelihoodRatios calls, weight fragments)
- `apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts` (refactor horizon-selection to call shared `selectLikelihoodRatio`)
- `apps/mcp-server/src/__tests__/1118-evidence-accumulator-job.test.ts` (add new test case seeding LR row with ratio != 1.0)

**Dependencies:** TASK-PEC-PREP-GETLR (must land first so getLikelihoodRatios doesn't throw in tests), TASK-PEC-PREP-FIXTURES (1118 fixture must have evidence_likelihood_ratios table)

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- Existing `baseRateComputer.ts` DDD-pure pattern (no infra imports)
- Structural typing in TypeScript (TS excess-property checks, nominal vs structural)

---

## Technical Details

### Part A: Shared Helper — selectLikelihoodRatio in baseRateComputer.ts

Add to `baseRateComputer.ts`:

```typescript
export interface RatioCandidate {
  likelihood_ratio: number;
  sample_size: number;
  horizon_days: number;
}

export function selectLikelihoodRatio(candidates: RatioCandidate[]): {
  likelihoodRatio: number;
  trusted: boolean;
  sampleSize: number;
  horizonDays: number | null;
} {
  if (candidates.length === 0) {
    return { likelihoodRatio: 1.0, trusted: false, sampleSize: 0, horizonDays: null };
  }
  
  // Prefer shortest-horizon row with sample_size >= 10 (TRUSTED)
  const trustedByHorizon = candidates.filter(c => c.sample_size >= 10).sort((a, b) => a.horizon_days - b.horizon_days);
  if (trustedByHorizon.length > 0) {
    const selected = trustedByHorizon[0];
    return {
      likelihoodRatio: clampLikelihoodRatio(selected.likelihood_ratio),
      trusted: true,
      sampleSize: selected.sample_size,
      horizonDays: selected.horizon_days
    };
  }
  
  // Else largest sample_size (UNTRUSTED)
  const largest = candidates.reduce((a, b) => (a.sample_size > b.sample_size ? a : b));
  return {
    likelihoodRatio: clampLikelihoodRatio(largest.likelihood_ratio),
    trusted: false,
    sampleSize: largest.sample_size,
    horizonDays: largest.horizon_days
  };
}
```

**Key properties:**
- Uses structural typing: `RatioCandidate` only requires the 3 fields; `LikelihoodRatioRow[]` from infra satisfies this structurally without infra import
- Reuses existing `clampLikelihoodRatio(0.1, 5.0)` bounds
- Returns 1.0 for empty candidates array (neutral-prior contract)
- Mirrors existing logic at evidenceTools.ts:249-290 exactly

### Part B: Wire FR-1 into evidenceAccumulatorJob.ts

1. Add import: `import { selectLikelihoodRatio } from '../../domain/services/baseRateComputer';`
2. Add import: `import { getLikelihoodRatios } from '../db/likelihoodRatioStore';` (if not already imported)
3. In the per-direction loop (around line 94-119), for each direction:
   - Before the fragment loop, create a cache: `const lrCache = new Map<string, LikelihoodRatioRow[]>();`
   - For each fragment:
     - Cache key: `${fragment.evidence_type}|${fragment.direction}`
     - If not in cache, fetch: `getLikelihoodRatios(db, fragment.evidence_type, fragment.direction)`
     - Get cached candidates: `const ratioRow = lrCache.get(cacheKey);`
     - Call: `selectLikelihoodRatio([ratioRow] || [])`
     - Weight contribution: `contribution = fragment.magnitude * fragment.confidence * selectedRatio.likelihoodRatio`
   - Sum weighted contributions and normalize: `score = sum(contributions) / count` (same as before, only numerator changes)

4. Update the score row insert to use this weighted score (existing column name and schema unchanged).

### Part C: Refactor evidenceTools.ts to Use Shared Helper

In `get_evidence_summary` function (around line 249-290), replace the inlined horizon-selection logic with a call to `selectLikelihoodRatio`:

```typescript
// Old: inlined loop
// New:
const selectedRatio = selectLikelihoodRatio(ratiosForDirection);
// Use selectedRatio.likelihoodRatio, selectedRatio.trusted, etc.
```

No change to the tool's return contract or behavior; just refactored to share the algorithm.

---

## Acceptance Identity

The architect specifies the ACB example: today, ACB bullish score is `0.3012 = (0.4224 + 0.1800) / 2`. Once this task lands and a fixture seeds a real LR row with `sample_size >= 10` and `likelihood_ratio != 1.0`, that arithmetic identity must BREAK. The new numerator with weighting will be different, proving the LR weighting took effect.

**Test this explicitly:**
```typescript
// In 1118-evidence-accumulator-job.test.ts, add new test case:
it('applies LR weighting when trusted LR row exists', async () => {
  // Setup: seed evidence_fragments + evidence_likelihood_ratios with ratio != 1.0
  // Run: evidenceAccumulator
  // Assert: the final score is NOT the plain unweighted mean anymore
});
```

---

## Verification Checklist

- [ ] `selectLikelihoodRatio` is exported from `baseRateComputer.ts` and has no infra imports (jq check: grep for "from.*infrastructure" in baseRateComputer.ts should not appear)
- [ ] Both `evidenceAccumulatorJob.ts` and `evidenceTools.ts` call `selectLikelihoodRatio` identically (code review: same call signature, same usage pattern)
- [ ] Existing 1118 tests pass (exact-value assertions with neutral-prior default)
- [ ] New 1118 test case proves weighting effect (non-1.0 LR changes the numerator)
- [ ] All 6 suites (1121/1127/1128/1129/1173/1392) + 5 supplemental (1118/1116/1117/1124/1194) stay green

