# Task Report: 1329e — IMF Score Function + WEIGHTS Rescaling
date: 2026-04-25
outcome: APPROVED

## Test Results
- Unit tests (1329e): 13 passed / 0 failed
- Conviction regression (1329b + 312 + 1328e): 55 passed / 0 failed
- Full suite: 6885 passed / 6 failed (all 6 pre-existing, none caused by this task)
- TypeScript: 0 errors

## Critical Checks

### WEIGHTS Sum Arithmetic
Verified via node arithmetic:
```
0.2293 + 0.1913 + 0.1148 + 0.1148 + 0.1148 + 0.1350 + 0.1000 = 1.0000
diff = 0  (exact, not just within tolerance)
```
PASS — sum is exactly 1.0000.

### scoreImfMacro() Purity
Pure function, no imports, same formula as scoreKinhDich(). Maps [-1,+1] → [0,1] via `0.5 + score * 0.5`, clamped. PASS.

## DDD Compliance: PASS
convictionScorer.ts: zero imports from infrastructure/ or application/. Pure domain service.

## Security: PASS
- No process.env usage
- No hardcoded credentials
- No SQL (pure computation)

## Pre-Existing Failures (not caused by 1329e)
Identical failures verified on both base commit (502bad6d) and with 1329e applied:
- `1294b-bctc-fallback.test.ts`: RED 3, 4, 5 (3 tests) — unimplemented fallback feature
- `1319-watchdog-foreign-flow.test.ts`: null reader test (1 test) — pre-existing

## Changed Files
- `apps/mcp-server/src/domain/services/convictionScorer.ts` — WEIGHTS rescaled (7 dims), scoreImfMacro() added, computeConviction() wired, Vietnamese summary updated
- `apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts` — 13 new tests (3 existing + 10 new for 1329e)
- `apps/mcp-server/src/__tests__/312-conviction-kinhdich.test.ts` — 7 weight assertions updated to new values

## Merge Status
Merged to main as 5347ee19. Branch task/1329b-imf-conviction-dimension deleted.
