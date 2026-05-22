# Target State — Three-Tier Final Layout

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## 1. Proposed `packages/primitives/` — Full Named List

Each primitive: one operation, infra-free, port-driven, no sibling imports.

### Kinh Dich primitives
| Name | Operation | Source file |
|---|---|---|
| `kinh-dich-hexagram-resolver` | Resolve hexagram from 6 signals | `domain/services/kinhDich/hexagramResolver.ts` |
| `kinh-dich-hao-encoder` | Encode Hao lines | `domain/services/kinhDich/haoEncoder.ts` |
| `kinh-dich-nuclear-computer` | Compute nuclear hexagram | `domain/services/kinhDich/nuclearComputer.ts` |
| `kinh-dich-transformed-computer` | Compute transformed hexagram | `domain/services/kinhDich/transformedComputer.ts` |
| `kinh-dich-ngu-hanh-classifier` | Classify Five Elements | `domain/services/kinhDich/nguHanhClassifier.ts` |
| `kinh-dich-formatter` | Format reading for output | `domain/services/kinhDich/kinhDichFormatter.ts` |
| `kinh-dich-hexagram-library` | Static hexagram data store | `domain/services/kinhDich/hexagramLibrary.ts` |

### Technical analysis primitives
| Name | Operation | Source file |
|---|---|---|
| `ta-rsi-calculator` | Compute RSI for price series | extract from `domain/services/technicalIndicators.ts` |
| `ta-macd-calculator` | Compute MACD | extract from same |
| `ta-bollinger-calculator` | Compute Bollinger Bands | extract from same |
| `ta-intraday-analyzer` | Classify intraday pattern | `domain/services/intradayAnalyzer.ts` |
| `ta-volatility-calculator` | Compute adaptive volatility | `domain/services/volatilityCalculator.ts` |
| `ta-correlation-calculator` | Pearson/rolling correlation | `domain/services/correlationCalculator.ts` |

### BCTC / financial-reports primitives
| Name | Operation | Source file |
|---|---|---|
| `bctc-balance-sheet-extractor` | Extract balance sheet figures | `domain/services/financial-reports/balanceSheetExtractor.ts` |
| `bctc-income-statement-extractor` | Extract P&L figures | `domain/services/financial-reports/incomeStatementExtractor.ts` |
| `bctc-cash-flow-extractor` | Extract cash flow figures | `domain/services/financial-reports/cashFlowExtractor.ts` |
| `bctc-ratio-computer` | Compute 22 financial ratios | `domain/services/financial-reports/ratioComputer.ts` |
| `bctc-period-delta-computer` | Compute QoQ/YoY deltas | `domain/services/financial-reports/periodDeltaComputer.ts` |
| `bctc-validator` | Validate accounting identities | `domain/services/financial-reports/bctcValidator.ts` |

### Macro signal primitives
| Name | Operation | Source file |
|---|---|---|
| `macro-carry-trade-signal` | Compute VND carry spread signal | `domain/services/macro/carryTradeSignal.ts` |
| `macro-investment-clock` | Classify macro regime phase | `domain/services/macro/investmentClock.ts` |
| `macro-ism-regime-signal` | Map ISM reading to regime | `domain/services/macro/ismRegimeSignal.ts` |
| `macro-yield-spread-signal` | Compute yield spread | `domain/services/macro/yieldSpreadSignal.ts` |
| `macro-pyramid-tier` | Classify pyramid tier | `domain/services/macro/pyramidTier.ts` |
| `macro-fed-liquidity-spread` | Compute Fed/SBV liquidity spread | `domain/services/macro/computeFedLiquiditySpread.ts` |

### Alert pipeline primitives
| Name | Operation | Source file |
|---|---|---|
| `alert-cooldown` | Check/apply alert cooldown | `domain/services/alertCooldown.ts` |
| `alert-dedup` | Deduplicate by topic/window | `domain/services/alertDedup.ts` |
| `alert-grouper` | Group alerts by sector/type | `domain/services/alertGrouper.ts` |
| `alert-mute-checker` | Check mute rules | `domain/services/alertMuteChecker.ts` |
| `alert-policy-checker` | Apply quality gate policy | `domain/services/alertPolicyChecker.ts` |
| `alert-generator` | Generate alert from signal | `domain/services/alertGenerator.ts` |

### News / NLP primitives
| Name | Operation | Source file |
|---|---|---|
| `news-sentiment-classifier` | Classify bullish/bearish/neutral | `domain/services/sentimentClassifier.ts` |
| `news-cascade-engine` | Propagate impact chain | `domain/services/cascadeEngine.ts` |
| `news-normalizer` | Normalize raw news item | `domain/services/newsNormalizer.ts` |
| `news-relevance-filter` | VN relevance gate | `domain/services/vnRelevanceFilter.ts` |
| `news-chain-synthesizer` | Synthesize final chain verdict | `domain/services/chainSynthesizer.ts` |

### Sector / portfolio primitives
| Name | Operation | Source file |
|---|---|---|
| `sector-rotation-detector` | Detect capital rotation | `domain/services/sectorRotationDetector.ts` |
| `sector-peers-map` | Return sector peer list | `domain/services/sectorPeers.ts` |
| `portfolio-pnl-calculator` | Compute P&L snapshot | `domain/services/portfolioPnlCalculator.ts` |
| `portfolio-risk-calculator` | Score portfolio risk | `domain/services/portfolioRiskCalculator.ts` |
| `portfolio-rebalancing-calculator` | Compute rebalancing deltas | `domain/services/rebalancingCalculator.ts` |
| `portfolio-performance-attribution` | Attribute performance | `domain/services/performanceAttribution.ts` |

### Cross-cutting primitives
| Name | Operation | Source file |
|---|---|---|
| `signal-detector` | Evaluate signal thresholds | `domain/services/signalDetector.ts` |
| `conviction-scorer` | Score signal conviction | `domain/services/convictionScorer.ts` |
| `recency-weighter` | Apply time decay to scores | `domain/services/recencyWeighter.ts` |
| `stock-search` | Search stock by alias/name | `domain/services/stockSearch.ts` + `stockAliases.ts` |
| `foreign-flow-analyzer` | Aggregate buy/sell flow | `domain/services/foreignFlowAnalyzer.ts` |
| `sparkline` | Generate ASCII sparkline | `domain/services/sparkline.ts` |
| `vn-number-parser` | Parse Vietnamese number strings | `domain/services/vnNumberParser.ts` |
| `sandbox-kit` | narrator + renderer tooling | NEW — `packages/primitives/sandbox-kit/` |

**Total proposed primitives: ~48**

---

## 2. Proposed `packages/modules/` — Full Named List

Each module: one bounded context, composes primitives via DI, no cross-module imports.

| Module name | Bounded context | Composes primitives |
|---|---|---|
| `kinh-dich` | Hexagram reading + trading signal | All 7 kinh-dich primitives + signal-detector |
| `technical-analysis` | TA indicators + intraday patterns | ta-rsi, ta-macd, ta-bollinger, ta-intraday, ta-volatility, ta-correlation |
| `financial-reports` | BCTC ingestion, parsing, ratios | All 6 bctc primitives |
| `macro-core` | SBV FX, FRED, base rates, snapshot | macro-investment-clock, macro-fed-liquidity-spread, macro-calendar |
| `macro-signals` | Carry, yield, ISM, investment clock | macro-carry-trade, macro-ism, macro-yield, macro-pyramid |
| `news-analysis` | News search, cascade, sentiment | news-sentiment-classifier, news-cascade-engine, news-normalizer, news-relevance-filter, news-chain-synthesizer |
| `alerts` | Alert lifecycle: dedup, cooldown, group, mute | alert-cooldown, alert-dedup, alert-grouper, alert-mute-checker, alert-policy-checker, alert-generator |
| `portfolio` | Positions, P&L, risk, rebalancing | portfolio-pnl-calculator, portfolio-risk-calculator, portfolio-rebalancing-calculator, portfolio-performance-attribution |
| `briefings` | Briefing assembly, Telegram formatting | news-chain-synthesizer, sparkline, signal-detector, conviction-scorer |
| `sector-analytics` | Sector comparison, rotation, correlation | sector-rotation-detector, sector-peers-map, ta-correlation-calculator |
| `market-context` | Supply chain, energy, credit flow, pharma, legal, climate, leadership, crisis | supply-chain-primitives (new), energy-signals, credit-flow, pharma-signals, legal-risk, climate-impact, leadership-signal |
| `system-ops` | Debug triggers, VPS health, coordination | ops-debug primitives (new) |

**Note:** `sector` barrel's 8+ contexts collapse into `sector-analytics` + `market-context`. `system` barrel's 4 contexts collapse into `system-ops`.

---

## 3. Final `apps/` Microservice Layout

No new microservices added. Existing 10 services remain. Scope changes inside `mcp-server`:

| Service | Change |
|---|---|
| `apps/mcp-server` | Becomes thin composition root: imports from `packages/modules/`, all domain logic migrates out |
| `apps/kinh-dich-service` | No change — already clean DDD. Receives primitives as shared deps via `packages/` |
| `apps/technical-analysis` | No change — already clean DDD |
| `apps/macro-indicators` | No change — already clean DDD |
| All others | No change |

---

## 4. Dependency Graph

```
packages/primitives/          (no deps — port-driven only)
         │
         ▼
packages/modules/             (imports primitives via DI)
         │
         ▼
apps/<microservice>/          (imports modules via composition root)
         │
         ▼
interface/mcp/tools/          (calls application services, zero domain imports)
```

**Cross-tier rules:**
- Primitives: import NOTHING from this repo. Only external interfaces (ports).
- Modules: import primitives. NEVER import other modules.
- Apps: import modules. NEVER import primitives directly. NEVER import other apps.
- Interface layer: import application services (use cases). NEVER import domain directly.

---

## 5. Explicit Deletion List

| What disappears | Why |
|---|---|
| `apps/mcp-server/src/domain/services/index.ts` (139-line megabarrel) | Replaced by individual primitive packages |
| `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` | Infrastructure masquerading as domain — moves to `apps/mcp-server/src/infrastructure/` |
| `apps/mcp-server/src/domain/services/resilientFetcher.ts` | Infrastructure masquerading as domain — same |
| `analysis/index.ts` re-export of `AnalysisThought` / `AnalysisResult` | Replaced by `SequentialAnalysisResponseDTO` |
| Direct `domain/services/index.ts` imports in `interface/mcp/tools/**/*.ts` | Replaced by application service calls |

---

## 6. Explicit Split / Merge List

| What changes shape | From | To |
|---|---|---|
| `sector` barrel (14 exports) | 1 barrel with 8+ contexts | `sector-analytics` + `market-context` modules |
| `system` barrel (17 exports) | 1 barrel with 4 contexts | `system-ops` module (debug-trigger tools in ops) |
| `macro` barrel (12 exports) | 1 barrel with 2 contexts | `macro-core` + `macro-signals` modules |
| `domain/services/kinhDich/` (8 files) | Domain services subfolder | `packages/primitives/kinh-dich-*` |
| `domain/services/financial-reports/` (10 files) | Domain services subfolder | `packages/primitives/bctc-*` |
| `domain/services/macro/` (9 files) | Domain services subfolder | `packages/primitives/macro-*` |
| `alerts` barrel (`registerCronHealthTools`) | alerts module | Moves to `system-ops` module |
| `news-analysis` barrel (`registerAgentSignalTools`) | news-analysis module | Moves to cross-cutting or `system-ops` |
