# TASK REPORT 232c — Three Routers + Config Extension

**Task ID**: 232c
**Status**: DONE
**Date Completed**: 2026-04-21
**Team**: Developer + QA

---

## Summary

Successfully implemented three source routers (news, price, BCTC) + mcp.config.json fallbacks configuration. All 20 test assertions pass. Security compliance verified (Bun.env used instead of process.env).

---

## Implementation Details

### Files Created

1. **src/infrastructure/fetchers/newsSourceRouter.ts** (122 lines)
   - Route news fetches through primary VPS or fallback chain (cache → domestic RSS)
   - Decision: circuit breaker "open" OR last success > 15 minutes → use fallbacks
   - Domestic RSS conditional on config + cache article count

2. **src/infrastructure/fetchers/priceSourceRouter.ts** (103 lines)
   - Route price fetches through primary VPS or fallback chain (cache → Yahoo Finance)
   - Decision: last quote > 10 minutes stale → use fallbacks
   - Yahoo fallback only for major HOSE caps; coverage gap reporting for HNX/UPCOM

3. **src/infrastructure/fetchers/bctcSourceRouter.ts** (106 lines)
   - Route BCTC report fetches through primary VPS or fallback chain (cache → Công Báo)
   - Decision: last fetch > 6 hours old OR circuit breaker "open" → use fallbacks
   - Công Báo conditional: config enabled AND breaker open ≥120 minutes

4. **mcp.config.json** (extended with fallbacks block)
   - `enableDomesticNewsFallback` (bool): opt-in for domestic RSS
   - `enableCongbaoFallback` (bool): opt-in for Công Báo
   - `congbaoMinVpsOpenMinutes` (number): VPS open duration threshold before Công Báo engagement
   - `thresholds`: staleness thresholds for news (15min), prices (10min), BCTC (360min), SBV rates (120min), foreign flow (60min)

---

## Test Results

### Baseline
- Task 232b (resilientFetcher): 11 assertions PASS ✓

### New Assertions
- AC-2 (newsSourceRouter): 2 PASS
- AC-3 (priceSourceRouter): 2 PASS
- AC-4 (bctcSourceRouter): 2 PASS
- AC-8 (domestic RSS opt-in): 2 PASS
- AC-11 (circuit breaker visibility): 1 PASS

**Total: 20/20 assertions PASS** ✓

### Command
```bash
bun test src/__tests__/232-cowork-resilience.test.ts
```

---

## Verification Checklist

| Item | Result |
|------|--------|
| TypeScript strict mode | ✓ Clean |
| Security (Bun.env vs process.env) | ✓ Compliant (commit 04ff3d7) |
| DDD layer isolation | ✓ Verified (no domain/application imports) |
| Router purity (no side effects) | ✓ Confirmed |
| VPS stale thresholds | ✓ Correct (15/10/360 min) |
| Fallback chains | ✓ Well-formed |
| Config structure | ✓ Well-formed JSON |
| Regression tests | ✓ No failures |

---

## Key Decisions

1. **Router as pure decision functions**: Routers read circuit breaker state and config, return structured route objects. They do NOT execute fetches. Fetchers are constructed separately by callers.

2. **Opt-in fallbacks**: Domestic RSS and Công Báo are disabled by default in mcp.config.json (set to false) due to bot-risk and parsing complexity. Operators can enable them per environment.

3. **Staleness boundaries**: Used `>` (not `>=`) for threshold comparisons. Example: if `lastSuccessMinutesAgo === 15`, do NOT trigger fallback for news (threshold is 15 minutes).

4. **Coverage gap reporting**: priceSourceRouter includes `coverageGap` field to alert when fallback cannot cover a ticker (e.g., HNX/UPCOM not available from Yahoo).

---

## Issues Fixed

**Commit 04ff3d7**: Changed `process.env.VINAHOST_IP` → `Bun.env.VINAHOST_IP` in newsSourceRouter.ts:88 per QA security compliance.

---

## Integration Next Steps

→ **TASK_232d**: Agent .md Step 0c integration + config loading (4 hours)

Agents (01-news-scout, 02-financial-analyst, 04-market-watcher) will call these routers to construct fetcher chains for resilientFetcher orchestration.

---

## Branch

Commit: `04ff3d7`
Merged to: `main`
Branch deleted: `task/232c-*`

---

**QA Sign-off**: 2026-04-21 ✓
**Report**: `/reports/TASK_REPORT_232c.md`
