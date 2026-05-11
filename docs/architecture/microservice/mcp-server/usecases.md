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
VPS PDF pull → OCR → parser → DB storage

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
