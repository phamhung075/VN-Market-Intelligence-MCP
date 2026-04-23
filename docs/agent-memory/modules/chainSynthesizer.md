---
agents: unified-agent, architect
trigger: post-merge-review, brownfield-analysis
---

# Module: chainSynthesizer.ts (verified 2026-04-23)

**Status**: SAFE (defensive fallbacks implemented)

**Location**: `src/domain/services/chainSynthesizer.ts`

## Overview

Pure domain service that builds causal narratives from agent findings. Receives ChainLinks (findings from different agents within the same 15-min cycle window for the same stock) and synthesizes them into a SynthesizedChain with conviction scores, action recommendations, Vietnamese narratives, and dimension flags.

## Fallback Behavior (Task 1293d)

Implemented defensive accessors to handle incomplete/undefined signal fields:

### extractConfidence(findingData)
- **Undefined/null confidence** → applies 0.3 penalty, logs warning
  - Distinguishes between "confidence=0" (legitimate low signal) and "confidence=undefined" (missing field)
  - Returns `{ confidence: 0.3, isInitialized: false }`
- **Valid numeric confidence** → clamps to [0, 1], returns `{ confidence, isInitialized: true }`
- **String confidence** → coerces to number, logs warning, clamps to [0, 1]
- **Invalid type (object, boolean, etc.)** → applies 0.3 penalty, logs error

### extractDirection(findingData)
- **Valid "bullish" or "bearish"** → returns as-is
- **Missing/invalid direction** → defaults to "neutral", logs warning

## Known Patterns

- **News Scout truncation**: sometimes omits findingData entirely (response size limit)
  - **Fix in place**: `extractConfidence(link.findingData ?? {})` — treats missing object as all-undefined fields
- **Market Watcher type errors**: sometimes posts with confidence=undefined (JS type coercion bug)
  - **Fix in place**: `extractConfidence` handles undefined explicitly with 0.3 penalty
- **Legacy signals in DB**: old signals may have been stored with incomplete findingData
  - **Fix in place**: defensive fallbacks ensure synthesis continues gracefully instead of crashing
- **Direction consensus issues**: some agents omit direction field entirely
  - **Fix in place**: `extractDirection` defaults to "neutral" for missing/invalid direction

## Conviction Calculation

```
conviction = base + bonus - penalty
  where
    base = average of all confidences (with fallbacks applied)
    bonus = +0.05 per independent agent that confirms direction or validates
    penalty = -0.05 per link with validates=false or confirms_direction=false
    clamped to [0, 1]
```

Chain synthesis **continues gracefully** even when multiple links have uninitialized fields:
- Each missing confidence → 0.3 fallback applied
- Log warning specifies chain ID, stock code, link IDs, and agent names
- Conviction reflects degraded confidence (lower than if all fields were initialized)
- Output SynthesizedChain includes full metadata (rootId, stockCode, narrative, dimensions)

## Last Verified

2026-04-23 (Task 1293d)

## Tests

- **15 assertions** in `src/__tests__/1293d-chain-synthesizer-fallbacks.test.ts` — all GREEN
- **32 existing assertions** in `src/__tests__/chain-synthesizer.test.ts` — all still GREEN
- **Total**: 47 tests, 0 failures

Coverage:
- extractConfidence: undefined/null → 0.3, valid number → clamped, string → coerced, invalid → 0.3
- synthesizeChain with missing confidence: conviction calculated correctly, logs generated
- synthesizeChain with all uninitialized fields: conviction degrades gracefully
- Direction fallback: missing direction → "neutral"
- confidenceBreakdown: includes fallback values for missing fields
- Invalid types (object, null): handled with 0.3 penalty

## Production Safety

✅ All defensive accessors log to console (warn for missing, error for invalid types)
✅ Logs include link ID and agent name for traceability
✅ No crashes when signals have missing/undefined fields
✅ Fallback value (0.3) signals degraded confidence to QA without breaking chain synthesis
✅ All existing tests still pass — backward compatible
