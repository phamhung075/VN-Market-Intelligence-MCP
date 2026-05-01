# Task Report: 1810c — VNM Unit Scale Mismatch Fix
date: 2026-05-01
outcome: APPROVED

## Test Results
- Unit tests (1810c): 5 passed / 0 failed
- Full suite (worktree): 8387 passed / 125 failed (all pre-existing — worktree cut before Sprint 1809a fixes; none in financialFiguresValidator or parseBctcReport scope)
- TypeScript: 0 errors (bun tsc --noEmit clean)

## DDD Compliance: PASS
- `financialFiguresValidator.ts` (domain): zero imports from infrastructure/ or application/
- `parseBctcReport.ts` (application): correctly imports domain function via `.js` ESM path
- `detectUnitMismatch()` is a pure function — no I/O, no DB, no HTTP

## Security: PASS
- No `process.env` (uses `Bun.env` at line 612 of parseBctcReport.ts)
- No hardcoded credentials
- No `any` types (grep match on line 46 was a JSDoc comment word, not a type annotation)
- SQL uses parameterized queries (pre-existing, unchanged)

## Files Modified (3 total, all expected)
- `apps/mcp-server/src/domain/services/financial-reports/financialFiguresValidator.ts` — added `detectUnitMismatch()` pure function + `UNIT_SCALE_RATIO_THRESHOLD` constant (already present, expanded JSDoc)
- `apps/mcp-server/src/application/usecases/parseBctcReport.ts` — Step 5b cross-check: calls `detectUnitMismatch()` before `validateFinancialFigures()`; returns `confidenceFinancial = 0.1` on mismatch instead of hard-fail 0.0
- `apps/mcp-server/src/__tests__/1810c-vnm-unit-mismatch.test.ts` — 5 test cases (new file)

## Logic Review
- `detectUnitMismatch(totalAssets, netRevenue)`: returns true when `max/min > 1000`, guards null/zero inputs. Threshold is correct — a 1000x ratio between balance sheet and income statement figures is physically impossible under normal same-scale extraction.
- Integration in `parseBctcReport` Step 5b: short-circuits `validateFinancialFigures` only when mismatch detected. Normal path is unchanged.
- Outcome: VNM-pattern extractions with cross-statement scale divergence now store with `low_confidence` (0.1) instead of being silently skipped (0.0), enabling downstream audit.

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
MERGED to main via no-ff merge commit.
Worktree `.claude/worktrees/agent-acb89197` removed.
Branch `worktree-agent-acb89197` deleted.
