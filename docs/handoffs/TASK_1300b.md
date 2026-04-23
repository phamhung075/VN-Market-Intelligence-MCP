# Task 1300b: Fix LOW Storage-Layer Truncation + Regression Suite (GREEN Phase)

## Context
Final truncation issue from systematic codebase audit. LOW severity but follows same pattern as CRITICAL/MEDIUM bugs fixed in 1300a.

## Issue to Fix

### policyImpactMapper.ts:233 — LOW
- **File**: `src/domain/services/policyImpactMapper.ts`
- **Line**: 233
- **Current code**:
  ```typescript
  summary: `${rule.summaryTemplate} — ${title.trim() || body.trim().slice(0, 80)}`,
  ```
- **Problem**: Policy impact summary truncated to 80 chars for body text
- **Impact**: Policy analysis entries lose context (lower priority than message reasoning)
- **Fix**: Dynamic length calculation respecting system limits

## Depends On
- Task 1300a merged to main (CRITICAL/MEDIUM fixes applied)

## Fix Pattern (Reference: feedbackTools.ts commit 094b6659)

For policy summary body truncation, use:
```typescript
// BEFORE
summary: `${rule.summaryTemplate} — ${title.trim() || body.trim().slice(0, 80)}`,

// AFTER
const maxBodyLen = Math.max(500, 4096 - header.length - buffer);
const bodyText = body.trim().slice(0, maxBodyLen);
summary: `${rule.summaryTemplate} — ${title.trim() || bodyText}`,
```

## Acceptance Criteria
- [ ] policyImpactMapper.ts uses dynamic length calculation
- [ ] No hard-coded `.slice(0, 80)` on storage-bound policy text
- [ ] Full regression test suite passes:
  - [ ] `bun test` all tests pass (≥6508)
  - [ ] No new test failures introduced
  - [ ] Coverage maintained on policyImpactMapper
- [ ] Integration tests verify:
  - [ ] Policy impact analyzer correctly stores complete summaries
  - [ ] Cascade engine policy rules work end-to-end
- [ ] `bun tsc --noEmit` clean
- [ ] launchctl kickstart verified (if MCP logic touched)

## Branch
`task/1300b-low-truncation-plus-regression`

## Test Coverage
Add regression tests:
- `src/__tests__/policyImpactMapper.test.ts` (add truncation tests)
- Run full suite: `bun test` (verify 6508+ tests, 0 failures)
- Run type check: `bun tsc --noEmit`

## Notes
- This is GREEN phase (final fix) of Sprint 1300
- LOW severity but completes audit findings
- After 1300b merges, ALL storage-layer truncation issues resolved
- Systematic approach ensures no other similar bugs overlooked (grep pattern scan completed)
