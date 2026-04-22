# Graph Report - .  (2026-04-22)

## Corpus Check
- 721 files · ~2,119,608 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 679 nodes · 1048 edges · 57 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 173 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]

## God Nodes (most connected - your core abstractions)
1. `get()` - 51 edges
2. `getDb()` - 47 edges
3. `runFreshnessSlaMonitor()` - 10 edges
4. `_assembleBriefingImpl()` - 10 edges
5. `scanMarket()` - 10 edges
6. `initDatabase()` - 10 edges
7. `buildCausalChain()` - 10 edges
8. `formatFranceSummaryVI()` - 9 edges
9. `runFranceSummary()` - 9 edges
10. `markFetched()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `check()` --calls--> `log()`  [INFERRED]
  scripts/smoke-test-sprint-001.ts → src/scheduler/jobs.ts
- `shutdown()` --calls--> `closeDb()`  [INFERRED]
  src/index.ts → src/infrastructure/db/schema.ts
- `runForeignFlowFetcherJobCron()` --calls--> `getDb()`  [INFERRED]
  src/scheduler/market-data/foreignFlowFetcherJob.ts → src/infrastructure/db/schema.ts
- `runMorningBriefing()` --calls--> `insertMarketMessage()`  [INFERRED]
  src/scheduler/briefings/morningBriefingJob.ts → src/infrastructure/db/marketMessageStore.ts
- `runBctcQueueEnricherJob()` --calls--> `getDb()`  [INFERRED]
  src/scheduler/financial-reports/bctcQueueEnricherJob.ts → src/infrastructure/db/schema.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (37): assembleBriefing(), _assembleBriefingImpl(), isPriceFresh(), midnightVietnamAsUtc(), parseAffectedCodes(), queryEvidenceTopScores(), queryForeignFlowSummary(), queryInsiderRecent() (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (28): detectAgricultureWeatherKeywords(), findKeywordWholeWord(), isWordBoundary(), calcQoQ(), calcYoY(), getMetricValue(), applyDynamicMacroAdjustments(), applyMacroAdjustments() (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (38): countRows(), queryRow(), getRow(), getRowCount(), AppConfigError, bool(), get(), loadConfig() (+30 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (15): seedSchema(), setupTestDb(), setupTestDb(), seedSchema(), setupTestDb(), runBctcQueueEnricherJob(), insertMarketMessage(), initAlertsTables() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (14): log(), shouldRunCatchup(), startScheduler(), fetchAndStoreMacroIndicators(), storeIndicators(), updateRefreshJobColumn(), macroIndicatorRefreshJob(), makeHttpClient() (+6 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (43): Agent Memory System, agricultureDetector.ts, AGRICULTURE_WEATHER_RULES, Banking Sector Contagion Logic, Test Baseline 6171 to 6187 (+16 assertions), Blockers in REQ-1281, cascadeEngine.ts, cascadeExecutor.ts (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (16): getPipelineHealthFn(), makeHealth(), getPipelineHealthFn(), makeHealth(), notify(), notifyUser(), runPipelineWatchdog(), attemptSshRestart() (+8 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (11): deduplicateForeignFlowItems(), extractForeignFlowFromSseMessages(), fetchForeignFlowWithFallback(), fetchPrimaryVpsEndpoint(), isValidForeignFlowItem(), runForeignFlowFetcherJob(), runForeignFlowFetcherJobCron(), coerceNumericField() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (9): fetcher(), onExhausted(), fmtRatio(), fmtVol(), formatForeignFlowOutput(), backfillPrices(), fetchOhlcvData(), validateOhlcv() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (16): computeCycleId(), expiresAt(), getChainFindings(), getChainFromRoot(), getSignalsGroupedByCausalRoot(), postSignal(), shouldSuppressAlert(), readUnnotifiedAlerts() (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (15): detectDataFreshnessBreach(), checkDataFreshnessSla(), checkSignalSla(), classifySeverity(), getSlaThreshold(), isVnMarketHours(), escalateToCommander(), getPriorBreaches() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (11): buildComparisonSection(), buildSummarySection(), fmtBillions(), fmtChange(), fmtPct(), fmtVnd(), fmtX(), rowToMetrics() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (17): buildMessage(), chooseAlertId(), deterministicNewsId(), deterministicPriceId(), escalateSeverity(), generateAlerts(), generateId(), isDocAlreadyProcessed() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (4): sendWorkFn(), runOhlcvDailyAggregator(), vnDateString(), vnMidnightUtcMs()

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (12): getSignals(), getCycleBootstrap(), buildAlertsSection(), buildAnalysisSection(), buildMacroSection(), buildMarketContextText(), buildSystemStatusText(), buildWatchlistSection() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (3): fastFn(), slowFn(), todayVietnam()

### Community 16 - "Community 16"
Cohesion: 0.29
Nodes (9): buildAnalysisSummary(), buildFiscalPeriod(), fetchParseAndStoreBctc(), getDefaultInsertAnalysis(), normaliseFilename(), computeConfidence(), downloadAndExtractPdf(), extractPdfText() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.2
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 0.53
Nodes (5): esc(), generateQueDataEntry(), normaliseAction(), normaliseOutcome(), parseHexagram()

### Community 19 - "Community 19"
Cohesion: 0.4
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (3): fetch_with_browser(), parse_rss(), Parse RSS XML into item list.

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (4): Sprint 054 Complete, feat(get_pipeline_health): System diagnostics MCP tool, feat(bbAlertScanJob): Bollinger Band breakout scanner, test(1309): Bollinger Band alert coverage

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (2): Insider Dump Sentiment Bearish, Sentiment Bullish (opposite insider bearish)

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (2): test(france-summary-cron): TDD test written FIRST, fix(france-summary-cron): widen cron to */30 6-8 UTC

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (2): fix(foreign-flow-sentinel): filter 9999999 sentinel value, fix(foreign-flow-validator): DDD layer violation + server.ts integration

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): Market Watch Report — 2026-04-01, GREEN: Briefing Quality Gate Verification + Test Suite Completion

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (2): test(hut-sector-reclassify): HUT real_estate → construction, fix(1406): HUT sector reclassification

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (2): test(diacritics-wave5): Vietnamese string localization, fix(1416): Diacritics localization implementation

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (2): feat(morning-briefing-bctc-deadlines): Earnings calendar section, fix(1422): Morning briefing BCTC deadlines implementation

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (2): feat(maybe-deploy-vps.sh): VPS auto-deploy gate, docs(dev-standards): Step 4a VPS deploy gate

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (2): fix(volume-spike-multiplier): Per-ticker adaptive thresholds, fix(1402): ATC guard boundary safeguard

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (1): Security Review: No SQL Injection Risk

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (1): Backward Compatibility Guarantee

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (1): fix(evening-summary-vnindex-db-read): VNINDEX fresh/stale logic

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (1): fix(1432): GREEN implementation

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (1): QA Verification: e2e health polling + SLA escalation

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (1): fix(scheduler-locks-schema): DDL table + index

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (1): fix(timezone-hardcoding): Test fixture relative dates

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (1): fix(checkpoint-restart-mode): PRAGMA wal_checkpoint(RESTART)

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (1): fix(db-isolation-batch5): Bulk Bun.env DB_PATH replacement

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (1): docs(agent-roster + mcp-tools): Ops agent introduction

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (1): test(ohlcv-aggregator): TDD RED tests for runOhlcvDailyAggregator

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): fix(278-cycle-peer-sync): DB isolation + stub functions

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): fix(franceSummaryJob-catchup): Startup missed-send recovery

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): refactor(legacy-cleanup): Delete src/server.ts + src/tools/ stubs

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **14 isolated node(s):** `Parse RSS XML into item list.`, `Agent Memory System`, `Session 2026-04-22 Morning Work`, `Sentiment Bullish (opposite insider bearish)`, `Performance Target <50ms keyword detection` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (2 nodes): `Insider Dump Sentiment Bearish`, `Sentiment Bullish (opposite insider bearish)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `test(france-summary-cron): TDD test written FIRST`, `fix(france-summary-cron): widen cron to */30 6-8 UTC`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `fix(foreign-flow-sentinel): filter 9999999 sentinel value`, `fix(foreign-flow-validator): DDD layer violation + server.ts integration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `Market Watch Report — 2026-04-01`, `GREEN: Briefing Quality Gate Verification + Test Suite Completion`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `test(hut-sector-reclassify): HUT real_estate → construction`, `fix(1406): HUT sector reclassification`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `test(diacritics-wave5): Vietnamese string localization`, `fix(1416): Diacritics localization implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `feat(morning-briefing-bctc-deadlines): Earnings calendar section`, `fix(1422): Morning briefing BCTC deadlines implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `feat(maybe-deploy-vps.sh): VPS auto-deploy gate`, `docs(dev-standards): Step 4a VPS deploy gate`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `fix(volume-spike-multiplier): Per-ticker adaptive thresholds`, `fix(1402): ATC guard boundary safeguard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `throwingFn()`, `1476-wal-stuck-alert.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `buildBctcDb()`, `1050-alert-dispatch-fixes.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `purge-phantom-reports.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `Security Review: No SQL Injection Risk`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `Backward Compatibility Guarantee`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `fix(evening-summary-vnindex-db-read): VNINDEX fresh/stale logic`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `fix(1432): GREEN implementation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `QA Verification: e2e health polling + SLA escalation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `fix(scheduler-locks-schema): DDL table + index`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `fix(timezone-hardcoding): Test fixture relative dates`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `fix(checkpoint-restart-mode): PRAGMA wal_checkpoint(RESTART)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `fix(db-isolation-batch5): Bulk Bun.env DB_PATH replacement`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `docs(agent-roster + mcp-tools): Ops agent introduction`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `test(ohlcv-aggregator): TDD RED tests for runOhlcvDailyAggregator`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `fix(278-cycle-peer-sync): DB isolation + stub functions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `fix(franceSummaryJob-catchup): Startup missed-send recovery`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `refactor(legacy-cleanup): Delete src/server.ts + src/tools/ stubs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `1418-diacritics-wave6.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `1270-usd-vnd-threshold-fix.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `setup.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `1269-macro-direction-label.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `jobRunsStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get()` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 16`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **Why does `getDb()` connect `Community 2` to `Community 0`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 12`, `Community 13`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `buildCausalChain()` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Are the 45 inferred relationships involving `get()` (e.g. with `detectDataFreshnessBreach()` and `buildComparisonSection()`) actually correct?**
  _`get()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **Are the 45 inferred relationships involving `getDb()` (e.g. with `readLatestPriceTimestamp()` and `readLatestNewsTimestamp()`) actually correct?**
  _`getDb()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `scanMarket()` (e.g. with `fetcher()` and `get()`) actually correct?**
  _`scanMarket()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Parse RSS XML into item list.`, `Agent Memory System`, `Session 2026-04-22 Morning Work` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._