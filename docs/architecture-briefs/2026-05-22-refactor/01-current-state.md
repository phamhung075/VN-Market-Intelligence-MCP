# Current State Inventory — Three-Tier Classification

**Parent:** `../2026-05-22-deep-module-ddd-with-dashboards.md`
**Date:** 2026-05-22  **Author:** Architect

---

## 1. Three-Tier Model (locked naming)

```
packages/primitives/<name>/   ← one operation = one verb, infra-free, port-driven
packages/modules/<name>/      ← one bounded context, composes primitives via DI
apps/<name>/                  ← one deployable concern, composes modules via composition root
```

---

## 2. Current Microservices — Tier-3 classification

| Service | Folder | Lang/Runtime | Port | Size Assessment | Verdict |
|---|---|---|---|---|---|
| mcp-server | `apps/mcp-server` | TypeScript/Bun | 3000 | FAT — 12 module barrels + 62-file scheduler + 139-line domain megabarrel | Over-sized: acts as both gateway and domain engine |
| api-gateway | `apps/api-gateway` | Go | 4000 | Thin routing layer | Correct scope |
| stock-price | `apps/stock-price` | Go (CGO) | 5010 | 3-tier fallback fetcher + push receiver | Correct scope |
| pdf-extractor | `apps/pdf-extractor` | Python/FastAPI | 5001 | OCR pipeline isolated | Correct scope |
| rag-service | `apps/rag-service` | Python/FastAPI | 5002 | Embeddings + LanceDB search | Correct scope |
| technical-analysis | `apps/technical-analysis` | TypeScript/Bun | 5003 | DDD 4-layer (domain/app/infra/interface) clean | Correct scope |
| macro-indicators | `apps/macro-indicators` | TypeScript/Bun | 5004 | DDD 4-layer clean | Correct scope |
| kinh-dich-service | `apps/kinh-dich-service` | TypeScript/Bun | 5005 | 11-file clean DDD: domain/app/infra/interface | Correct scope — PILOT TARGET |
| alert-engine | `apps/alert-engine` | Go (CGO) | 5006 | Signal evaluation isolated | Correct scope |
| news-fetch | `apps/news-fetch` | TypeScript/Bun | 5008 | Scrapers + push isolated | Correct scope |

**Conclusion:** 9 of 10 deployed services are correctly scoped. `mcp-server` is the sole over-sized service — it is the entire target of this refactor.

---

## 3. Module Barrels — Current Severity (from Phase 0 audit)

> Severity: GREEN=1-3 exports, YELLOW=4-8, RED=>8 or domain-type leaks

| Module | Exports | Severity | Priority |
|---|---|---|---|
| kinhdich | 1 | GREEN | Pilot candidate |
| backtesting | 3 | GREEN | Minor risk (possible duplicate registrar) |
| briefings | 5 | GREEN | — |
| portfolio | 7 | YELLOW | — |
| financial-reports | 7 | YELLOW | Growth risk (BCTC features accumulating) |
| news-analysis | 8 | YELLOW | `registerAgentSignalTools` is cross-cutting |
| alerts | 9 | YELLOW | `registerCronHealthTools` belongs in system |
| market-data | 9 | YELLOW | Meta-tools span multiple domains |
| macro | 12 | RED | Needs `macro-core` / `macro-signals` split |
| sector | 14 | RED | 8+ bounded contexts shoehorned together |
| system | 17 | RED | Catch-all: debug triggers + coordination + agent-internal |
| analysis | 4 symbols | RED | `AnalysisThought` + `AnalysisResult` domain-type leaks |

---

## 4. Domain Services Megabarrel — Priority-1 Split Target

File: `apps/mcp-server/src/domain/services/index.ts`
Lines: 139 (barrel) referencing **84 service files** across flat + 3 subfolders.

Subfolders with structured domain logic (already partially primitive-shaped):
- `domain/services/kinhDich/` — 8 files: hexagramLibrary, hexagramResolver, haoEncoder, nuclearComputer, transformedComputer, nguHanhClassifier, kinhDichReading, kinhDichFormatter → **ready for extraction as `packages/primitives/kinh-dich-*`**
- `domain/services/financial-reports/` — 10 files: extractors, ratioComputer, bctcValidator, periodDeltaComputer → **ready for extraction as `packages/primitives/bctc-*`**
- `domain/services/macro/` — 9 files: carryTradeSignal, investmentClock, ismRegimeSignal, pyramidTier, yieldSpreadSignal, fedLiquiditySpread, macroCalendar, macroIndicatorFetcher, marketEarningYield → **ready for extraction as `packages/primitives/macro-*`**

Flat files (84 - 3 index.ts - 8 kinhDich - 10 financial-reports - 9 macro = **~54 flat files**) — these need classification.

**The 10 most-imported flat domain services (highest primitive extraction value):**
1. `cascadeEngine.ts` — news → signal cascade logic (alert module + news-analysis + briefings)
2. `signalDetector.ts` — threshold evaluation (alert engine cross-cutting)
3. `alertCooldown.ts`, `alertDedup.ts`, `alertGrouper.ts` — alert lifecycle primitives
4. `sentimentClassifier.ts` — NLP classifier (news-analysis + briefings)
5. `volatilityCalculator.ts` — price math (market-data + alerts)
6. `technicalIndicators.ts` — RSI/MACD/BB (market-data + TA service bridge)
7. `sectorPeers.ts` — sector mapping data (sector + portfolio + news)
8. `portfolioPnlCalculator.ts` / `portfolioRiskCalculator.ts` — portfolio math
9. `correlationCalculator.ts` — price correlation (market-data + sector)
10. `foreignFlowAnalyzer.ts` — buy/sell flow aggregation (market-data)

---

## 5. Bounded Context Violations — Modules That Are 2+ Contexts

**sector (14 exports — 8+ contexts mashed together):**
- Sector analytics: comparison, rotation, correlation → belongs in `modules/sector-analytics`
- Supply chain: supplyChainAnalyzer, supplyChainEventDetector → `modules/supply-chain`
- Legal risk: legalRiskDetector → `modules/legal-risk`
- Climate impact: climateImpactMapper → `modules/climate-impact`
- Energy market: energyMarketAnalyzer → `modules/energy-signals`
- Pharma events: pharmaEventMapper → `modules/pharma-signals`
- Credit flow: creditFlowAnalyzer → `modules/credit-flow`
- Leadership signals: leadershipSignal → `modules/leadership-signals`

**system (17 exports — 4 contexts mashed together):**
- Watchlist + ask queue + feedback → `modules/system-config`
- Debug triggers (BCTC, price, TA) → `modules/ops-debug`
- VPS proxy health → `modules/vps-ops`
- Agent coordination tools → `modules/agent-tools`

**macro (12 exports — 2 contexts):**
- Core macro (SBV, FRED, snapshot, base rates) → `modules/macro-core`
- Macro signals (carry trade, yield spread, ISM, investment clock, pyramid tier) → `modules/macro-signals`

---

## 6. Primitives Already Hiding Inside Modules — Extraction Candidates

These are classes/functions inside existing modules that are already primitive-shaped (infra-free, single operation) but not yet extracted:

| Primitive candidate | Currently hiding in | Operation |
|---|---|---|
| `RSICalculator` / `MACDCalculator` / `BBCalculator` | `domain/services/technicalIndicators.ts` → market-data | Compute one TA indicator |
| `HexagramResolver` | `domain/services/kinhDich/hexagramResolver.ts` → kinhdich module | Resolve one hexagram from signals |
| `HaoEncoder` | `domain/services/kinhDich/haoEncoder.ts` | Encode Hao lines from input |
| `NuclearComputer` | `domain/services/kinhDich/nuclearComputer.ts` | Compute nuclear hexagram |
| `RatioComputer` | `domain/services/financial-reports/ratioComputer.ts` | Compute 22 financial ratios |
| `PeriodDeltaComputer` | `domain/services/financial-reports/periodDeltaComputer.ts` | QoQ/YoY delta |
| `BctcValidator` | `domain/services/financial-reports/bctcValidator.ts` | Validate accounting identity |
| `CarryTradeSignal` | `domain/services/macro/carryTradeSignal.ts` | Compute carry spread signal |
| `InvestmentClock` | `domain/services/macro/investmentClock.ts` | Classify macro regime phase |
| `ISMRegimeSignal` | `domain/services/macro/ismRegimeSignal.ts` | Map ISM reading to regime |
| `VolatilityCalculator` | `domain/services/volatilityCalculator.ts` | Compute adaptive vol |
| `SentimentClassifier` | `domain/services/sentimentClassifier.ts` | Classify news sentiment |
| `CascadeEngine` | `domain/services/cascadeEngine.ts` | Propagate impact chain |
| `CorrelationCalculator` | `domain/services/correlationCalculator.ts` | Pearson/rolling correlation |
| `SectorRotationDetector` | `domain/services/sectorRotationDetector.ts` | Detect sector rotation |
| `ForeignFlowAnalyzer` | `domain/services/foreignFlowAnalyzer.ts` | Aggregate buy/sell flow |

---

## 7. DDD Violations — Current Known Breaches

1. **Interface → Domain import bypass:** `apps/mcp-server/src/interface/mcp/tools/` files import directly from `domain/services/index.ts` (10+ files confirmed by brief). This bypasses the application layer entirely.
2. **Domain type re-exports from barrel:** `analysis/index.ts` re-exports `AnalysisThought` and `AnalysisResult` (domain entities) to callers. Callers should receive DTOs only.
3. **Domain megabarrel at 139 lines, 84 files:** `domain/services/index.ts` — direct access gateway to all domain internals. Any caller can import any service without going through application layer.
4. **Infrastructure imports in `domain/services/`:** several service files use `resilientFetcher.ts` (an HTTP wrapper, clearly infrastructure) that is co-located inside `domain/services/`. This violates the DDD golden rule (`domain/` has ZERO imports from `infrastructure/`).
5. **`vpsHealthPoller.ts` inside `domain/services/`:** SSH/network polling is infrastructure, not domain.
