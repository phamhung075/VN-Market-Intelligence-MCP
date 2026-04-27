## Task Report 1345c
date: 2026-04-27
outcome: CHANGES_REQUESTED

changed:
- apps/mcp-server/src/__tests__/1345c-polymarket-staleness.test.ts (new, 309 lines)
- apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts (modified)
- apps/mcp-server/src/infrastructure/config.ts (modified — PredictionMarketsConfig + factory)
- mcp.config.json (staleThresholdHours: 24 added)

tests: 7 pass / 0 fail (task-specific) | tsc: 5 errors | ddd: PASS | security: PASS

### Issues Found

#### Blocking

1. `apps/mcp-server/src/infrastructure/config.ts:561` — `predictionMarkets` factory object is missing `staleThresholdHours` in the returned literal. `PredictionMarketsConfig.staleThresholdHours` is required but the factory block (lines 561–582) does not include it. Fix: add `staleThresholdHours: numVal(pm, "staleThresholdHours", 24),` after `curatedMarketIds`.

2. `apps/mcp-server/src/__tests__/1337-infra-db-cb-fixes.test.ts:127` — inline `config` object (used at line 151 `fetchPolymarkets(config, ...)`) is missing `staleThresholdHours`. Fix: add `staleThresholdHours: 24,` to the object literal.

3. `apps/mcp-server/src/__tests__/1337-infra-db-cb-fixes.test.ts:164` — second inline `config` object (used at line 189) is also missing `staleThresholdHours`. Fix: add `staleThresholdHours: 24,` to the object literal.

4. `apps/mcp-server/src/__tests__/164-polymarket-fetcher.test.ts:26` — `BASE_CONFIG: PredictionMarketsConfig` object is missing `staleThresholdHours`. Fix: add `staleThresholdHours: 24,` to the object literal.

5. `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts:507–513` — local variable type for `detectPredictionSignals` declares `recentSentiments: unknown[]` but the real `detectPredictionSignals` function signature uses `RecentSentimentEntry[]`. TypeScript rejects the assignment at line 521. Fix: import `RecentSentimentEntry` from `predictionSignalDetector.js` and change the local type declaration to `recentSentiments: RecentSentimentEntry[]`.

#### Non-Blocking
- None.

## Merge Status
BLOCKED — 5 TypeScript errors must be fixed before merge.
