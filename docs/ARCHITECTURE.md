# Architecture

<!-- size-justification: 389L — top-level architecture index used as the canonical "monorepo + services + ports + DDD layers + cron + databases" reference (12+ callers across docs/policies, docs/references, TASKS, bundle-architect, signals, sessions). Splitting by section would force every caller to walk a children-tree just to answer "what port does service X run on" — defeating the purpose of a single-glance overview. Sections already self-describe; navigation is by heading anchor. -->

## DDD Layer Order

`domain` ← `application` ← `interface` ← `scheduler`. Cross-layer: inward only. `domain/` never imports `infrastructure/`.

## Monorepo Structure (Phase 3 Complete, 2026-04-25)

```
vn-market-intelligence/         ← pnpm workspace root
├── apps/
│   ├── mcp-server/             ← TypeScript/Bun — MCP gateway (port 3000)
│   │   ├── src/                ← domain code + scheduler + microservice clients
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── api-gateway/            ← Go — routing layer (port 4000)
│   ├── stock-price/            ← Go 1.22 (CGO) — price aggregation (port 5000, mapped 5010)
│   ├── pdf-extractor/          ← Python/FastAPI — PDF parsing (port 5001)
│   ├── rag-service/            ← Python/FastAPI — embeddings + search (port 5002)
│   ├── technical-analysis/     ← TypeScript/Bun — TA indicators (port 5003)
│   ├── macro-indicators/       ← TypeScript/Bun — macro snapshot (port 5004)
│   ├── kinh-dich-service/      ← TypeScript/Bun — hexagram readings (port 5005)
│   ├── alert-engine/           ← Go 1.22 (CGO) — signal evaluation (port 5006)
│   └── news-fetch/             ← TypeScript/Bun — Reuters + Bloomberg scrapers (port 5008)
├── docker-compose.yml          ← All 10 services + shared /data volume
├── packages/
│   ├── shared-types/           ← Inter-service TS contracts
│   ├── shared-db/              ← SQLite schema
│   └── shared-config/          ← mcp.config.json loader
└── vps-scripts/                ← 7 systemd services on Vinahost VPS
```

## Services (Phase 3 — Production)

Service list, ports, languages → SSOT:
```bash
jq '[.project.microservices[] | {id, port, language, runtime}]' docs/data/system-map.json
```

**Database isolation (single-writer):**
- `market.db` — WRITE: mcp-server only | READ: technical-analysis, macro-indicators, kinh-dich-service (readonly:true)
- `alert_engine.db` — WRITE: alert-engine only (local alert cache; results POST to mcp-server)
- `stock_price.db` — WRITE: stock-price Tier3 cache only (results POST to mcp-server /api/push-prices)
- `pdf_extractor.db` — WRITE: pdf-extractor only (isolated, no sharing)
- `rag_service.db` — WRITE: rag-service only (isolated, no sharing)

**Restart:** see `docs/policies/restart-policy.md` (SSOT — docker-compose only, 9 services)

## Microservices Communication

```
VPS (Vinahost Vietnam)                  Local Docker
    │                                      │
    ├─ vn-price-fetch.service       →   API Gateway (4000)
    ├─ vn-bctc-fetch.service        →   PDF Extractor (5001)
    ├─ vn-news-fetch.service        →   RAG Service (5002)
    ├─ vn-sbv-fetch.service         →   Macro Indicators (5004)
    └─ vn-foreign-flow.service      →   MCP Server (3000)
                ↓ (zenmidi.com bridge)
    MCP Server (3000)
        ├─ HTTP → Stock Price (5000)
        ├─ HTTP → Technical Analysis (5003)
        ├─ HTTP → Macro Indicators (5004)
        ├─ HTTP → Kinh Dich (5005)
        ├─ HTTP → Alert Engine (5006)
        ├─ HTTP → PDF Extractor (5001)
        └─ HTTP → RAG Service (5002)
```

## Service Implementation Notes

- **MCP Server**: tool count → `docs/data/project-stats.json#toolCount`; scheduler count → `docs/data/project-stats.json#cronJobCount`; HTTP clients to all configured downstream services
- **API Gateway**: Central routing, health aggregation, load balancing
- **Stock Price**: 3-tier price fallback (VPS bridge → exchange APIs → fallback)
- **PDF Extractor**: pdfplumber + Tesseract OCR for BCTC financial statements
- **RAG Service**: sentence-transformers embeddings + LanceDB semantic search
- **Technical Analysis**: RSI, MACD, Bollinger Bands, moving averages
- **Macro Indicators**: SBV FX rates, commodity prices, trend analysis
- **Kinh Dich Service**: Hexagram readings, trading signals, confidence scoring
- **Alert Engine**: Multi-source signal evaluation, verified chain synthesis

Tests: run from `apps/mcp-server/` with `bun test`. Or from root: `pnpm test`.

## Folder Tree (apps/mcp-server/src/)

> Sprint 209-220: Modular Monolith refactor. Tools, services, and schedulers now organized into 10 domain module subfolders. See "Module Boundaries" section below.

```
src/
├── index.ts                         ← Bun HTTP server entry (bootstrap + startScheduler)
├── domain/
│   ├── models/index.ts              ← FinancialReport, Alert, AnalysisEntry, Signal, WatchlistAction
│   ├── repositories/index.ts        ← Repository interfaces (ports)
│   └── services/
│       ├── index.ts                 ← Barrel re-export of all domain services
│       ├── [flat files]             ← Cross-cutting services: cascadeEngine, signalDetector,
│       │                               alertGenerator, alertCooldown, alertDedup, alertGrouper,
│       │                               sentimentClassifier, volatilityCalculator, convictionScorer,
│       │                               rateLimiter, sourceHealthTracker, customAlertEvaluator,
│       │                               alertMuteChecker, sentimentTrend, embeddingTextBuilder,
│       │                               newsNormalizer, vnNumberParser, stockSearch, stockAliases,
│       │                               tradeRelationships, sectorPeers, macroThresholds,
│       │                               predictionCascadeMapper, predictionSignalDetector,
│       │                               decisionNoteSynthesizer, sparkline, portfolioRiskCalculator,
│       │                               portfolioPnlCalculator, priceAlertChecker,
│       │                               correlationCalculator, performanceAttribution,
│       │                               rebalancingCalculator, sectorRotationDetector,
│       │                               foreignFlowAnalyzer, technicalIndicators, intradayAnalyzer,
│       │                               orderBookAnalyzer, recencyWeighter, chainSynthesizer, …
│       ├── financial-reports/       ← BCTC domain logic
│       │   ├── balanceSheetExtractor.ts / incomeStatementExtractor.ts / cashFlowExtractor.ts
│       │   ├── ratioComputer.ts     ← 22 financial ratios
│       │   ├── periodDeltaComputer.ts ← QoQ / YoY deltas
│       │   ├── bctcValidator.ts     ← Accounting identity validation
│       │   ├── earningsCalendar.ts / priceNewsValidator.ts
│       │   └── index.ts
│       └── kinhDich/                ← Kinh Dich hexagram engine
│           ├── hexagramLibrary.ts   ← 64 hexagrams static data
│           ├── hexagramResolver.ts / haoEncoder.ts / nuclearComputer.ts / transformedComputer.ts
│           ├── nguHanhClassifier.ts ← Five Elements (Kim/Moc/Thuy/Hoa/Tho)
│           ├── kinhDichReading.ts / kinhDichFormatter.ts / hexagramBacktester.ts / kinhDichWrapper.ts
│           └── index.ts
├── infrastructure/
│   ├── config.ts / logger.ts / circuitBreaker.ts / circuitBreakerRegistry.ts
│   ├── adapters/                    ← Output formatters for analysis results (analysisFormatters.ts)
│   ├── agents/                      ← Cowork agent helpers: constants, qaResponder/smartCompact spawners
│   ├── cache/                       ← In-process session tool cache (sessionToolCache.ts)
│   ├── db/
│   │   ├── schema.ts                ← Thin orchestrator (~248 lines): imports all slices,
│   │   │                               exposes getDb / initDatabase / closeDb (backward-compat)
│   │   ├── schema-market-data.ts    ← prices, OHLCV, foreign flow tables
│   │   ├── schema-financial-reports.ts ← BCTC, PDF, vnstock tables
│   │   ├── schema-news.ts           ← news, cascade, signals, insider tables
│   │   ├── schema-alerts.ts         ← alerts, mutes, custom rules, price alerts, broker sanctions
│   │   ├── schema-portfolio.ts      ← positions, P&L snapshots, target allocations
│   │   ├── schema-briefings.ts      ← briefing_log, market_summaries
│   │   ├── schema-macro.ts          ← macro indicators, commodities, SBV, predictions, kinhdich
│   │   ├── schema-system.ts         ← cron runs, agent logs, evidence, system tables
│   │   ├── alertStore.ts / macroStatsStore.ts / commodityTracker.ts / tradeStore.ts
│   │   ├── predictionStore.ts / positionStore.ts / pnlSnapshotStore.ts
│   │   ├── customAlertRuleStore.ts / alertMuteStore.ts / targetAllocationStore.ts
│   │   ├── hexagramStore.ts         ← kinhdich_readings + hexagram_transitions
│   │   ├── checkpoint.ts            ← SQLite WAL checkpoint helper
│   │   └── index.ts
│   ├── fetchers/
│   │   ├── rss.ts / cafef.ts / vnexpress.ts / vneconomy.ts / reuters.ts
│   │   ├── tradingEconomicsStream.ts / tradingEconomics.ts
│   │   ├── hose.ts (3-tier fallback) / hnx.ts (2-tier fallback)
│   │   ├── ssc.ts (Puppeteer) / pdf.ts / pdfOcrWorker.ts
│   │   ├── polymarket.ts / sbv.ts / yahooFinance.ts
│   │   └── index.ts
│   ├── fileStore/                   ← JSON file stores; alertVerdictStore.ts = primary pending-verdict
│   │                                   write target (Sprint 1863); read by verdictResolutionJob before
│   │                                   writing outcome to agent_signals.outcome DB column.
│   │                                   Two-stage verdict flow documented in docs/policies/alert-policy.md
│   │                                   (updated 1871g).
│   ├── microservices/               ← HTTP clients to downstream Docker services (clients.ts)
│   ├── notifiers/
│   │   ├── telegram.ts / telegramCommands.ts / telegramWebhookSetup.ts
│   │   └── index.ts
│   ├── observability/               ← Circuit-breaker logger + per-job metrics (jobMetrics.ts)
│   ├── rag/
│   │   ├── embeddings.ts            ← HuggingFace multilingual-MiniLM (local ONNX)
│   │   ├── vectorstore.ts           ← LanceDB read/write/search
│   │   ├── retriever.ts             ← Multi-level RAG search with temporal decay
│   │   └── index.ts
│   └── vps/                         ← SSH exec helper for Vinahost VPS operator commands (sshExec.ts)
├── application/usecases/
│   ├── assembleBriefing.ts / assembleEveningSummary.ts / assembleAlertDigest.ts
│   ├── checkSscReports.ts / fetchParseAndStoreBctc.ts / parseBctcReport.ts
│   ├── generateAiSummary.ts / generatePeriodicSummary.ts / getPatternSummary.ts
│   ├── pollNews.ts / runImpactChain.ts / runPredictionImpactChain.ts
│   ├── exportPortfolioSnapshot.ts / scanMarket.ts / syncVnstockData.ts / syncSectorPeers.ts
│   └── index.ts
├── interface/
│   ├── mcp/
│   │   ├── server.ts                ← McpServer factory, registers tools via registry.ts
│   │   ├── transport.ts             ← SSEServerTransport setup
│   │   └── tools/                   ← [generated count — see docs/data/tool-registry.json] registered MCP tools (via registry.ts)
│   │       ├── registry.ts          ← Central tool registration, imports all module barrels
│   │       ├── index.ts             ← Top-level barrel
│   │       ├── market-data/         ← prices, OHLCV, foreign flow, insider, TA, price alerts
│   │       ├── financial-reports/   ← BCTC full/summary, earnings calendar
│   │       ├── news-analysis/       ← search, cascade metrics, sentiment trend, source health
│   │       ├── alerts/              ← alert management, digest, mute, custom rules, cron health
│   │       ├── portfolio/           ← positions, P&L, risk, rebalancing, target allocations
│   │       ├── briefings/           ← summary, Telegram report, changelog, market messages
│   │       ├── macro/               ← macro indicators, policy, predictions, calibration
│   │       ├── sector/              ← sector comparison, rotation, supply chain, energy, pharma, …
│   │       ├── kinhdich/            ← hexagram readings and transitions
│   │       ├── system/              ← watchlist, ask queue, feedback, VPS proxy, system status
│   │       ├── analysis/            ← sequential_market_analysis
│   │       └── backtesting/         ← run_backtest, get_backtest_runs, get_backtest_run
│   └── scheduler/index.ts           ← startScheduler()
└── scheduler/                       ← 62 files: jobs.ts + summaryJobs.ts + module subfolders
    ├── jobs.ts                      ← Master cron registration
    ├── summaryJobs.ts / vpsProxyWatchdogJob.ts / pipelineWatchdogJob.ts
    ├── davPharmacyJob.ts / weatherCheckJob.ts / walCheckpointAlert.ts
    ├── market-data/                 ← marketScanJob, foreignFlowAlertJob, insiderCheckJob,
    │                                   taAlertScanJob, taAlertNotifierJob, ohlcvDailyAggregatorJob,
    │                                   ohlcvStalenessCheckJob, ohlcvStartupProbe
    ├── financial-reports/           ← bctcOverdueCheckJob, bctcReparseJob
    ├── news-analysis/               ← intelligenceCycleJob, dataAuditJob, evidenceAccumulatorJob,
    │                                   patternWatchJob, sscCheckerJob
    ├── alerts/                      ← alertDigestJob, bbAlertScanJob, cronHealthAlertJob
    ├── portfolio/                   ← weeklyPortfolioReportJob
    ├── briefings/                   ← morningBriefingJob, eveningSummaryJob, franceSummaryJob
    ├── macro/                       ← baseRateComputationJob, calibrationReportJob,
    │                                   cascadeBacktestJob, predictionMarketJob,
    │                                   predictionOutcomeJob, predictionResolutionJob
    └── system/                      ← askQueueCheckJob, devTeamHeartbeatJob
```

## Module Boundaries

Ten domain modules span `tools/`, `domain/services/` (where applicable), and `scheduler/` subfolders. Each module owns its own `index.ts` barrel.

| Module | Responsibility | Tools subfolder | Scheduler subfolder | Domain services subfolder |
|--------|---------------|-----------------|--------------------|-----------------------------|
| `market-data` | Stock prices, OHLCV, foreign buy/sell flow, insider trades, technical indicators, price alerts | Yes | Yes (8 jobs) | Flat (foreignFlowAnalyzer, technicalIndicators, intradayAnalyzer, priceAlertChecker, …) |
| `financial-reports` | BCTC ingestion, parsing, ratio computation, earnings calendar | Yes | Yes (2 jobs) | Yes (balanceSheetExtractor, ratioComputer, bctcValidator, …) |
| `news-analysis` | News search, cascade engine, sentiment trend, source health | Yes | Yes (5 jobs) | Flat (cascadeEngine, sentimentClassifier, newsNormalizer, chainSynthesizer, …) |
| `alerts` | Alert lifecycle, dedup, cooldown, grouping, mute rules, custom rules, digest | Yes | Yes (3 jobs) | Flat (alertGenerator, alertCooldown, alertDedup, alertGrouper, alertMuteChecker, customAlertEvaluator, …) |
| `portfolio` | Positions, P&L snapshots, risk scoring, rebalancing, target allocations | Yes | Yes (1 job) | Flat (portfolioPnlCalculator, portfolioRiskCalculator, rebalancingCalculator, performanceAttribution, …) |
| `briefings` | Morning briefing, evening summary, France summary, Telegram formatting | Yes | Yes (3 jobs) | Flat (decisionNoteSynthesizer, sparkline, …) |
| `macro` | Macro indicators, SBV FX, commodities, prediction markets, calibration | Yes | Yes (6 jobs) | Flat (macroThresholds, macroIndicatorScorer, policyImpactMapper, predictionCascadeMapper, …) |
| `sector` | Sector comparison, rotation, supply chain, energy, pharma, credit flow, legal risk, climate | Yes | — | Flat (sectorRotationDetector, sectorValuationComparator, creditFlowAnalyzer, energyMarketAnalyzer, pharmaEventMapper, …) |
| `kinhdich` | Hexagram readings, Hao encoding, Ngu Hanh, Markov transitions, backtesting | Yes | — | Yes (`kinhDich/` subfolder) |
| `system` | Watchlist, /ask queue, feedback, VPS proxy health, system status, agent work logs | Yes | Yes (2 jobs) | — |
| `analysis` | Sequential multi-step market analysis combining TA, macro, and news signals into a structured narrative | Yes | — | — |
| `backtesting` | Strategy backtesting execution, run listing, and run retrieval | Yes | — | — |

**Barrel pattern**: every module exposes `index.ts` that re-exports all public symbols. `registry.ts` and `jobs.ts` import only from barrels — never from individual files within a module.

## Schema Decomposition (Sprint 209)

`src/infrastructure/db/schema.ts` was 1,571 lines (monolith). Split into 8 domain slices:

| Slice file | Tables owned |
|-----------|-------------|
| `schema-market-data.ts` | `market_prices`, `ohlcv_daily`, `foreign_flow`, `vps_push_log`, `vnstock_*` |
| `schema-financial-reports.ts` | `financial_reports`, `bctc_vps_queue`, PDF-related tables |
| `schema-news.ts` | `news_items`, `rag_analyses`, `cascade_*`, `signals`, `insider_trades` |
| `schema-alerts.ts` | `alerts`, `alert_mutes`, `custom_alert_rules`, `price_alerts`, `broker_sanctions` |
| `schema-portfolio.ts` | `positions`, `pnl_snapshots`, `target_allocations` |
| `schema-briefings.ts` | `briefing_log`, `market_summaries` |
| `schema-macro.ts` | `macro_indicators`, `commodities`, `sbv_rates`, `prediction_*`, `kinhdich_readings`, `hexagram_transitions` |
| `schema-system.ts` | `cron_job_runs`, `agent_work_log`, `evidence_items`, system tables |

`schema.ts` (~248 lines) remains the sole public API: exports `getDb`, `initDatabase`, `closeDb`. All 38+ callers import from this path unchanged. Slices are internal — only `schema.ts` imports them.

## Key Data Flow

```
News (10 sources via VPS fetch-vn-news.sh, 226 unique items/15-min cycle) + BCTC PDF (via VPS proxy → POST /api/push-bctc-pdf)
  → Fetcher (rate limiter + circuit breaker)
  → Parser (newsNormalizer / parseBctcReport)
  → AnalysisEntry / FinancialReport
  → Embedding (multilingual-MiniLM, 384-dim)
  → LanceDB + SQLite → RAG → cascadeEngine
  → volatilityCalculator → adaptive thresholds → signalDetector
  → alertDedup / alertCooldown / alertGrouper → Alert
  → HIGH/CRITICAL → send_telegram(channel="market") Vietnamese
  → Morning briefing: macro dashboard + commodities + P/L

Polymarket (30 min) → predictionStore → signalDetector → cascade → briefing
Kinh Dich: 6 signals → hexagram → reading + Markov transition → prediction
```

## VPS Proxy (geo-block workaround)

MCP server in France is geo-blocked from VN stock APIs, SSC BCTC portal, news sources, SBV FX rates, and foreign flow data. Vinahost VPS Vietnam (`$VINAHOST_IP`) bridges the gap for all five data types.

**Invariant: VPS liveness is owned by systemd on the Vinahost host. MCP only observes DB staleness. Nothing on the MCP side ever SSHes into VPS at runtime.**

Deploy: `./scripts/deploy-vinahost.sh` (local, operator-only). Health check: `ssh root@$VINAHOST_IP /root/vps-status.sh`. Bot-guarded sources: `vps-scripts/fetch-browser.py` (Playwright/Chromium headless).

### Price Proxy (`vn-price-fetch.service`)

| Component | Location | Role |
|-----------|----------|------|
| `vps-scripts/fetch-prices-loop.sh` | Vinahost VPS ($VINAHOST_IP) | Forever driver: runs fetch every 60s (Mon-Fri 02:00-08:59 UTC) |
| `vps-scripts/vn-price-fetch.service` | Vinahost VPS | systemd: `Type=simple`, `Restart=always`, `RestartSec=5`, `MemoryMax=128M` |
| `deploy-vinahost.sh` | Local (operator-only) | Uploads scripts, daemon-reload/enable/restart. Single operator escape hatch. |
| `src/scheduler/vpsProxyWatchdogJob.ts` | MCP Bun server | Observe-only: reads `MAX(market_prices.updated_at)`. >15 min stale → one WORK alert (30-min cooldown). No SSH. |

Pipeline: `GET /api/watchlist` (VPS pulls codes) | `POST /api/push-prices` (VPS pushes ~60 items/min)
Market hours: Mon-Fri 02:00-08:59 UTC = 09:00-15:59 VN

### Price Staleness Early-Warning Watchdog (SPRINT-229)

The 45-minute VPS proxy watchdog (`vpsProxyWatchdogJob.ts`) monitors multi-source staleness broadly. Complementing this, a new **6-hour price-staleness watchdog** (`priceUpdateWatchdogJob.ts`) fires specifically when market prices go stale during VN market hours (Mon–Fri 02:00–08:59 UTC).

**Design rationale**:
- **Separate threshold (6h vs 45min)** detects different failure modes: 45-min catches network/service lulls; 6h catches silent pipeline failures (e.g., systemd service crash going unnoticed)
- **VN market hours guard** prevents false alerts outside trading windows (off-hours staleness is expected/benign)
- **30-min cooldown** prevents spam during sustained outages (one alert per 30-min window)
- **Dual-channel alerts**: WORK channel (operator diagnostics + SSH commands), MARKET channel (user-friendly Vietnamese notice)
- **Recovery detection**: Sends explicit "pipeline recovered" message when prices freshen after prior alert
- **No fallback implementation**: Investigated in TASK-229c; CafeF RSS (<5–15 min stale) inadequate for real-time alerts; HNX API deferred to future sprint pending feasibility study

This two-layer approach provides rapid operator response (6h detector fires within 10 minutes of staleness during market hours) while maintaining broad multi-source coverage (45min detector during off-hours and across all data sources).

### BCTC PDF Proxy (`vn-bctc-fetch.service`) — Task 1112

| Component | Location | Role |
|-----------|----------|------|
| `vps-scripts/fetch-bctc-loop.sh` | Vinahost VPS ($VINAHOST_IP) | Forever driver: runs fetch every 6 hours (no market-hours window — BCTC filings published any time) |
| `vps-scripts/fetch-bctc.sh` | Vinahost VPS | Worker: pulls queue from MCP, downloads PDFs from SSC/HOSE/HNX/UPCOM (TLS bypass for HNX/UPCOM), pushes each to MCP |
| `vps-scripts/vn-bctc-fetch.service` | Vinahost VPS | systemd: `Type=simple`, `Restart=always`, `RestartSec=10`, `MemoryMax=256M` |

Pipeline: `GET /api/bctc-fetch-queue` (VPS pulls pending items from `bctc_vps_queue` table) | `POST /api/push-bctc-pdf` (VPS pushes downloaded PDF as multipart; MCP parses + stores + runs pipeline)
Max PDF size: 50 MB. On successful push, `bctc_vps_queue` row → `status='done'`.

VPS creds in `.env` only: `VINAHOST_IP`, `VINAHOST_PASSWORD` — never in Bun process memory.

**Dead-end**: commit `c151376` (reverted) used SSH-self-heal + sshpass inside Bun. Discarded — root creds in Bun process + cron as primitive. VPS crontab replaced by loop scripts + systemd.

### VPS Migration Status

All Vietnamese data sources route through Vinahost VPS Vietnam (push pattern). MCP server in France should NEVER directly fetch from Vietnamese domains. Vultr VPS Singapore was decommissioned 2026-04-13 (services stopped and disabled).

| Source | Status | Host | VPS Service | Notes |
|--------|--------|------|-------------|-------|
| Stock prices | Done | Vinahost VPS ($VINAHOST_IP) | `vn-price-fetch.service` | 60s market hours |
| BCTC PDFs | Done | Vinahost VPS ($VINAHOST_IP) | `vn-bctc-fetch.service` | 6h cadence |
| CafeF RSS (market + business) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20+20 items/cycle |
| VnExpress RSS (business) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20 items/cycle |
| VnEconomy RSS (stocks) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20 items/cycle |
| Vietstock RSS (stocks + insider + macro) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20+10+10 items/cycle |
| VietnamBiz RSS (stocks) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20 items/cycle |
| VnBusiness RSS (stocks) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20 items/cycle — derivatives, FX coverage |
| TuoiTre RSS (business) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20 items/cycle |
| NhanDan RSS (economy + securities) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20+10 items/cycle — policy signals, required --compressed flag |
| NLD RSS (finance/securities) | Done | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | 20 items/cycle |
| BaoDauTu RSS (finance) | INVESTIGATE | Vinahost VPS ($VINAHOST_IP) | `vn-news-fetch.service` | Returns HTTP 200 but 0 items — parsing issue (see task 1185) |
| VnEconomy/tai-chinh RSS | BLOCKED | — | — | Permanent bot guard on that specific feed; `fetch-browser.py` (Playwright) used as fallback |
| SBV FX rates | Done | Vinahost VPS ($VINAHOST_IP) | `vn-sbv-fetch.service` | 30min cadence |
| Foreign buy/sell flow | Done | Vinahost VPS ($VINAHOST_IP) | `vn-foreign-flow.service` | 60s market hours |

**News script technical details (as of 2026-04-13):**
- Cycle: every 15 min (was 5 min — too aggressive)
- Human-like delays: 2-7s random between each source
- `--compressed` flag: handles gzip responses
- Temp file for push: fixes "Argument list too long" for large payloads
- Block detection: logs BLOCKED/RATE_LIMITED/ROBOT_GUARD with HTTP code per source
- Total throughput: ~226 unique items per 15-min cycle

## Data Sources & Fallback Chain

| Source | Primary | Fallback(s) |
|--------|---------|-------------|
| VN-Index | VnDirect vnmarket_prices | — |
| HOSE stocks | VnDirect legacy (5s) | VnDirect stock_prices (10s) → CafeF banggia (10s) |
| HNX/UPCOM | HNX API (15s) | VnDirect stock_prices (10s) |
| VN prices (geo-blocked) | Vinahost VPS Vietnam ($VINAHOST_IP) → `POST /api/push-prices` | `vn-price-fetch.service`, 60s market hours |
| News (VN) | Vinahost VPS `fetch-vn-news.sh`: CafeF, VnExpress, VnEconomy, Vietstock, VietnamBiz, VnBusiness, TuoiTre, NhanDan, NLD (9 active + BaoDauTu under investigation); bot-guarded feeds via `fetch-browser.py` (Playwright) | Push via `POST /api/push-news`; human-like delays, --compressed, block detection; 226 items/15min |
| News (global) | Google News, TE Stream | Browser UA, redirect-follow |
| Commodities | Yahoo Finance | — |
| FX rates (geo-blocked) | Vinahost VPS Vietnam ($VINAHOST_IP) → SBV XML | `vn-sbv-fetch.service`, 30min cadence |
| Foreign flow (geo-blocked) | Vinahost VPS Vietnam ($VINAHOST_IP) → `POST /api/push-prices` | `vn-foreign-flow.service`, 60s market hours |
| Macro indicators | Trading Economics scrape | — |
| BCTC PDFs (geo-blocked) | Vinahost VPS Vietnam ($VINAHOST_IP) → `POST /api/push-bctc-pdf` | `vn-bctc-fetch.service`, 6h; SSC portal (Puppeteer) direct — disabled via `disableSscPolling` flag |
| Predictions | Polymarket REST | — |

## mcp.config.json Sections

| Section | Purpose |
|---------|---------|
| `server` | Port, host, log level |
| `data` | Paths: SQLite, LanceDB, briefings, reports |
| `embedding` | Model name, cache dir, vector dimensions |
| `telegram` | Bot token, chat ID, parse mode, enabled |
| `market` | Timezone, open/close times, default watchlist |
| `scheduler` | Cron expressions for all jobs |
| `alerts` | Default thresholds, severity escalation, Telegram trigger levels |
| `alertQuality` | Cooldown minutes, max alerts/day, dedup window, group window |
| `adaptiveThresholds` | Enabled, rolling window, sigma multipliers, min/max clamps |
| `rag` | Temporal decay half-life, max vector distance |
| `fetchers` | Per-source URLs, Puppeteer paths, timeouts, rateLimits |
| `fetchLimits` | News-per-source caps: market-hours / off-hours / manual |
| `cycle` | Intelligence cycle warn threshold, off-hours interval, max concurrent |
| `predictionMarkets` | Polymarket API URL, volume threshold, probability shift %, min wallets |
