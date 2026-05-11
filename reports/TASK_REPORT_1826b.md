# Task Report: 1826b — GSO HTML Parser Observability + Variant 1/2 Regex
date: 2026-05-02
outcome: APPROVED

## Summary
Added Variant 1 (number-before-label) and Variant 2 (data-value attribute) regex patterns to `parseGsoHtml()` for alternate GSO table layouts. Added `console.error` observability logging when no indicators are parsed from a GSO HTML response.

## Changes
- `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts`
  - CPI: added Variant 1 regex `/([\d]+[.,][\d]+)\s*...\s*(?:CPI|chi so gia)/i` (number before label)
  - GDP: added Variant 2 regex `/data-value="([\d.,]+)"[^>]*>...(GDP|tang truong)/i` (data-value attribute)
  - Observability: `console.error` emits raw excerpt (500 chars) when `indicatorCount === 0`
- `apps/mcp-server/src/__tests__/239-macro-indicator-refresh.test.ts`
  - AC-12a: opaque GSO HTML triggers `console.error` with "no CPI/GDP patterns matched"
  - AC-12b: Variant 1 HTML fixture (number before label) yields `success=true, sourceUsed=gso`
  - AC-12c: Variant 2 HTML fixture (data-value attribute) yields `success=true, sourceUsed=gso`

## Test Results
- Unit tests (239 file): 15 passed / 0 failed
- TypeScript: 0 errors (bun tsc --noEmit clean)

## DDD Compliance: PASS
- Changes confined to `src/domain/services/macro/` — no infrastructure imports added
- No business logic moved to interface layer

## Security: PASS
- No hardcoded credentials or API keys
- No process.env usage (Bun.env only)
- No SQL changes
- `console.error` logs HTML excerpt (500 chars) — no secrets in GSO HTML responses

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged to main via `--no-ff` merge commit. Pushed to origin.
Worktree `.claude/worktrees/agent-afc91d0f` removed. Branch `worktree-agent-afc91d0f` deleted.
