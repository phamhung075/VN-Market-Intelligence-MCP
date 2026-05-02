# Task Report: JANITOR-019c — sqlInClause call-site replacements (interface/tools + scheduler + tests)
date: 2026-05-02
outcome: APPROVED

## Summary

Replace all `map(() => "?").join(", ")` inline patterns in the interface/mcp/tools and
scheduler layers, plus 2 test files, with the `sqlInClause()` helper introduced in 019a.
35 occurrences replaced across 18 files (12 interface/tools, 4 scheduler, 2 tests).

Additionally resolved DDD violation introduced by 019b: `sqlInClause` moved from
`infrastructure/db/sqlHelpers.ts` to `domain/utils/sqlHelpers.ts`; infrastructure module
now re-exports from domain. All callers unchanged. DDD test TC-1 now passes.

## Merge Status

- Branch: `task/janitor-019c-interface-scheduler`
- Merge commit: `4a66a751` (--no-ff)
- Message: `merge(janitor-019c): replace sqlInClause call-sites in interface/tools + scheduler + tests`
- Worktree `.claude/worktrees/agent-ac365b45` removed.
- Branch `task/janitor-019c-interface-scheduler` deleted.
- Branch `worktree-agent-ac365b45` deleted.
- Branch `worktree-agent-af8fa7fe` deleted.

## Occurrence Verification

```
grep -r 'map(() => "?").join' apps/mcp-server/src/interface/ apps/mcp-server/src/scheduler/
```
Result: **2 occurrences** — both confirmed out-of-scope:
- `src/interface/mcp/tools/sector/sectorRotationTools.ts` (complex multi-column JOIN not suitable for sqlInClause)
- `src/interface/mcp/bctcDebugTriggerHandler.ts` (out-of-scope for this task)

## Test Results

- Full suite (main, post all merges + DDD fix): **8558 pass / 0 fail**
- TypeScript (`bun tsc --noEmit`): **0 errors**

## DDD Compliance: PASS

DDD violation from 019b (NB-01) resolved in this QA cycle:

- `sqlInClause` moved to `src/domain/utils/sqlHelpers.ts` (pure function, zero infra deps)
- `src/infrastructure/db/sqlHelpers.ts` now re-exports from domain: `export { sqlInClause } from "../../domain/utils/sqlHelpers.js"`
- `src/domain/services/marketContextBuilder.ts` import updated to `../utils/sqlHelpers.js`
- DDD test `TC-1` (`1321-ddd-no-infra-imports-in-domain.test.ts`) now passes.

## Security: PASS

- No hardcoded credentials found.
- `sqlInClause` produces parameterized placeholders only — no string interpolation.
- No `process.env` usage detected in touched files.

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Files Touched by 019c Developer Commit

- `src/__tests__/1347a-test-db-isolation.test.ts`
- `src/__tests__/283-portfolio-conviction-batch.test.ts`
- `src/interface/mcp/tools/alerts/alerts.ts`
- `src/interface/mcp/tools/financial-reports/earningsCalendarTools.ts`
- `src/interface/mcp/tools/kinhdich/kinhDichTools.ts`
- `src/interface/mcp/tools/market-data/marketContextTools.ts`
- `src/interface/mcp/tools/news-analysis/compareTools.ts`
- `src/interface/mcp/tools/portfolio/performanceTools.ts`
- `src/interface/mcp/tools/portfolio/portfolioRiskTool.ts`
- `src/interface/mcp/tools/portfolio/portfolioTools.ts`
- `src/interface/mcp/tools/portfolio/rebalancingTools.ts`
- `src/interface/mcp/tools/portfolio/targetAllocationTools.ts`
- `src/interface/mcp/tools/sector/correlationTools.ts`
- `src/interface/mcp/tools/sector/sectorComparisonTools.ts`
- `src/scheduler/macro/predictionMarketJob.ts`
- `src/scheduler/market-data/taAlertNotifierJob.ts`
- `src/scheduler/news-analysis/dataAuditJob.ts`
- `src/scheduler/portfolio/weeklyPortfolioReportJob.ts`

## Files Touched by QA DDD Fix

- `src/domain/utils/sqlHelpers.ts` (new — moved from infra, pure function)
- `src/infrastructure/db/sqlHelpers.ts` (re-export only)
- `src/domain/services/marketContextBuilder.ts` (import path updated)
