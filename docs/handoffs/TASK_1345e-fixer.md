# TASK 1345e — Fixer Handoff

**From:** QA (2026-04-27)
**To:** Fixer
**Blocking:** `bun tsc --noEmit` exits with code 2 (4 errors)

---

## Context

Sprint 1345c added `staleThresholdHours` as a required field to `PredictionMarketsConfig` in `src/infrastructure/config.ts` but did not update:
- The config builder that returns the config object
- Two older test files that construct config objects inline

Additionally, a local function type declaration in `predictionMarketJob.ts` uses `unknown[]` where the real function signature requires `RecentSentimentEntry[]`.

All 1345 task tests pass. Only TSC gate is broken.

---

## Blocking Issues — Exact Fixes

### Fix B1 — `src/infrastructure/config.ts:561` (config builder)

Inside the `predictionMarkets: (() => { ... })()` block (around line 578-581), add `staleThresholdHours` before the closing `return {`:

```typescript
// Before (line ~578-581):
        relevantKeywords: arrVal(pm, "relevantKeywords", DEFAULT_PREDICTION_KEYWORDS),
        curatedMarketIds: arrVal(pm, "curatedMarketIds", []),
      };

// After:
        relevantKeywords: arrVal(pm, "relevantKeywords", DEFAULT_PREDICTION_KEYWORDS),
        curatedMarketIds: arrVal(pm, "curatedMarketIds", []),
        staleThresholdHours: numVal(pm, "staleThresholdHours", 24),
      };
```

### Fix B2 — `src/__tests__/1337-infra-db-cb-fixes.test.ts:~140 and ~177`

Two `config` object literals are missing `staleThresholdHours`. Add to each:

```typescript
// Both occurrences — add this line to the config object:
      staleThresholdHours: 24,
```

TSC error locations: lines 151 and 189.

### Fix B3 — `src/__tests__/164-polymarket-fetcher.test.ts:26`

`BASE_CONFIG` object literal is missing the field:

```typescript
// In BASE_CONFIG (around line 26-38), add:
  staleThresholdHours: 24,
```

### Fix B4 — `src/scheduler/macro/predictionMarketJob.ts:512`

The local type declaration uses `unknown[]` but `detectPredictionSignals` requires `RecentSentimentEntry[]`:

```typescript
// Line ~510-513 — change:
      recentSentiments: unknown[],

// To:
      recentSentiments: RecentSentimentEntry[],
```

Also add the import at the top of the dynamic import block or at file top:

```typescript
import type { RecentSentimentEntry } from "../../domain/services/predictionSignalDetector.js";
```

---

## Verification After Fix

```bash
cd apps/mcp-server
bun tsc --noEmit   # must exit 0, 0 errors
bun test src/__tests__/1337-infra-db-cb-fixes.test.ts
bun test src/__tests__/164-polymarket-fetcher.test.ts
bun test src/__tests__/1345c-polymarket-staleness.test.ts
bun test src/__tests__/1345e-integration-pipeline.test.ts
```

All must pass. Then return to QA with: "DONE: TSC errors fixed (B1-B4). NEXT: QA re-run to approve sprint 1345."

---

## Files to Modify

- `apps/mcp-server/src/infrastructure/config.ts` (1 line added)
- `apps/mcp-server/src/__tests__/1337-infra-db-cb-fixes.test.ts` (2 lines added)
- `apps/mcp-server/src/__tests__/164-polymarket-fetcher.test.ts` (1 line added)
- `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts` (1 line changed + import added)

No production logic changes — these are all type annotations and config wiring.
