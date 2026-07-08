# mcp-server — Use Cases

**File:** `apps/mcp-server/src/application/usecases/`

## Market Operations

### scanMarket.ts
- **Input:** `ScanMarketDeps { watchlistRepo, marketPriceRepo, fetchPrices? }`
- **Output:** `MarketScanResult { scanned, signals, alerts }`
- **Flow:** watchlist → fetch prices (HOSE/HNX/UPCOM) → store market_prices + history → compute avgVolume (20-day) → detectSignals → generateAlerts

### syncVnstockData.ts
Maintains vnstock reference data (company names, exchanges)

### pollNews.ts
RSS/news API polling with deduplication

### syncSectorPeers.ts
Sector classification sync from static mappings

## Financial Reports

### parseBctcReport.ts
BCTC PDF text extraction & field validation

### fetchParseAndStoreBctc.ts
VPS PDF pull → OCR → parser → DB storage. FACTORY-APP-split-fetchParseAndStoreBctc
(2026-07-08): this file is now a thin Step 1/3/4 sequencer (<=120L); split into
`bctc/types.ts` (shared param/insert-fn types), `bctc/resolvePdfText.ts` (Step 2
PDF download + OCR-cache fallback, Task 293), `bctc/newsChainFallback.ts`
(Task 1294b news-chain fallback + `buildFiscalPeriod`/`buildAnalysisSummary`,
carries the named `NEWS_FALLBACK_BASELINE`/`TEMPORAL_DISCOUNT`/`FALLBACK_CONF_MIN`/
`FALLBACK_CONF_MAX` confidence-tuning constants), and `bctc/insertBctcAnalysis.ts`
(Step 4 LanceDB embed). Arithmetic/behavior unchanged — pure relocation + naming.

### discoverBctcPdfUrlBrowser.ts / discoverBctcPdfUrlDirectApi.ts
PDF discovery strategies (browser scraping vs direct API)

### bctcQueueEnricher.ts
Enrich pending BCTC records from news corpus

### checkSscReports.ts
SSC official disclosure polling

## Analysis & Intelligence

### assembleBriefing.ts
Morning intelligence synthesis: market context + alerts + sector insights + news

### assembleEveningSummary.ts
Daily close summary generation

### assembleAlertDigest.ts
Alert aggregation & notification formatting

### getPatternSummary.ts
RAG vector search for similar historical patterns

### getCrisisEarlyWarning.ts
Detect systemic stress signals

### getReputationWarnings.ts
Analyst/broker credibility scoring

## Backtesting & Simulations

### runBacktest.ts
Historical signal performance evaluation

### runImpactChain.ts
Cascade effect simulation: catalyst → price move → sector spillover

### generatePeriodicSummary.ts
Report generation (daily/weekly/monthly)

## System & Health

### getCycleBootstrap.ts
Agent session initialization state

### getOhlcvPipelineHealth.ts
Data freshness checks

### getPipelineHealth.ts
System component health snapshot

### computeMarketEarningYield.ts
Market valuation metric (1/PE ratio)

## Cron Status Compute (DASH-CRON-RECHECK-TABLE, TASK-DASH-CRON-1)

### apps/mcp-server/src/application/cron/cronStatusCompute.ts
Orchestrates one Layer-A row (per `CRONS` map key) for `GET /api/cron-status`:
- `resolveJobNameDb(cronsKey, distinctDbJobNames)` — CN-1 hybrid 3-tier: static 16-pair reverse-map (WATCHDOG_MANIFEST-covered jobs) → normalized-match against a runtime `DISTINCT job_name` scan → honest fallback (CRONS key itself).
- `deriveCadenceMs(cronExpr, nowMs)` — CN-2 MIN-of-6-samples via `cron-parser`; one generic algorithm handles restricted-hour windows, weekday-only jobs, and comma-lists uniformly.
- `buildLayerARow(...)` — resolve → `getLastRunForJob` → `classifyCronLiveness` (domain) → assemble; populates `reason` for non-ON_TIME rows.
- **Memoization contract (load-bearing, risk R1):** `cadenceMs`/`thresholdMultiplier`/`human_schedule`/`job_name_db` computed once per CRONS key into a module-level `Map`, reused for process lifetime (test hooks: `_staticMetaComputeCountForTests`, `_resetStaticMetaCacheForTests`).
- **Fence-B compliance:** does NOT import `src/scheduler/` (eslint-plugin-boundaries forbids application→scheduler). Accepts `WATCHDOG_MANIFEST`/`CRONS` as plain parameters from the interface layer (`CadenceManifest` structural type) instead.
