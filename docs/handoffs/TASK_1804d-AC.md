# TASK 1804d-AC — alert-commander cycle.md: Step 3b price-validation override path

## Wave
Wave 3 — depends on 1804d-B + 1804d-C + 1804d-MW (all three must be complete)

## Scope
- `.claude/flows/alert-commander/cycle.md`

## What to build

Insert a new **Step 3b — Price-Validation Override** between the existing Step 3 (signal retrieval) and Step 4 (alert dispatch). The step must instruct alert-commander to:

1. After retrieving a candidate signal, call `getPriceAnomalySignals(ticker, windowHours=24)` to check for a recent `price_anomaly` signal for the same ticker
2. If a `price_anomaly` signal exists with `|move_sigma| >= 2.0`:
   - Call `computeConfidenceBoost(move_sigma, baseConfidence)` to get boosted confidence
   - Replace `signal.confidence` with the boosted value before dispatch
   - Append a note to `signal.detail`: `"[price-validation: +X sigma boost]"`
3. If no `price_anomaly` signal exists or `|move_sigma| < 2.0` → proceed with original confidence unchanged
4. Log the override decision (boosted vs unchanged) at debug level

This is a flow/agent instruction file — clear, imperative prose. Existing steps must not be removed or renumbered; insert Step 3b explicitly.

## Acceptance criteria
- Step 3b is present between Step 3 and Step 4
- Both `getPriceAnomalySignals` and `computeConfidenceBoost` referenced by exact function name
- Sigma threshold (2.0) stated explicitly
- Fallback (no boost) path documented
- No existing steps removed
- File remains coherent and readable end-to-end

## Commit format
```
task(1804d-AC): alert-commander cycle — Step 3b price-validation override path
```
