---
title: "Brownfield Inventory — mcp-server (P0-MCP-1)"
date: "2026-05-25"
author: "architect"
task: "P0-MCP-1"
pilot: "mcp-server"
status: "COMPLETE"
zone: "apps/mcp-server/"
port: 3000
---

# Brownfield Inventory — `mcp-server` (P0-MCP-1)

**Zone:** `apps/mcp-server/` ONLY — RUN-SOLO / HIGHEST-RISK boundary binding.
**Port:** 3000 (confirmed from `docs/data/system-map.json` project.microservices[], `id: "mcp-server"`, `port: 3000`, `external_port: 3000`).
**Language:** TypeScript (Bun) — locked. This is the single MCP interface + scheduler host; not a Go/Python pivot candidate.
**Runtime:** Bun 1.3.13 (glibc build on Ubuntu 22.04). Multi-stage Dockerfile (bun-src stage extracts Bun binary → ubuntu:22.04 base stage installs Python3 + vnstock + poppler + tesseract).
**Test harness:** Bun test (`bun test`) — 905 test files across `src/__tests__/`. No Vitest. No Playwright.

---

## 1. Directory Structure

```
apps/mcp-server/
  src/
    __tests__/                   # 905 Bun test files — unit + integration
      e2e/                       # e2e-scoped tests
      lint/
        no-local-project-root.test.ts  # only existing architecture fence test
    _deprecated/
      fetchers/                  # old fetcher code
      technicalIndicators.ts     # G5a DONE — TS TA code moved here (P2-B1)
    application/
      cascadeExecutor.ts
      services/
        imfConvictionBridge.ts
        imfDataFetcher.ts
        market-data/
          marketDataValidator.ts
        signalQualityAudit.ts
      usecases/                  # 36 use-case files (assembleBriefing, fetchParseAndStoreBctc,
                                 #   bctcQueueEnricher, backfillBctcPdfPaths, etc.)
    domain/
      backtesting/               # backtestEngine, taComputation (pure math, no HTTP)
        VNSignalAdapter.ts
        backtestEngine.ts
        models.ts
        signalNormalizer.ts
        strategyRegistry.ts
        taComputation.ts         # PURE domain TA math — backtesting only, NOT dead
      models/
        imfIndicators.ts
        shared-types.ts
        vnstockTypes.ts
      repositories/              # 9 port interfaces (IBacktestPrice, IHexagram, etc.)
      services/                  # ~90 domain service files across subdirs:
        financial-reports/       # accruals, balanceSheetExtractor, cashFlowExtractor,
                                 #   bctcValidator, earningsCalendar, ratioComputer, etc.
        kinhDich/                # haoEncoder, hexagramBacktester, hexagramLibrary,
                                 #   hexagramResolver, kinhDichFormatter, kinhDichReading,
                                 #   kinhDichWrapper, nguHanhClassifier, nuclearComputer,
                                 #   transformedComputer  — LOCAL LOGIC (G5-inverse risk, §4)
        macro/                   # carryTradeSignal, computeFedLiquiditySpread,
                                 #   investmentClock, ismRegimeSignal, macroCalendar,
                                 #   macroIndicatorFetcher, marketEarningYield,
                                 #   pyramidTier, yieldSpreadSignal
        market-data/
          foreignFlowValidator.ts
        [~60 other pure service files: alertDedup, alertCooldown, correlationCalculator,
          portfolioRiskCalculator, sectorRotationDetector, sentimentClassifier, etc.]
      signals/
        signalBuilders.ts
        signalTypes.ts
      utils/
        ansiUtils.ts
        sqlHelpers.ts
    infrastructure/
      adapters/
        analysisFormatters.ts
      agents/
        agentConstants.ts
        qaResponderSpawner.ts
        smartCompactSpawner.ts
      cache/
        sessionToolCache.ts
      circuitBreaker.ts
      circuitBreakerRegistry.ts
      config.ts
      db/
        migrations/
        repositories/            # SqliteHexagram, SqliteJobRun, SqliteKinhDichScore,
                                 #   SqliteMarketPrice, SqliteVnstock, SqliteWatchlist
        schema-alerts.ts         # 8 schema slices (decomposed from monolithic schema.ts)
        schema-backtesting.ts
        schema-briefings.ts
        schema-financial-reports.ts
        schema-macro.ts
        schema-market-data.ts
        schema-news.ts
        schema-portfolio.ts
        schema-system.ts
        schema.ts                # root schema + db singleton
        [~30 store files: alertStore, macroStatsStore, positionStore, etc.]
      envCheck.ts
      fetchers/                  # ~30 external fetcher adapters (cafef, hose, hnx, sbv,
                                 #   tradingEconomics, yahooFinance, rss, pdf, pdfExtractorClient,
                                 #   pdfOcrWorker, foreignFlowFetcher, vnstockBridge, etc.)
      fileStore/
        alertVerdictStore.ts
      logger.ts
      microservices/
        clients.ts               # CANONICAL HTTP client for all 8 microservices
                                 #   TA:5003, macro:5004, kinhDich:5005, stock-price:5000,
                                 #   pdf-extractor:5001, rag:5002, alert-engine:5006, gateway:4000
      notifiers/
        telegram.ts
        telegramCommands.ts
        telegramMessageFactory.ts
        telegramWebhookSetup.ts
      observability/
        circuitBreakerLogger.ts
        jobMetrics.ts
      projectRoot.ts
      rag/
        _deprecated/             # embeddings.ts, retriever.ts, vectorstore.ts (G5a DONE)
        index.ts
        ragHttpClient.ts         # LIVE HTTP client → rag-service:5002
      vps/
        sshExec.ts
    interface/
      bctc-inspector.html        # served HTML inspector
      news-fetch-dashboard/      # index.html + data.js + rerun-handler.js (served at /dashboards/news-fetch/)
      mcp/
        bootstrap/               # MCP server bootstrap
        routes/                  # 8 HTTP route handlers (bctcInspectHandler, newsFetchDashboardHandler,
                                 #   newsFetchLiveHandler, pushForeignFlowHandler, pushNewsHandler,
                                 #   pushPricesHandler, vpsNewsHealthHandler, webhookHandler)
        tools/                   # 12 barrel modules (§2 below)
          alerts/       (9 tool files + index.ts)
          analysis/     (1 tool file + index.ts)
          backtesting/  (2 tool files + index.ts)
          briefings/    (5 tool files + index.ts)
          financial-reports/ (8 tool files + index.ts)
          kinhdich/     (1 tool file + index.ts)
          macro/        (14 tool files + index.ts)
          market-data/  (9 tool files + index.ts)
          news-analysis/ (9 tool files + index.ts)
          portfolio/    (7 tool files + index.ts)
          sector/       (15 tool files + index.ts)
          system/       (21 tool files + index.ts)
          index.ts               # root barrel re-export
          registry.ts            # tool registry
      news-fetch-dashboard/      # dashboard files mirrored here
      scheduler/                 # interface-layer scheduler shim (separate from src/scheduler/)
    scheduler/                   # CRON HOST — 71 job files + index/config/startup utilities
      alerts/      (8 job files)
      audits/      (1 job file)
      briefings/   (3 job files)
      digest/      (1 job file)
      financial-reports/ (9 job files)
      macro/       (11 job files + index.ts)
      market-data/ (13 job files)
      news-analysis/ (8 job files + index.ts)
      news/        (1 job file + index.ts)
      portfolio/   (1 job file)
      system/      (7 job files)
      [root-level: cronConfig.ts, davPharmacyJob.ts, diskUsageAlertJob.ts, integrityCheckJob.ts,
        jobs.ts, pipelineWatchdogJob.ts, startScheduler.ts, startupHelpers.ts, summaryJobs.ts,
        vpsProxyWatchdogJob.ts, walCheckpointAlert.ts, weatherCheckJob.ts]
  Dockerfile                     # Multi-stage bun-src + ubuntu:22.04; EXPOSE 3000
  package.json                   # scripts: start/dev/check/test; deps: bun, better-sqlite3,
                                 #   @lancedb/lancedb, @huggingface/transformers, node-cron, zod,
                                 #   @modelcontextprotocol/sdk, pdf-parse, node-tesseract-ocr, etc.
  tsconfig.json
  bunfig.toml
  entrypoint.sh
  sync-news-fetch-dashboard.sh   # shell script to sync news-fetch dashboard files
```

---

## 2. Tool Surface

**Tool count SSOT pointer:** `docs/data/project-stats.json#toolCount` = **146** (as of Sprint 1954 baseline; `docs/data/system-map.json` MCP tool list = **125** — divergence explained by system-map being stale relative to project-stats; trust project-stats.json as the live SSOT for the count).
**Cron job count SSOT pointer:** `docs/data/project-stats.json#cronJobCount` = **77** (system-map MCP crons entry = 65 named crons — again trust project-stats for the live count; the gap represents system-map curation lag).

### Barrel Module Inventory

| Barrel | Tool Files | Notes |
|---|---|---|
| `system/` | 21 | LARGEST barrel. Coordination, ops-debug triggers, VPS health, memory, feedback, watchlist — highest blast radius. |
| `sector/` | 15 | 14 sector-specific topic files (pharma, energy, climate, legal, credit, correlation, etc.). |
| `macro/` | 14 | HTTP-routed to macro-indicators:5004 + local computation helpers (investmentClock, carryTradeSignal, fedLiquidity, ISM sub-components, rate limits). |
| `market-data/` | 9 | Foreign flow, price history, technical indicators, ticker intelligence, insider, market context, data freshness. |
| `news-analysis/` | 9 | Agent signals, analysis, cascade metrics/outcomes, compare, accuracy context, search, sentiment, source health. |
| `alerts/` | 9 | Alert check, digest, mute, verdict, accuracy, cron health, custom alert, pipeline health. |
| `financial-reports/` | 8 | BCTC tools, cash flow, accruals, earnings calendar, OCF, reports. |
| `portfolio/` | 7 | Export, performance, risk, positions, rebalancing, target allocation. |
| `briefings/` | 5 | Changelog, market messages, summary, telegram reports, telegram send. |
| `backtesting/` | 2 | Lifecycle + backtesting tools (domain/backtesting owns local pure math — NOT dead). |
| `analysis/` | 1 | Sequential market analysis. |
| `kinhdich/` | 1 | 6 tools exposed via 1 file (HTTP-routed to kinh-dich-service:5005). |

### Top 3 Barrel-Decomposition Seams

**SEAM-1: `system/` (21 files, highest churn).** Contains at least 5 logically distinct sub-domains: agent-memory ops (`agentMemoryTools`, `agentMemoryUpdateTools`, `agentWorkLogTools`), coordination/task-lock (`coordinationTools`, `askQueueTools`), ops-debug triggers (`bctcDebugTriggerTool`, `foreignFlowDebugTriggerTool`, `newsDebugTriggerTool`, `priceDebugTriggerTool`, `sbvDebugTriggerTool`), system observability (`slaStatusTools`, `signalDiagnosticsTools`, `cronHealthTools` mirrored from alerts/), and VPS management (`vpsHealthTools`, `vpsProxyTools`, `vpsServiceRestartTool`). Natural sub-barrel split: `system-memory/`, `system-coordination/`, `system-debug/`, `system-observability/`, `system-vps/`.

**SEAM-2: `macro/` (14 files, HTTP-rewire complexity).** Split between tools that proxy to macro-indicators:5004 (macroTools, carryTools, dinhGiaTools, policyTools, calibrationTools, rateLimitTools) and tools that own computation locally with mcp-server domain logic (investmentClockTools, imfSignals, getFedLiquiditySpreadTool, getIsmSubcomponentsTool, evidenceTools, predictionTools, predictionTools). The HTTP-vs-local split is the decomposition seam. `macroHttpClient.ts` + `macroSnapshotGuard.ts` are routing helpers — potential primitive candidates.

**SEAM-3: `sector/` (15 files, cross-cutting local logic).** Each sector file is largely self-contained (pharma, energy, climate, legal, credit, crisis, leadership, supply chain, bond maturity, broker credibility, public investment, sector comparison, sector rotation, correlation, severity labels). Severity labels (`severityLabels.ts`) is a pure data-in→label-out helper — natural primitive. The sector sub-barrels can split by topic cluster: `sector-domestic/` (pharma, legal, leadership, public-investment), `sector-market/` (rotation, comparison, correlation), `sector-cross-cutting/` (credit, crisis, supply-chain, climate, energy, broker-credibility, bond-maturity).

---

## 3. Candidate Primitives

Note: **primitive extraction is SECONDARY** for mcp-server. The dominant work is barrel decomposition + G5-inverse HTTP-route verification. The following are listed for Phase-1 completeness planning only.

| Candidate | Location | Pure? | Notes |
|---|---|---|---|
| `signal-bus-helper` | `domain/signals/signalBuilders.ts` | YES | Pure signal-envelope construction; scenario-JSON-testable. |
| `severity-label-mapper` | `interface/mcp/tools/sector/severityLabels.ts` | YES | Pure severity string→display-label mapping. Already isolated as its own file. |
| `macro-snapshot-guard` | `interface/mcp/tools/macro/macroSnapshotGuard.ts` | Likely | Guards stale/missing macro snapshot responses. Pure threshold check. Verify zero-IO before extracting. |
| `sector-classifier` | `domain/services/sectorPeers.ts` | YES | Maps stock code → sector peers lookup; pure data. |
| `portfolio-aggregator` | `domain/services/portfolioRiskCalculator.ts` + `domain/services/portfolioPnlCalculator.ts` | YES | Pure number-in→risk-metrics-out. Domain layer, zero infra imports. |
| `ops-debug-trigger` | `interface/mcp/tools/system/bctcDebugTriggerTool.ts` (and 4 siblings) | NO | All trigger I/O operations (cron runs, VPS fetches). Not primitive candidates. |

Cross-cutting honest assessment: 3-5 genuine primitives exist. They are NOT the priority. The G5-inverse map (§4) and barrel decomposition (§2) are.

---

## 4. G5-Inverse Map

For mcp-server, G5 is the **inverse goal**: instead of "extract code from mcp-server into a new service," the work is "delete the dead TS code that was already extracted into the Go/Python microservices, and prove every MCP tool handler now routes via HTTP."

### Current State by Microservice Domain

| Extracted Service | Port | HTTP-Routed? | Dead Local Code Status | Notes |
|---|---|---|---|---|
| **TA (technical-analysis)** | 5003 | YES — `technicalIndicatorTools.ts` imports `computeTAIndicators()` from `clients.ts` | `_deprecated/technicalIndicators.ts` — G5a DONE | Fallback path (local DB computation) still present in tool handler for continuity — must be removed in G5 phase. |
| **Macro (macro-indicators)** | 5004 | PARTIAL — `get_macro_snapshot` routes via `macroHttpClient.ts` + `getMacroSnapshot()` in clients.ts | `domain/services/macro/` still owns local computation for 8+ tools (investmentClock, carryTradeSignal, fedLiquidity, ISM subcomponents, predictionMarket, etc.) | These local macro computations are legitimately mcp-server-owned (not extracted to macro-service). Only `get_macro_snapshot` + `macroIndicatorRefreshJob` use the macro microservice HTTP path. |
| **Kinh Dich (kinh-dich-service)** | 5005 | PARTIAL — `kinhDichTools.ts` (6 tools) routes via `getKinhDichReading()` etc. in clients.ts | `domain/services/kinhDich/` still contains 9 TS files (haoEncoder, hexagramResolver, hexagramLibrary, kinhDichWrapper, etc.); `kinhDichWrapper.ts` is imported directly by `marketTools.ts` and `analysis.ts` | **HIGHEST G5-INVERSE RISK.** `marketTools.ts` and `news-analysis/analysis.ts` import `appendKinhDich()` from the local TS domain service — BYPASSING the kinh-dich-service:5005 HTTP path. This is a live G5 violation that must be remediated. Additionally `portfolioTools.ts` imports `QUE_META` from `hexagramLibrary.ts`. |
| **Stock Price** | 5000 | YES — `priceHistoryTools.ts` uses `getPriceHistory()` from clients.ts; `taAlertScanJob` + `bbAlertScanJob` use `fetchStockPrice()` | `_deprecated/fetchers/` holds old fetcher stubs | Scheduler jobs also route via clients.ts. Clean path. |
| **RAG (rag-service)** | 5002 | YES — `ragHttpClient.ts` wraps HTTP to :5002; `dataAuditJob.ts` confirmed to use ragHttpClient | `infrastructure/rag/_deprecated/` contains embeddings.ts, retriever.ts, vectorstore.ts — G5a DONE. | RAG _deprecated files are in place. `dataAuditJob.ts` uses ragHttpClient. Clean path post-G5a. |
| **PDF Extractor** | 5001 | YES — `pdfExtractorClient.ts` in fetchers routes via HTTP; BCTC jobs use this client | `infrastructure/fetchers/pdf.ts` + `pdfOcrWorker.ts` — in-process OCR fallback path exists (1954c consolidation targeted this) | Per 1954c consolidation brief: the 4 BCTC callers have been rewired to route via pdf-extractor service. Verify `pdf.ts` + `pdfOcrWorker.ts` are deprecated post-1954c. |
| **Alert Engine** | 5006 | PARTIAL — clients.ts has `getGatewayHealth()` but alert-engine HTTP client functions are not visible in clients.ts | Alert domain logic (alertDedup, alertCooldown, alertGenerator, alertGrouper, alertPolicyChecker, alertBatchGrouper, alertMuteChecker, alertOutcomeScorer, alertMuteChecker) all live in `domain/services/` locally | Alert-engine service extracts only Telegram delivery + dedup/cooldown at the edge. The mcp-server domain/services/alert* files are legitimately LOCAL — they compute alert decisions that the engine then acts on. Verify exactly which responsibilities have moved to alert-engine:5006. |
| **Backtesting** | N/A | LOCAL — `domain/backtesting/taComputation.ts` is pure math owned by mcp-server | No separate backtesting microservice | `taComputation.ts` is NOT dead code — it implements pure EMA/RSI/trend math for the backtesting engine. This is legitimately local. NOT a G5 target. |

### G5-Inverse Headline Count

- **HTTP-routed (fully):** TA, stock-price, RAG = **3 domains clean**
- **HTTP-routed (partial, local bypass still active):** macro (8+ local computation tools), kinh-dich (kinhDichWrapper imported by 2 non-KD tool files) = **2 domains with live G5 debt**
- **Needs post-1954c verification:** pdf-extractor (pdfOcrWorker fallback path) = **1 domain pending verify**
- **Legitimately local (NOT G5 targets):** backtesting domain math, alert decision logic, ALL sector/portfolio/briefing/news-analysis computation = **the majority of domain/services/**

**Summary: ~5 of the 8 connected microservice domains have HTTP-routed tool handlers. The 2 live G5 violations are the kinhDichWrapper bypass in marketTools.ts + news-analysis/analysis.ts and any remaining pdf.ts/pdfOcrWorker in-process OCR path.**

---

## 5. Scheduler Coupling

**Scheduler job count (cron jobs only, excluding startup/config/index utilities):** 71 job files enumerated in `src/scheduler/`. SSOT count for reporting: `docs/data/project-stats.json#cronJobCount` = **77**.

### High-Regression-Risk Cron Jobs

| Job | Domain | Silent-Break Risk | Notes |
|---|---|---|---|
| `dailyDashboardJob.ts` | system | HIGH — ENOENT class | Reads `docs/agent-memory/sessions/YYYY-MM-DD-*.md`, `docs/TASKS.md`, `docs/data/project-stats.json` via `getProjectRoot()`. Any barrel refactor that changes `getProjectRoot()` resolution or moves these files silently breaks this job. Pre-existing pattern from sprint 1854a / fix 2f0a74e9. |
| `bctcPdfPullJob.ts` | financial-reports | HIGH — 1954c consolidation area | Calls `pdfExtractorClient.extractViaMicroservice()`. If 1954c consolidation is incomplete, the fallback pdf.ts path still exists. Must verify the consolidation state before touching this job in any barrel split. |
| `macroIndicatorRefreshJob.ts` | macro | MEDIUM | Uses `getMacroExternal()` + `getMacroSnapshot()` from clients.ts. Also uses legacy field aliases (`brentPrice`, `goldPrice` computed from `oilUsd`, `goldUsd`). Any clients.ts refactor must maintain backward compatibility or update all call sites. |
| `intelligenceCycleJob.ts` | news-analysis | HIGH | Main engine (every 15 min): news + prices + cascade + alerts. Highest frequency cron. Any regression here immediately visible via WORK channel absence. |
| `taAlertScanJob.ts` + `bbAlertScanJob.ts` | market-data | MEDIUM | Both call stock-price + TA microservices via clients.ts. These run in parallel via `alertScanParallelJob.ts`. A barrel split that separates their shared infrastructure imports without updating both files simultaneously will break the parallel dispatch. |
| `summaryJobs.ts` | briefings | MEDIUM | Root-level file containing daily/weekly/monthly/quarterly/yearly summary schedules. Any scheduler index restructure must not break these schedule registrations. |

### Scheduler Index Pattern

`src/scheduler/index.ts` → imports `src/scheduler/jobs.ts` → imports per-domain job files + `startScheduler.ts`. The `cronConfig.ts` holds cron expression constants. Any barrel decomposition that re-routes a scheduler import path must trace this full import chain or risk a silent startup failure.

---

## 6. Dashboards Served by mcp-server

mcp-server actively serves several dashboards via its HTTP interface layer. These create a circular-dependency risk during any barrel split that touches the interface/ routes:

| Dashboard | Served URL | Handler | Source Files |
|---|---|---|---|
| BCTC Inspector | `GET /api/bctc-inspect` | `bctcInspectHandler.ts` | `src/interface/bctc-inspector.html` (readFileSync) |
| News-fetch live view | `GET /dashboards/news-fetch/` | `newsFetchDashboardHandler.ts` | `src/interface/news-fetch-dashboard/index.html`, `data.js`, `rerun-handler.js` |
| News-fetch live API | `GET /api/news-fetch/live` | `newsFetchLiveHandler.ts` | SQLite query against `rag_analyses` table |
| VPS health | `GET /api/vps-news-health` | `vpsNewsHealthHandler.ts` | Calls sshExec + DB |
| Push endpoints | `POST /push/news`, `/push/prices`, `/push/foreign-flow` | `pushNewsHandler`, `pushPricesHandler`, `pushForeignFlowHandler` | DB writes |
| Webhook | `POST /webhook` | `webhookHandler.ts` | Telegram inbound |

**Circular-dependency risk during split:** If any barrel decomposition creates a new sub-package that the HTTP route handlers need to import, and that sub-package's index.ts re-imports the route handlers (even transitively), a circular import will occur. The `bctcInspectHandler.ts` reads `bctc-inspector.html` via `readFileSync` with an absolute path anchored to `getProjectRoot()` — any file-location change breaks this. The `sync-news-fetch-dashboard.sh` shell script at the mcp-server root copies news-fetch dashboard files; this script must be accounted for in any dashboard file reorganization.

---

## 7. Test Harness State

### Bun Test (primary)

- **Framework:** `bun test` (no Vitest, no Jest — Bun's native test runner)
- **Location:** `src/__tests__/` — 905 test files
- **Run command:** `bun test` (from `apps/mcp-server/`)
- **Architecture:** Tests numbered by sprint (e.g., `002-db-schema.test.ts`, `026-hose-prices.test.ts`, `1408-*.test.ts`). Dense test coverage across DB stores, fetchers, domain services, tool handlers, and scheduler jobs.
- **Key test fact:** 9277 of 9311 total system tests pass as of Sprint 1912a baseline. 34 known pre-existing failures (orthogonal tech debt, not mcp-server-caused). These 34 failures must NOT increase during mcp-server refactor.

### Architecture Fence (current state)

- **Only existing fence:** `src/__tests__/lint/no-local-project-root.test.ts` — asserts zero `resolve(import.meta.dir, '../..')` anti-patterns in scheduler/. This is a single lint rule, NOT a layer-violation fence.
- **No ESLint import boundaries fence** configured (package.json has no `eslint-plugin-boundaries` or `@typescript-eslint/no-restricted-imports` setup for layer enforcement).
- **No depguard** (that is the Go tool; TS equivalent is ESLint).
- **G4 fence is the primary Phase-1 build work for this service.**

### Trust-Render Surface

mcp-server does not yet have a three-tier dashboard (primitives/module/microservice panels) as defined by G6. The news-fetch dashboard and BCTC inspector are operational dashboards, not the G6 sandbox trust layer. The G6/G7/G8/G9 dashboard must be built fresh for this pilot — there is no existing trust-render surface to extend.

---

## 8. Build and CI

### Dockerfile

- **Multi-stage:** `bun-src` (from `oven/bun:1.3.13-debian`) → `ubuntu:22.04` base
- **System deps installed:** python3 + pip + python3-dev + build-essential + poppler-utils + tesseract-ocr + tesseract-ocr-vie + fonts-liberation + libxss1 + curl
- **Python packages:** `vnstock` (for vnstockBridge.ts subprocess)
- **Build context:** monorepo root (docker-compose sets `context: .`; Dockerfile copies `apps/mcp-server/src/`, `apps/mcp-server/tsconfig.json`, and monorepo-root `bctc-schema.ts` + `mcp.config.json`)
- **Startup:** `bun run src/index.ts`
- **Port:** EXPOSE 3000
- **NOTE — bctc-schema.ts coupling:** The Dockerfile explicitly copies the monorepo-root `bctc-schema.ts` and it is imported from `src/infrastructure/db/` as a relative import `../../../bctc-schema.js`. This is a structural coupling point — any barrel reorganization that changes the relative path from `db/` files to the monorepo root will break the Dockerfile COPY + import resolution.

### CI / Import Fence (current state)

- **No import-linter** (Python tool; not applicable for TS)
- **No ESLint fence** for layer separation
- **TypeScript check:** `bun tsc --noEmit` (aliased as `bun run check`)
- **G4 fence design for TS/Bun:** The canonical TS fence tool for this codebase is ESLint with `eslint-plugin-boundaries` or `@typescript-eslint/no-restricted-imports`. The fence must enforce:
  - Fence-A: `domain/` must not import from `infrastructure/` or `interface/`
  - Fence-B: `infrastructure/` must not import from `interface/`
  - Fence-C: scheduler job files must use `getProjectRoot()` from `infrastructure/projectRoot.ts`, never local `import.meta.dir` traversal (existing lint test covers this; ESLint fence automates it)
  - Deliberate-violation proof required before G4 ACs lock (same pattern as Go depguard proof in TA/macro pilots)

---

## 9. Scan-Clean Verdict + MVR-vs-FULL Recommendation

### Scan-Clean Verdict

**Scan clean: CONDITIONAL.** Two live violations found:

1. `R-CRITICAL` — **kinhDichWrapper bypass:** `marketTools.ts` and `news-analysis/analysis.ts` import `appendKinhDich()` directly from `domain/services/kinhDich/kinhDichWrapper.ts`, bypassing kinh-dich-service:5005. Additionally `portfolioTools.ts` imports `QUE_META` from `hexagramLibrary.ts`. These are live G5-inverse violations — the kinh-dich TS domain code has NOT been fully decommissioned despite the `kinhDichTools.ts` barrel being HTTP-routed. This must be remediated in G5 phase.

2. `R-MEDIUM` — **pdf.ts / pdfOcrWorker.ts in-process OCR path:** `infrastructure/fetchers/pdf.ts` + `pdfOcrWorker.ts` exist as live fetcher files (not in `_deprecated/`). Per 1954c consolidation brief, the BCTC callers were rewired to route via pdf-extractor service. But `pdf.ts` + `pdfOcrWorker.ts` themselves have not been moved to `_deprecated/`. Verify that no live caller still imports these directly; if confirmed dead, move to `_deprecated/` as part of G5.

3. `R-LOW` — **bctc-schema.ts monorepo-root coupling:** The import `from '../../../bctc-schema.js'` from `src/infrastructure/db/` is a fragile path — any deep module reorganization can break it. This should be resolved as part of the barrel split (move bctc-schema.ts into the service's own src/ or package boundary).

4. `R-LOW` — **`infrastructure/fetchers/` size:** ~30 fetcher adapter files in a single flat directory. Not a DDD violation (they are correctly in infrastructure), but the flat layout makes it harder to identify which are live vs superseded by microservice HTTP clients. A sub-folder split (e.g., `fetchers/vn-market/`, `fetchers/macro/`, `fetchers/bctc/`) would clarify ownership.

### MVR-vs-FULL Recommendation: **FULL**

**Rationale (one line):** mcp-server IS the domain host — it does not delegate to itself; every G1-G12 goal must be proven here, including the G5-inverse map, the G4 ESLint fence, and the trust-render dashboard for all barrels, because there is no upstream service to fall back to and the blast radius of an unverified refactor is the entire tool surface (~146 tools, 77 cron jobs).

The MVR path (dashboards + scenarios only, skip primitive extraction) is appropriate for services whose business logic was already extracted and only routing verification remains. mcp-server is the opposite: it IS the orchestration host. The only primitives that can be extracted are the cross-cutting pure helpers (signal-bus, sector-classifier, portfolio-aggregator — see §3). The dominant Phase-1 work is the barrel decomposition seam cuts (§2 SEAM-1/2/3) + G5-inverse cleanup (§4) + G4 fence installation (§8) + trust-render dashboard bootstrap (G6). All of these are FULL pilot scope, not MVR scope.

---

## Scan Summary

```
Zone:                     apps/mcp-server/
Port:                     3000 (system-map.json confirmed)
Language:                 TypeScript (Bun 1.3.13 / Ubuntu 22.04)
Tool count (SSOT):        docs/data/project-stats.json#toolCount = 146
Cron job count (SSOT):    docs/data/project-stats.json#cronJobCount = 77
Barrel modules:           12 (alerts, analysis, backtesting, briefings, financial-reports,
                              kinhdich, macro, market-data, news-analysis, portfolio, sector, system)
Schema slices:            9 (schema.ts + 8 domain slices in infrastructure/db/)
Domain services:          ~90 files across domain/services/ and subdirs
Test files:               905 Bun test files
Existing architecture fence:
                          1 lint test (no-local-project-root); NO ESLint layer fence yet
G5-inverse (HTTP-routed): TA ✓ | stock-price ✓ | RAG ✓ | PARTIAL: macro, kinh-dich, pdf-extractor
G5-inverse violations:    kinhDichWrapper bypass in marketTools.ts + analysis.ts (R-CRITICAL);
                          pdf.ts/pdfOcrWorker.ts not yet in _deprecated/ (R-MEDIUM)
Dashboards served:        bctc-inspector.html + news-fetch-dashboard/ (NOT G6 trust-layer)
G6 trust dashboard:       Does not exist yet — must be built in Phase 1
bctc-schema.ts coupling:  Monorepo-root relative import — fragile path (R-LOW)
Scan clean:               CONDITIONAL (2 live violations found; see §9)
MVR-vs-FULL verdict:      FULL (mcp-server is the domain host; full G1-G12 scope mandatory)
```

**BUILD-STANDARD: lean** — `apps/mcp-server/` already exists; this is a SCALE PILOT refactor of the existing service, not a new service build. The `lean` tag reflects the existing zone, not reduced scope — FULL G1-G12 goals still apply.
