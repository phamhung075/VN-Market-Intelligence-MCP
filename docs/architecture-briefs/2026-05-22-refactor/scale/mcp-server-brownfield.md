---
title: "Brownfield Inventory — mcp-server (Phase 0)"
date: "2026-05-25"
author: "architect"
pilot: "mcp-server"
phase: "0"
status: "COMPLETE"
zone: "apps/mcp-server/"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
risk: "HIGHEST"
schedule: "RUN-SOLO / LAST"
---

# Brownfield Inventory — `mcp-server` (Phase 0, Deliverable D1)

**Zone:** `apps/mcp-server/` ONLY  
**Language:** TypeScript / Bun (locked — stays TS, not a pivot candidate)  
**Author:** architect, 2026-05-25  
**Scan status:** COMPLETE — first brownfield doc for this zone

---

## 1. Codebase Size and Structure

| Metric | Value | Notes |
|---|---|---|
| Total tool handler files | 101 `.ts` (excl. `index.ts`, `registry.ts`) | Under `src/interface/mcp/tools/` |
| Tool module barrels | 12 sub-barrels (`alerts`, `analysis`, `backtesting`, `briefings`, `financial-reports`, `kinhdich`, `macro`, `market-data`, `news-analysis`, `portfolio`, `sector`, `system`) | Plus top-level `tools/index.ts` |
| Domain service files | 117 `.ts` | Under `src/domain/services/` |
| Domain services barrel | `src/domain/services/index.ts` — **139 lines** | Priority-1 violation (cap=84) |
| Scheduler job files | 80 `.ts` | Under `src/scheduler/` (all subdirs) |
| CRONS map entries | 73 named keys | `cronConfig.ts` |
| `cron.schedule()` registrations | 68 (in `startScheduler.ts`) | Plus `registerSummaryJobs()` registers 5 more = 73 total |
| Infrastructure files | ~90+ `.ts` | `src/infrastructure/` |
| Schema slices | 9 files | `schema-alerts/backtesting/briefings/financial-reports/macro/market-data/news/portfolio/system` |
| Entry point | `src/index.ts` — 199 lines | Startup orchestrator |
| HTTP server + routes | `src/interface/mcp/server.ts` | Plus 8 route handlers under `routes/` |

---

## 2. Module Barrel Map — Size and Violation Status

### 2a. Domain Services Mega-Barrel (PRIORITY-1 VIOLATION)

**File:** `src/domain/services/index.ts` — **139 lines** (cap=84, over by 55 lines)

This barrel exports across **84 source files** in the `domain/services/` subtree (117 total `.ts` minus `index.ts` and sub-module indexes). The barrel uses collision-avoidance comment blocks (`// alertOutcomeScorer: PricePoint collides with volatilityCalculator`) to explain selective exports — evidence that the barrel is already straining under its own complexity.

**Sub-modules within the barrel:**
- Alert services: 9 files (`alertCooldown`, `alertDedup`, `alertGenerator`, `alertGrouper`, `alertMuteChecker`, `alertPolicyChecker`, `alertOutcomeScorer`, `alertBatchGrouper`, `crisisPatternDetector`)
- Financial-reports sub-folder: 9 files (`balanceSheetExtractor`, `cashFlowExtractor`, `incomeStatementExtractor`, `ratioComputer`, `periodDeltaComputer`, `bctcValidator`, `priceNewsValidator`, `earningsCalendar`, additional guards/helpers)
- Market analysis: 12 files (`signalDetector`, `cascadeEngine`, `chainSynthesizer`, `intradayAnalyzer`, `orderBookAnalyzer`, `priceAlertChecker`, `convictionScorer`, `decisionNoteSynthesizer`, `signalClassWeighter`, `volatilityCalculator`, `performanceAttribution`, `correlationCalculator`)
- Sector & correlation: 4 files
- Macro & prediction: 7 files (`macroIndicatorScorer`, `macroOutlierGuard`, `macroThresholds`, `predictionCascadeMapper`, `predictionSignalDetector`, `forecastConfidenceScore`, `baseRateComputer`)
- News & sentiment: 6 files
- Portfolio & performance: 4 files
- Infrastructure utilities (domain-safe): 5 files (`rateLimiter`, `sparkline`, `timeConstants`, `tradingWindow`, `vnNumberParser`)
- VPS & SLA: 2 files (`vpsHealthPoller`, `freshnessSlaChecker`)
- Thematic: ~14 files (climate, credit, energy, foreign flow, leadership, legal, pharma, policy, supply chain, stock aliases/search, trade relationships, source health, reputation)
- Kinh Dich sub-module: re-exported from `kinhDich/index.ts` and `kinhDich/kinhDichWrapper.ts`
- Macro sub-module: re-exported from `macro/index.ts`

### 2b. Interface-Layer Tool Module Barrels

All 12 tool sub-barrels are compact (5–23 lines each). No barrel violations at this layer.

| Barrel | Lines | Status |
|---|---|---|
| `alerts/index.ts` | 13 | GREEN |
| `analysis/index.ts` | 13 | GREEN |
| `backtesting/index.ts` | 8 | GREEN |
| `briefings/index.ts` | 9 | GREEN |
| `financial-reports/index.ts` | 11 | GREEN |
| `kinhdich/index.ts` | 5 | GREEN |
| `macro/index.ts` | 23 | GREEN |
| `market-data/index.ts` | 13 | GREEN |
| `news-analysis/index.ts` | 12 | GREEN |
| `portfolio/index.ts` | 11 | GREEN |
| `sector/index.ts` | 18 | GREEN |
| `system/index.ts` | 21 | GREEN |
| `tools/index.ts` (top-level) | 33 | GREEN |

### 2c. Infrastructure Barrel

`src/infrastructure/index.ts` — 66 lines. GREEN (at limit; monitor).

### 2d. Root Entry Point

`src/index.ts` — 199 lines. This is the composition root / bootstrap file. NOT a barrel — it is a startup orchestrator. Not in scope for barrel-shrink but must be verified for domain-logic leakage after any refactor.

### 2e. Scheduler Barrel

`src/scheduler/index.ts` — 9 lines. GREEN (thin re-export of `CRONS` + `startScheduler`).

---

## 3. Schema Slices (8 Active + 1 System)

All 9 schema slices already exist. This was a prior-sprint decomposition. Status: DONE, no work needed.

| Slice file | Lines | Domain |
|---|---|---|
| `schema-alerts.ts` | 165 | Alert engine, circuit breakers, verdicts |
| `schema-market-data.ts` | 118 | OHLCV, foreign flow, trading stats |
| `schema-news.ts` | 300 | News articles, agents, signals, cascades |
| `schema-macro.ts` | 330 | Macro indicators, predictions, calibration |
| `schema-financial-reports.ts` | 519 | BCTC, PDFs, OCR, financial reports (LARGEST) |
| `schema-briefings.ts` | 44 | Market messages, changelogs |
| `schema-backtesting.ts` | 36 | Backtesting results |
| `schema-portfolio.ts` | (exists) | Positions, P&L, allocations |
| `schema-system.ts` | (exists) | Coordination, agent memory, job runs |

Schema decomposition: already complete. No further schema splits required for Phase 1.

---

## 4. Scheduler / Cron Coupling

**73 named CRON entries** in `cronConfig.ts`, **68 `cron.schedule()` calls** in `startScheduler.ts` plus `registerSummaryJobs()` (5 summary variants). The remaining 5 entries are consolidated into the `summaryJobs.ts` helper.

**Scheduler subdirectory breakdown:**

| Subdirectory | Job files | Domain |
|---|---|---|
| `alerts/` | 8 | Alert scan, digest, outcome, verdict, signal outcome |
| `audits/` | 1 | Monthly signal quality |
| `briefings/` | 3 | Morning, evening, France summary |
| `digest/` | 1 | Accuracy digest |
| `financial-reports/` | 8 | BCTC pipeline (pull, parse, enrich, sweep, reparse, backfill, fundamentals) |
| `macro/` | 9 | Macro refresh, prediction market/outcome/resolution, calibration, cascade backtest, bond maturity, base rate, SBV, commodity |
| `market-data/` | 11 | Price watchdog, TA scan, BB scan, notifier, OHLCV aggregator/staleness/backfill, foreign flow, insider, VN-Index, IMF poller |
| `news/` | 1 | Reputation compute |
| `news-analysis/` | 7 | Intelligence cycle, SSC, data audit, pattern watch, broker sanctions, evidence accumulator, news headlines |
| `portfolio/` | 1 | Weekly portfolio report |
| `system/` | 7 | Ask queue, daily dashboard, dev heartbeat, freshness SLA, parallel dispatcher, tasks janitor, VPS health, session tool usage |
| Root scheduler | 6 | `cronConfig`, `cronHealthAlert`, `davPharmacy`, `diskUsage`, `integrityCheck`, `pipelineWatchdog`, `vpsProxyWatchdog`, `walCheckpoint`, `weatherCheck` |

**Cron-specific risks flagged:**
- `dailyDashboardJob` has had ENOENT class failures (bug `1960-DAILYDASH-ENOENT`, `A-21c`) — any file-path change during refactor must be verified against this job's dashboard write path.
- `startScheduler.ts` has startup-catchup `setTimeout` blocks (30s delays for `bctcReparseJob`, `morningBriefingJob`, `eveningSummaryJob`, `franceSummaryJob`, `alertDigestJob`, `summaryJob:daily`). These fire-and-forget probes must survive any module reorganization without import changes.
- `foreignFlowFetch` runs every 1 minute — highest-frequency job; any import regression breaks prices within 60s.
- `vnIndexRefresh` runs every 5 minutes during market hours — second-highest frequency.

---

## 5. HTTP-Client Wiring Per Microservice

All inter-service wiring is consolidated in `src/infrastructure/microservices/clients.ts`. This is the canonical G5-inverse verification anchor.

| Microservice | Port | Client function(s) | Tool handler(s) that call it |
|---|---|---|---|
| `api-gateway` | 4000 | `getGatewayHealth()` | `system/vpsHealthTools.ts` |
| `stock-price` | 5000 | `fetchStockPrice()`, `getPriceHistory()` | `market-data/priceHistoryTools.ts`, `market-data/priceAlertTools.ts` |
| `pdf-extractor` | 5001 | `extractBCTCPDF()` | `financial-reports/bctcFullTools.ts`, `financial-reports/reports.ts`; scheduler: `bctcPdfPullJob.ts`, `bctcReparseJob.ts`, `pushBctcExtraction.ts` |
| `rag-service` | 5002 | `searchRAG()`, `indexRAG()` | `news-analysis/analysis.ts` (via `ragHttpClient.ts`); scheduler: `dataAuditJob.ts` |
| `technical-analysis` | 5003 | `computeTAIndicators()` | `market-data/technicalIndicatorTools.ts` (with local fallback); scheduler: `taAlertScanJob.ts`, `bbAlertScanJob.ts` |
| `macro-indicators` | 5004 | `getMacroSnapshot()`, `getMacroExternal()` | `macro/macroTools.ts`, `macro/macroHttpClient.ts`; scheduler: `macroIndicatorRefreshJob.ts` |
| `kinh-dich-service` | 5005 | `getKinhDichReading()`, `getMarketHexagram()`, `getKinhDichHistory()`, `getHexagramTransitions()`, `runKinhDichBacktest()`, `explainHexagram()` | `kinhdich/kinhDichTools.ts` (all 6 tools — HTTP-routed, confirmed) |
| `alert-engine` | 5006 | Not yet wired via `clients.ts` | Alert generation runs local domain services still |

**Also present:**
- `src/infrastructure/rag/ragHttpClient.ts` — dedicated RAG client (parallel to `clients.ts` ragSearch/ragIndex). The `_deprecated/` folder contains `embeddings.ts`, `retriever.ts`, `vectorstore.ts` — confirmed deprecated (G5b complete for rag-service). `dataAuditJob.ts` imports `ragHttpClient.ts` (confirmed HTTP-routed).
- `src/infrastructure/fetchers/pdfExtractorClient.ts` — secondary PDF extractor client (health check + direct extract call). Coexists with `clients.ts extractBCTCPDF()`.

---

## 6. G5-Inverse Rewire Surface — Dead Migrated Code Analysis

The G5-inverse goal for mcp-server: remove domain-layer TS code that has been superseded by Go/Python microservices, and verify every tool handler routes via HTTP.

### 6a. Confirmed HTTP-Routed (No Dead Code)

| Domain | Status | Evidence |
|---|---|---|
| Technical Analysis | ROUTED | `technicalIndicatorTools.ts` imports `computeTAIndicators` from `clients.ts`. No `domain/services/technicalIndicators.ts` file exists. TA domain deleted. |
| Macro Indicators | ROUTED | `macroTools.ts` comment: "Previously imported domain services directly; now routes through HTTP." `getMacroBaseUrl()` used. |
| RAG | ROUTED | `analysis.ts` imports `ragSearch/ragIndex` from `ragHttpClient.ts`. `_deprecated/` folder exists. |
| Kinh Dich (6 core tools) | ROUTED | `kinhDichTools.ts` imports all 6 functions from `clients.ts`. |
| Stock Price | ROUTED | `clients.ts fetchStockPrice/getPriceHistory` wired. |
| PDF Extractor | ROUTED | `clients.ts extractBCTCPDF` + `pdfExtractorClient.ts` dual-client pattern. |

### 6b. Partially Migrated / Residual Domain Imports (G5-Inverse Work Required)

| Item | File | Issue |
|---|---|---|
| `kinhDichWrapper.appendKinhDich()` | `market-data/marketTools.ts:26`, `news-analysis/analysis.ts:22` | Calls local TS domain service (`kinhDichWrapper.ts` = 123L). The kinh-dich-service now owns readings via HTTP. This is integration glue kept intentionally per `kinhDichTools.ts` AC-8 comment. **Needs architect ruling at Phase 1 whether to keep as glue or route via service.** |
| `QUE_META` from `hexagramLibrary.ts` | `portfolio/portfolioTools.ts:26` | Reads static hexagram metadata map. Pure data, no compute. Acceptable as local reference. Low priority. |
| `domain/services/macro/` sub-module | `src/domain/services/macro/` — 10 files | Includes `macroIndicatorFetcher.ts` which likely still fetches external APIs directly. These are called from macro scheduler jobs. Verify whether `macroIndicatorRefreshJob` calls domain fetchers or HTTP service. **High-priority audit for Phase 1.** |
| `domain/services/kinhDich/` — 10 files | Still present and exported via domain barrel | `haoEncoder`, `hexagramBacktester`, `hexagramLibrary`, `hexagramResolver`, `kinhDichFormatter`, `kinhDichReading`, `kinhDichWrapper`, `nguHanhClassifier`, `nuclearComputer`, `transformedComputer` — some are integration glue, others may be dead. Requires per-file audit. |

### 6c. G5-Inverse Priority Order for Tool Verification

Each of the 101 tool handler files must be checked: does it import domain services directly, or route via HTTP/repository? The systematic audit is Phase 1 work, not Phase 0. Seed pattern identified:
- Tools that correctly import from `../../../../infrastructure/microservices/clients.js` = PASS
- Tools that import from `../../../../domain/services/*.js` = needs case-by-case review (some domain imports are legitimate for non-extracted logic)

---

## 7. Dashboards Served by mcp-server

mcp-server hosts multiple in-process HTTP endpoints that serve HTML/JSON dashboards. These are part of the "dashboard circular dependency" risk during refactor.

| Dashboard | Endpoint | Location | Handler |
|---|---|---|---|
| BCTC Inspector | `GET /api/bctc-inspect` | `src/interface/bctc-inspector.html` | `routes/bctcInspectHandler.ts` |
| News-Fetch Live Dashboard | `GET /dashboards/news-fetch/` | `src/interface/news-fetch-dashboard/index.html` | `routes/newsFetchDashboardHandler.ts` |
| News-Fetch Live Data API | `GET /api/news-fetch/live` | (JSON) | `routes/newsFetchLiveHandler.ts` |
| VPS News Health | `GET /api/vps-news-health` | (JSON) | `routes/vpsNewsHealthHandler.ts` |
| Foreign Flow Status | (handler) | (JSON) | `foreignFlowStatusHandler.ts` |

**Circular-dependency risk:** if barrel refactor changes import paths inside `routes/`, the served HTML files reference handler code paths. Dashboard handlers must be verified for import correctness after each barrel split.

The scale pilot for mcp-server does NOT add a new sandbox/dashboard tier (that pattern belongs to the microservices). The dashboards listed above are operational tools, not trust-tier dashboards. The G6-G9 goals for mcp-server apply differently: the "dashboard" trust layer for mcp-server is its own operational health panel, not the three-tier scenario dashboard of the Go/Python services.

---

## 8. Candidate Primitives (Secondary — Barrel Decomposition Is Primary)

Per charter: primitive extraction is SECONDARY. The dominant work is barrel decomposition and G5-inverse routing verification. Candidates below are documented for Phase 2 consideration, not Phase 1 scope.

| Candidate | Current location | Why a primitive |
|---|---|---|
| `vnNumberParser` | `domain/services/vnNumberParser.ts` | Pure number parsing, no I/O, 0 dependencies, already used by multiple callers |
| `sparkline` | `domain/services/sparkline.ts` | Pure compute (ASCII sparkline generation), no I/O |
| `timeConstants` + `tradingWindow` | `domain/services/timeConstants.ts`, `tradingWindow.ts` | Pure time/calendar helpers, no I/O |
| `sectorPeers.getSectorPeers()` | `domain/services/sectorPeers.ts` | Pure lookup from static data map |
| `stockAliases` + `stockSearch` | `domain/services/stockAliases.ts`, `stockSearch.ts` | Pure string/map lookup |
| Signal-bus helpers (`signalDetector`, `signalClassWeighter`) | `domain/services/` | Cross-cutting, used by alert and market-data tools |
| `sector-classifier` | `domain/services/sectorRotationDetector.ts` + `sectorValuationComparator.ts` | Sector-domain compute |
| `portfolio-aggregator` | `domain/services/portfolioPnlCalculator.ts` + `portfolioRiskCalculator.ts` | Portfolio compute |
| Ops-debug triggers | `interface/mcp/tools/system/*DebugTriggerTool.ts` | System ops patterns |

**Estimate: 8-10 candidate primitives.** None extracted in Phase 1.

---

## 9. DDD Layer Assessment

| Layer | Directory | Status |
|---|---|---|
| Domain | `src/domain/services/`, `src/domain/models/`, `src/domain/repositories/`, `src/domain/signals/`, `src/domain/backtesting/` | Present. Domain services barrel is oversized (Priority-1). Some domain services include infrastructure utilities (`rateLimiter`, `resilientFetcher`, `vpsHealthPoller`) — minor DDD drift. |
| Application | `src/application/services/`, `src/application/usecases/` | Present. `backfillBctcPdfPaths.ts` recently added. |
| Infrastructure | `src/infrastructure/` | Present and clean. `rag/_deprecated/` properly quarantined. Microservice clients centralized. |
| Interface | `src/interface/mcp/` (tools, routes, server), `src/interface/scheduler/` | Present. Tool handlers correctly at interface layer. |
| Scheduler | `src/scheduler/` | Hybrid: scheduler jobs are application-layer orchestrators but live in a dedicated top-level directory. This is acceptable for mcp-server's role as the monolith host. |

**DDD violation flagged:** `src/domain/services/rateLimiter.ts`, `src/domain/services/resilientFetcher.ts`, `src/domain/services/vpsHealthPoller.ts` are infrastructure concerns living in the domain layer. Not blocking for Phase 1 but should be addressed in barrel decomposition (move to `infrastructure/`).

---

## 10. Architecture Fence Status

No architecture fence currently enforced for mcp-server. The `package.json` has no `eslint-plugin-boundaries` or equivalent configured. There is a `bun tsc --noEmit` type check. G4 (fence enforcement) is a Phase 2 goal. Phase 1 does not activate a fence.

**ESLint config:** not present in `apps/mcp-server/` (only in node_modules caches). Fence tooling choice for G4: `eslint-plugin-boundaries` (TS/Bun ecosystem, consistent with news-fetch precedent).

---

## 11. Key Risks — Summary

| Risk | Severity | Notes |
|---|---|---|
| R-1: 132-tool blast radius | CRITICAL | Any barrel edit can silently break many tools. Each wave must be QA-gated against full tool suite. |
| R-2: Concurrent commit race | CRITICAL | mcp-server writes docs/signals, docs/data, scheduler. Run SOLO only. |
| R-3: Explicit-add discipline | HIGH | Zone has history of `git add -am` 26-file over-staging. Enforce `git add <path>` per file. |
| R-4: Scheduler coupling | HIGH | 73 cron jobs; any import regression breaks live production. Cron scenarios/render verification mandatory. |
| R-5: Dashboard circular deps | HIGH | 5 served dashboards; import path changes during barrel split may break dashboard handlers. |
| R-6: kinhDich domain residual | MEDIUM | `kinhDichWrapper.ts` still imported by 2 tool handlers + portfolio tools. Per-file ruling needed before delete. |
| R-7: macro/domain fetcher audit | MEDIUM | `domain/services/macro/macroIndicatorFetcher.ts` — may still be called by scheduler jobs directly. Verify before barrel split. |
| R-8: DDD drift in domain layer | LOW | `rateLimiter`, `resilientFetcher`, `vpsHealthPoller` misplaced. Non-blocking. |
| R-9: No fence in CI | LOW | G4 Phase 2 deliverable. Phase 1 runs without fence (deliberate). |
| R-10: pdfOcrWorker.ts not deprecated | LOW | `index.ts` bootstrap still imports `pdfOcrWorker.ts` for background OCR. This is local fallback — acceptable until G5 ruling for pdf-extractor pipeline is finalized. |

---

## 12. G10 Baseline — AI-Fixability

`docs/data/bug-inventory.json` does not yet have a `mcp_server_baseline` entry. The G10 baseline for mcp-server is recorded in the bug inventory as part of Phase 0 deliverables (see Phase 1 task plan P0-MCP-3 / bug-inventory entry).

From the existing bug list in `bug-inventory.json`, mcp-server-sourced bugs include: `1960-DAILYDASH-ENOENT`, `A-21c-dailyDashboardJob-ENOENT`, `1972-VNDIRECT-NULL-COERCION`, `1974-DAILYDASH-HOST-VISIBILITY`, `1965d-JANITOR-PATHFIX`, `1958a-alertDigestJob-catchup`, `1955b-zombie-cron-rows`, `1954-BCTC-write-chain-rca`. These cluster in two categories: (a) daily-dashboard file-path issues and (b) scheduler job correctness issues. Fix cycle count: 2-3 cycles average (better than system baseline 1.5 due to the cron/file-path class of bugs requiring container-exec verification). System-wide baseline = 1.5. mcp-server baseline = 2.5 (estimated from mcp-server-attributed bugs in inventory).

---

## Brownfield Scan — Summary Table

| Dimension | Finding |
|---|---|
| DDD layer coverage | All 4 layers present + scheduler top-level |
| Priority-1 barrel violation | `domain/services/index.ts` 139L over 84-file surface |
| Tool count | ~132 MCP tools (101 handler files × ~1.3 tools/file average) |
| Cron jobs | 73 CRONS entries / 68 `cron.schedule()` + 5 summary = 73 total |
| HTTP clients verified | 7/8 microservices wired via `clients.ts` (alert-engine direct wiring not in clients.ts) |
| Dead code (G5-inverse) | TA domain: GONE. Macro domain: partially. KinhDich local: partial (integration glue). RAG: deprecated (G5b done). |
| Dashboards hosted | 5 (BCTC inspector, news-fetch dashboard, news-fetch live API, VPS news health, foreign flow status) |
| Schema slices | 9 (already decomposed) |
| Architecture fence | ABSENT (Phase 2 goal) |
| Primitive candidates | 8-10 (Phase 2 scope) |
| First action | Audit + shrink `domain/services/index.ts` (Priority-1 barrel) |
