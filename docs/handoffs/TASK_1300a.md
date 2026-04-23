# Task 1300a: Fix CRITICAL/MEDIUM Storage-Layer Truncation (RED Phase)

## Context
Two storage-layer message truncation bugs discovered during codebase audit. Both use hard-coded `.slice(0, 500)` causing incomplete data storage before DB insertion.

## Issues to Fix

### 1. runPredictionImpactChain.ts:113 — CRITICAL
- **File**: `src/application/usecases/runPredictionImpactChain.ts`
- **Line**: 113
- **Current code**:
  ```typescript
  `${signal.reasoning}`.slice(0, 500);
  ```
- **Problem**: Signal reasoning truncated to 500 chars before storage in analysis_entries table
- **Example impact**: "...market continues to show promising fundamenta" instead of "fundamentals"
- **Fix**: Dynamic length calculation respecting system limits

### 2. newsNormalizer.ts:854 — MEDIUM
- **File**: `src/domain/services/newsNormalizer.ts`
- **Line**: 854
- **Current code**:
  ```typescript
  const summary = rawSummary.slice(0, 500);
  ```
- **Problem**: News article summary truncated to 500 chars before storage
- **Fix**: Dynamic length calculation respecting system limits

## Fix Pattern (Reference: feedbackTools.ts commit 094b6659)

Replace hard-coded limits with:
```typescript
// BEFORE
const summary = rawSummary.slice(0, 500);

// AFTER
const maxDetailLen = Math.max(1000, 4096 - headerFooter.length - 100);
const summary = rawSummary.slice(0, maxDetailLen);
```

**Rationale**:
- Minimum 1000 chars ensures reasonable detail retention
- Respects Telegram API 4096 char limit when applicable
- 100-char buffer for metadata
- Allows system to auto-scale based on context

## Acceptance Criteria
- [ ] runPredictionImpactChain.ts uses dynamic length calculation
- [ ] newsNormalizer.ts uses dynamic length calculation
- [ ] No hard-coded `.slice(0, 500)` on storage-bound text remains
- [ ] Unit tests verify:
  - Short text (<1000 chars) stored untruncated
  - Long text (>limit) truncated gracefully at word boundary when possible
  - Reasoning/summary fields contain complete meaningful text
- [ ] `bun test` suite ≥6508 tests passing
- [ ] `bun tsc --noEmit` clean
- [ ] Existing analysis_entries queries still work (schema unchanged)

## Branch
`task/1300a-critical-truncation-fix`

## Test Files
Update or create tests in:
- `src/__tests__/runPredictionImpactChain.test.ts` (if exists, add truncation tests)
- `src/__tests__/newsNormalizer.test.ts` (if exists, add truncation tests)

## Notes
- Both issues follow same pattern as feedbackTools.ts bug (fixed in 094b6659)
- Systematic audit found 3 truncation issues; this task covers 2 (CRITICAL + MEDIUM)
- LOW severity issue (policyImpactMapper.ts) deferred to 1300b
