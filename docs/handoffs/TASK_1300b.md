# Task 1300b: Migrate Storage-Layer Functions to Factory (GREEN Phase)

## Context
RED phase (1300a) created `TelegramMessageFactory` and migrated 4 user-facing briefing jobs. GREEN phase completes the migration by moving 3 storage-layer truncation fixes to the factory and running full regression suite.

## Depends On
- Task 1300a merged to main
- `TelegramMessageFactory` service fully functional and tested

## Storage-Layer Functions to Migrate

| Bug | Location | Current | New | Impact |
|-----|----------|---------|-----|--------|
| 5 | runPredictionImpactChain.ts:113 | `.slice(0, 500)` | `formatSignalReasoning()` | signal analysis |
| 6 | newsNormalizer.ts:854 | `.slice(0, 500)` | `formatNewsSummary()` | financial analysis |
| 7 | policyImpactMapper.ts:233 | `.slice(0, 80)` | `formatPolicySummary()` | policy analysis |

## Migration Steps

### Step 1: Update Storage-Layer Functions
Replace hard-coded truncation with factory calls:

**Before (runPredictionImpactChain.ts:113):**
```typescript
`${signal.reasoning}`.slice(0, 500);
```

**After:**
```typescript
TelegramMessageFactory.formatSignalReasoning(signal.reasoning);
```

**Before (newsNormalizer.ts:854):**
```typescript
const summary = rawSummary.slice(0, 500);
```

**After:**
```typescript
const summary = TelegramMessageFactory.formatNewsSummary(rawSummary);
```

**Before (policyImpactMapper.ts:233):**
```typescript
summary: `${rule.summaryTemplate} — ${title.trim() || body.trim().slice(0, 80)}`,
```

**After:**
```typescript
const formattedBody = TelegramMessageFactory.formatPolicySummary(body.trim());
summary: `${rule.summaryTemplate} — ${title.trim() || formattedBody}`,
```

### Step 2: Add Import Statements
Each file needs:
```typescript
import { TelegramMessageFactory } from "../infrastructure/notifiers/telegramMessageFactory.js";
```

## Acceptance Criteria (GREEN Phase)

- [ ] All 3 storage-layer functions migrated to factory
- [ ] No remaining hard-coded `.slice()` on storage-bound text:
  - [ ] runPredictionImpactChain.ts clean
  - [ ] newsNormalizer.ts clean
  - [ ] policyImpactMapper.ts clean
- [ ] Full regression test suite:
  - [ ] `bun test` all ≥6508 tests passing
  - [ ] 0 test failures
  - [ ] Coverage on TelegramMessageFactory maintained
- [ ] Analysis entries queries still work:
  - [ ] Cascade rules fire correctly
  - [ ] RAG analysis storage unaffected
  - [ ] Policy impact mapper output valid
- [ ] `bun tsc --noEmit` clean
- [ ] No type errors in migrated files

## Test Coverage

Update or create tests:
- `src/__tests__/runPredictionImpactChain.test.ts` — verify formatting
- `src/__tests__/newsNormalizer.test.ts` — verify formatting
- `src/__tests__/policyImpactMapper.test.ts` — verify formatting

All should verify that output uses factory and no truncation occurs unexpectedly.

## Branch
`task/1300b-storage-layer-factory-migration-green`

## Regression Testing Checklist

- [ ] `bun test` full suite passes
- [ ] Cascade engine rules fire and create analysis entries correctly
- [ ] Market analysis briefing jobs still generate valid output
- [ ] Alert digest messages formatted correctly
- [ ] No performance degradation (factory is static, zero overhead)

## Notes
- Factory methods are **static** and lightweight (pure string operations)
- No database calls needed in factory
- GREEN phase = complete migration + verify system health
- After 1300b, ALL truncation issues fixed in ONE place (TelegramMessageFactory)
- Future changes to truncation rules = single file edit, global impact
