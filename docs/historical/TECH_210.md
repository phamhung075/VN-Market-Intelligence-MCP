---
id: TECH_210
req: REQ_210
sprint: 210
status: APPROVED
author: Architect
date: 2026-04-20
---

# TECH_210 — Module Barrel Index Files Design

## Summary

Add barrel `index.ts` files that declare explicit public contracts per module group. No file moves. No logic changes. Pure additive. Zero production risk.

## Brownfield Findings

| Finding | Decision |
|---------|----------|
| `src/interface/mcp/tools/index.ts` exists (82 lines, incomplete) | Replace entirely — re-export all 100+ tools, grouped by module |
| `src/domain/services/index.ts` exists (partial, 12 exports of ~70+ services) | Replace entirely — re-export all public service symbols |
| `src/scheduler/` has no barrel | Create `src/scheduler/index.ts` re-exporting job functions |
| `registry.ts` imports 60+ individual files | Keep flat imports in registry.ts — DO NOT change registry.ts in this sprint. Module barrels are for external consumers (tests, agents, future phase). Registry flat imports are fine; changing them risks import order bugs with zero benefit now. |
| Tool subdirs (market-data/, financial-reports/, etc.) do not exist | Create as directories containing only `index.ts` barrel — no source files move |

## Architecture Decision: Sub-Barrel Pattern

```
src/interface/mcp/tools/
├── market-data/
│   └── index.ts          ← re-exports from ../marketTools.js, ../priceHistoryTools.js, etc.
├── financial-reports/
│   └── index.ts
├── news-analysis/
│   └── index.ts
├── alerts/
│   └── index.ts
├── portfolio/
│   └── index.ts
├── briefings/
│   └── index.ts
├── macro/
│   └── index.ts
├── sector/
│   └── index.ts
├── kinhdich/
│   └── index.ts
├── system/
│   └── index.ts
├── index.ts              ← top-level barrel: re-exports from all 10 sub-barrels
├── registry.ts           ← UNCHANGED (still imports from flat files directly)
└── [70 flat .ts files]   ← UNCHANGED
```

**Why sub-barrels over a single grouped file**: Agents loading context for "market-data task" can import just `tools/market-data/index.ts` (~9 exports) instead of all 100. Phase 3 file moves will be zero-diff at the barrel level.

## Sub-Barrel File Contracts

### market-data/index.ts
```typescript
export { registerMarketTools } from "../marketTools.js";
export { registerPriceHistoryTools } from "../priceHistoryTools.js";
export { registerForeignFlowTools } from "../foreignFlowTools.js";
export { registerTechnicalIndicatorTools } from "../technicalIndicatorTools.js";
export { registerDataFreshnessTools } from "../dataFreshnessTools.js";
export { registerTickerIntelligenceTools } from "../tickerIntelligenceTools.js";
export { registerPriceAlertTools } from "../priceAlertTools.js";
export { registerMarketContextTools } from "../marketContextTools.js";
export { registerInsiderTools } from "../insiderTools.js";
```

### financial-reports/index.ts
```typescript
export { registerBctcFullTools } from "../bctcFullTools.js";
export { registerEarningsCalendarTools } from "../earningsCalendarTools.js";
export { registerReportTools } from "../reports.js";
```

### news-analysis/index.ts
```typescript
export { registerAnalysisTools } from "../analysis.js";
export { registerCompareTools } from "../compareTools.js";
export { registerCascadeMetricsTools } from "../cascadeMetricsTools.js";
export { registerCascadeOutcomeTools } from "../cascadeOutcomeTools.js";
export { registerAgentSignalTools } from "../agentSignalTools.js";
export { registerSentimentTrendTools } from "../sentimentTrendTools.js";
export { registerSearchStocksTools } from "../searchTools.js";
export { registerSourceHealthTools } from "../sourceHealthTools.js";
```

### alerts/index.ts
```typescript
export { registerAlertTools } from "../alerts.js";
export { registerAlertAccuracyTool } from "../alertAccuracy.js";
export { registerAlertCheckTools } from "../alertCheckTools.js";
export { registerAlertDigestTools } from "../alertDigestTools.js";
export { registerAlertMuteTools } from "../alertMuteTools.js";
export { registerCustomAlertTools } from "../customAlertTools.js";
export { registerCronHealthTools } from "../cronHealthTools.js";
export { registerPipelineHealthTools } from "../pipelineHealthTools.js";
```

### portfolio/index.ts
```typescript
export { registerPortfolioTools } from "../portfolioTools.js";
export { registerPositionTools } from "../positionTools.js";
export { registerPortfolioRiskTool } from "../portfolioRiskTool.js";
export { registerPerformanceTools } from "../performanceTools.js";
export { registerRebalancingTools } from "../rebalancingTools.js";
export { registerTargetAllocationTools } from "../targetAllocationTools.js";
export { registerExportTools } from "../exportTools.js";
```

### briefings/index.ts
```typescript
export { registerSummaryTools } from "../summaryTools.js";
export { registerMarketMessageTools } from "../marketMessageTools.js";
export { registerTelegramTools } from "../telegramTools.js";
export { registerTelegramReportTools } from "../telegramReportTools.js";
export { registerChangelogTools } from "../changelogTools.js";
```

### macro/index.ts
```typescript
export { registerMacroTools } from "../macroTools.js";
export { registerPolicyTools } from "../policyTools.js";
export { registerPredictionTools } from "../predictionTools.js";
export { registerCalibrationTools } from "../calibrationTools.js";
export { registerEvidenceTools } from "../evidenceTools.js";
export { registerRateLimitTools } from "../rateLimitTools.js";
```

### sector/index.ts
```typescript
export { registerSectorComparisonTools } from "../sectorComparisonTools.js";
export { registerSectorRotationTools } from "../sectorRotationTools.js";
export { registerCorrelationTools } from "../correlationTools.js";
export { registerBrokerCredibilityTools } from "../brokerCredibilityTools.js";
export { registerBondMaturityTools } from "../bondMaturityTools.js";
export { registerSupplyChainTools } from "../supplyChainTools.js";
export { registerLegalRiskTools } from "../legalRiskTools.js";
export { registerClimateTools } from "../climateTools.js";
export { registerEnergyTools } from "../energyTools.js";
export { registerPharmaTools } from "../pharmaTools.js";
export { registerPublicInvestmentTools } from "../publicInvestmentTools.js";
export { registerCreditFlowTools } from "../creditFlowTools.js";
export { registerLeadershipTools } from "../leadershipTools.js";
export { registerCrisisTools } from "../crisisTools.js";
```

### kinhdich/index.ts
```typescript
export { registerKinhDichTools } from "../kinhDichTools.js";
```

### system/index.ts
```typescript
export { registerSystemTools } from "../systemTools.js";
export { registerFeedbackTools } from "../feedbackTools.js";
export { registerVpsProxyTools } from "../vpsProxyTools.js";
export { registerAskQueueTools } from "../askQueueTools.js";
export { registerAgentWorkLogTools } from "../agentWorkLogTools.js";
export { registerWatchlistTools } from "../watchlist.js";
```

### Top-level tools/index.ts (replace existing)
Re-exports from all 10 sub-barrels:
```typescript
export * from "./market-data/index.js";
export * from "./financial-reports/index.js";
export * from "./news-analysis/index.js";
export * from "./alerts/index.js";
export * from "./portfolio/index.js";
export * from "./briefings/index.js";
export * from "./macro/index.js";
export * from "./sector/index.js";
export * from "./kinhdich/index.js";
export * from "./system/index.js";
```

## Domain Services index.ts (replace existing)

Replace `src/domain/services/index.ts` with re-exports of ALL public symbols from every service file. Pattern:
```typescript
export * from "./alertCooldown.js";
export * from "./alertDedup.js";
// ... all 70+ files
// Exception: files with no exports or only internal types — skip
```

Files to include: all `.ts` files in `src/domain/services/` except `kinhDich/` (directory — handled separately as `export * from "./kinhDich/index.js"` if barrel exists, else skip).

## Scheduler index.ts (create new)

```typescript
// src/scheduler/index.ts
export * from "./jobs.js";
```

Only `jobs.ts` is the primary orchestrator. Individual job files export their job functions — but since jobs are registered in `jobs.ts`, the scheduler barrel just re-exports from there.

## Test File: src/__tests__/210-module-barrels.test.ts

```typescript
import { describe, it, expect } from "bun:test";

describe("Task 210 — Module Barrel Exports", () => {
  it("market-data barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/market-data/index.js");
    expect(typeof mod.registerMarketTools).toBe("function");
    expect(typeof mod.registerForeignFlowTools).toBe("function");
  });

  it("alerts barrel exports register functions", async () => {
    const mod = await import("../interface/mcp/tools/alerts/index.js");
    expect(typeof mod.registerAlertTools).toBe("function");
    expect(typeof mod.registerPipelineHealthTools).toBe("function");
  });

  it("top-level tools barrel re-exports all sub-barrels", async () => {
    const mod = await import("../interface/mcp/tools/index.js");
    expect(typeof mod.registerMarketTools).toBe("function");
    expect(typeof mod.registerKinhDichTools).toBe("function");
    expect(typeof mod.registerSystemTools).toBe("function");
  });

  it("domain services barrel exports known services", async () => {
    const mod = await import("../domain/services/index.js");
    expect(typeof mod.detectSignals).toBe("function");
    expect(typeof mod.generateAlerts).toBe("function");
    expect(typeof mod.normalizeNews).toBe("function");
  });

  it("scheduler barrel exports from jobs", async () => {
    const mod = await import("../scheduler/index.js");
    // jobs.ts exports registerJobs or equivalent
    expect(mod).toBeDefined();
  });
});
```

## Task Breakdown

| Task | Title | Scope |
|------|-------|-------|
| 1538_a | TDD RED: `210-module-barrels.test.ts` — all assertions fail (barrels don't exist yet) | Dev |
| 1538_b | GREEN: create 10 tool sub-barrel dirs + index.ts files, replace top-level tools/index.ts, replace domain/services/index.ts, create scheduler/index.ts | Dev |

## Execution Order

```
1538_a (TDD RED) → 1538_b (GREEN: create barrels) → tsc clean + tests green
```

## Key Invariants

1. No source file moves — barrels only import from `../file.js` (one level up)
2. No changes to `registry.ts` — it stays flat
3. `bun tsc --noEmit` must be clean after 1538_b
4. Relative paths in barrel files must use `.js` extension (ESM)
5. Sub-barrel dirs contain ONLY `index.ts` — no source files
6. `kinhDich/` directory in domain/services — check if it has an index; if not, export individual files from it directly in the top-level domain services barrel

## Risk

| Risk | Mitigation |
|------|------------|
| Name collision if two sub-barrels export same symbol | None expected (all registerXxx names are unique) |
| TSC error on circular import | Barrels only re-export — no logic — no circular risk |
| `kinhDich/` sub-directory in services | Check contents, export individual files if no barrel |
