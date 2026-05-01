# TASK 1804d-B — computeConfidenceBoost() pure domain service

## Wave
Wave 1 (parallel — no dependencies)

## Scope
- `apps/mcp-server/src/domain/services/confidenceBoost.ts` (new file)

## What to build

Pure function — zero side-effects, zero DB access, zero imports from `infrastructure/`.

```typescript
/**
 * Computes a confidence boost multiplier based on price anomaly sigma.
 *
 * @param moveSigma  - move expressed in standard-deviation units (from PriceAnomalyFindingData.move_sigma)
 * @param baseConfidence - original signal confidence [0, 1]
 * @returns boosted confidence clamped to [0, 1]
 *
 * Boost schedule (additive on top of baseConfidence):
 *   |moveSigma| < 1.5  → no boost (+0.00)
 *   1.5 ≤ |moveSigma| < 2.0 → +0.05
 *   2.0 ≤ |moveSigma| < 3.0 → +0.10
 *   |moveSigma| ≥ 3.0       → +0.20
 *
 * Result is always clamped to [0, 1].
 */
export function computeConfidenceBoost(moveSigma: number, baseConfidence: number): number
```

The exact boost schedule above is the reference. If the architect plan specifies a different schedule, use the architect's numbers and note the deviation in the commit message.

## Acceptance criteria
- Pure function, no I/O
- Handles negative sigma (use absolute value)
- Returns value in [0, 1] always (clamp, never throw)
- 0 inputs return 0 (edge case)
- Exported as named export
- `domain/` imports nothing from `infrastructure/`
- TypeScript compiles clean

## Commit format
```
task(1804d-B): add computeConfidenceBoost() pure domain service
```
