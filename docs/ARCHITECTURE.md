# Architecture

> Extracted from CLAUDE.md. Full file tree, data flow, and DDD structure.

## DDD Layered Structure

```
src/
├── index.ts                        ← Bun HTTP server entry point (bootstrap + startScheduler)
├── domain/
│   ├── models/index.ts             ← FinancialReport, Alert, AnalysisEntry, Signal, WatchlistAction
│   ├── repositories/index.ts       ← Repository interfaces (ports)
│   └── services/
│       ├── vnNumberParser.ts       ← Vietnamese number parser (parentheses, VND suffixes)
│       ├── balanceSheetExtractor.ts
│       ├── incomeStatementExtractor.ts
│       ├── cashFlowExtractor.ts
│       ├── ratioComputer.ts
│       ├── periodDeltaComputer.ts
│       ├── embeddingTextBuilder.ts
│       ├── newsNormalizer.ts       ← RSS item → AnalysisEntry
│       ├── cascadeEngine.ts        ← Global → country → sector → stock causal chain
│       ├── signalDetector.ts       ← Price drop/surge, volume spike, news mention, report
│       ├── alertGenerator.ts      ← Multi-signal → Alert with severity
│       ├── alertCooldown.ts        ← Suppress duplicate alerts within cooldown window
│       ├── alertDedup.ts           ← djb2 fingerprint hash to drop exact-duplicate alerts
│       ├── alertGrouper.ts         ← Cluster related alerts within 15-min window
│       ├── bctcValidator.ts        ← Validate extracted BCTC data (accounting identity)
│       ├── sentimentClassifier.ts  ← Rule-based bullish/bearish/neutral, Vi + EN
│       ├── volatilityCalculator.ts ← Historical volatility → adaptive signal thresholds
│       ├── sectorPeers.ts         ← Sector peer mapping → auto context stocks
│       ├── macroThresholds.ts     ← σ-based macro thresholds (z-score classification)
│       ├── priceNewsValidator.ts  ← Price-news divergence + sensitive dates
│       ├── convictionScorer.ts   ← 5-dimension cross-signal validation
│       ├── tradeRelationships.ts ← Stock-level trade map (export/import/JV)
│       ├── stockAliases.ts        ← Company name alias dictionary
│       ├── predictionCascadeMapper.ts ← Polymarket → VN stock sectors
│       ├── predictionSignalDetector.ts ← volume_spike + probability_shift
│       ├── decisionNoteSynthesizer.ts ← action notes: entry/exit/hold
│       ├── sparkline.ts            ← ASCII sparkline renderer
│       ├── portfolioRiskCalculator.ts ← VaR / max-drawdown
│       ├── stockSearch.ts          ← 50-stock catalogue with fuzzy search
│       ├── sectorRotationDetector.ts ← momentum + relative strength
│       ├── earningsCalendar.ts     ← BCTC deadline calendar
│       ├── correlationCalculator.ts ← Pearson correlation matrix
│       ├── performanceAttribution.ts ← signal P&L attribution
│       ├── rebalancingCalculator.ts ← target-weight drift → BAN/MUA/GIU
│       ├── portfolioPnlCalculator.ts ← per-position P&L
│       ├── priceAlertChecker.ts    ← stop-loss / take-profit checker
│       ├── rateLimiter.ts          ← per-host token-bucket rate limiter
│       ├── sourceHealthTracker.ts  ← ok/degraded/down classification
│       ├── customAlertEvaluator.ts ← custom alert rules
│       ├── alertMuteChecker.ts     ← mute check before firing alert
│       ├── sentimentTrend.ts       ← OLS slope sentiment trend
│       └── kinhDich/               ← Kinh Dich (I Ching) state machine engine
│           ├── hexagramLibrary.ts  ← 64 hexagrams static data
│           ├── hexagramResolver.ts ← O(1) lookup: signals → hexagram
│           ├── haoEncoder.ts       ← 4-state classifier (LAO_DUONG/THIEU_DUONG/THIEU_AM/LAO_AM)
│           ├── nuclearComputer.ts  ← Ho que (nuclear hexagram)
│           ├── transformedComputer.ts ← Bien que (transformed hexagram)
│           ├── nguHanhClassifier.ts ← Five Elements (Kim/Moc/Thuy/Hoa/Tho)
│           ├── kinhDichReading.ts  ← Orchestrator: signals → full reading
│           ├── kinhDichFormatter.ts ← Vietnamese output formatter
│           ├── hexagramBacktester.ts ← Backtest readings vs 5-day prices
│           └── index.ts
├── infrastructure/
│   ├── config.ts                   ← Env config (dotenv + mcp.config.json)
│   ├── logger.ts                   ← Structured logger (log rotation)
│   ├── circuitBreaker.ts           ← Circuit breaker implementation
│   ├── circuitBreakerRegistry.ts   ← Per-host circuit breaker registry
│   ├── db/
│   │   ├── schema.ts               ← SQLite init (all tables + indexes)
│   │   ├── alertStore.ts           ← Alert read/write + notified_telegram flag
│   │   ├── macroStatsStore.ts      ← Rolling mean/σ from history tables
│   │   ├── commodityTracker.ts     ← Auto-extract commodity prices from news
│   │   ├── tradeStore.ts          ← Trade exposure CRUD + auto-learn
│   │   ├── predictionStore.ts     ← prediction_markets + prediction_signals
│   │   ├── positionStore.ts       ← position CRUD
│   │   ├── pnlSnapshotStore.ts    ← portfolio_pnl_snapshots CRUD
│   │   ├── customAlertRuleStore.ts ← custom alert rule CRUD
│   │   ├── alertMuteStore.ts      ← alert mute/unmute CRUD
│   │   ├── targetAllocationStore.ts ← target portfolio weights CRUD
│   │   ├── hexagramStore.ts       ← kinhdich_readings + hexagram_transitions
│   │   ├── checkpoint.ts          ← SQLite WAL checkpoint helper
│   │   └── index.ts
│   ├── fetchers/
│   │   ├── rss.ts                  ← RSS base fetcher
│   │   ├── cafef.ts                ← CafeF news (Vietnamese)
│   │   ├── vnexpress.ts            ← VnExpress Finance RSS
│   │   ├── vneconomy.ts            ← VnEconomy stocks + finance RSS
│   │   ├── reuters.ts              ← Reuters / AP News (Google News)
│   │   ├── tradingEconomicsStream.ts ← TE global macro news stream
│   │   ├── tradingEconomics.ts    ← TE Vietnam indicators scraper
│   │   ├── hose.ts                 ← HOSE prices (3-tier fallback)
│   │   ├── hnx.ts                  ← HNX + UPCOM prices (2-tier fallback)
│   │   ├── ssc.ts                  ← SSC portal scraper (Puppeteer)
│   │   ├── pdf.ts                  ← PDF downloader + text extractor
│   │   ├── pdfOcrWorker.ts        ← OCR worker for scanned PDFs
│   │   ├── polymarket.ts          ← Polymarket REST fetcher
│   │   ├── sbv.ts                 ← SBV rates fetcher
│   │   ├── yahooFinance.ts        ← Yahoo Finance commodities
│   │   └── index.ts
│   ├── notifiers/
│   │   ├── telegram.ts             ← Telegram Bot API notifier
│   │   ├── telegramCommands.ts     ← Command router: /watchlist, /alerts, etc.
│   │   ├── telegramWebhookSetup.ts ← Webhook registration on startup
│   │   └── index.ts
│   └── rag/
│       ├── embeddings.ts           ← HuggingFace multilingual-MiniLM (local ONNX)
│       ├── vectorstore.ts          ← LanceDB read/write/search
│       ├── retriever.ts            ← Multi-level RAG search with temporal decay
│       └── index.ts
├── application/
│   └── usecases/
│       ├── assembleBriefing.ts     ← Morning briefing assembly
│       ├── assembleEveningSummary.ts ← Evening summary assembly
│       ├── checkSscReports.ts      ← SSC nightly BCTC check (with dedup)
│       ├── fetchParseAndStoreBctc.ts ← SSC fetch → parse → store
│       ├── generateAiSummary.ts    ← Rule-based BCTC summary
│       ├── generatePeriodicSummary.ts ← Daily/weekly/monthly summaries
│       ├── getPatternSummary.ts    ← Historical pattern detection
│       ├── parseBctcReport.ts      ← BCTC PDF text → FinancialReport
│       ├── pollNews.ts             ← 5-source poll → embed → alert
│       ├── runImpactChain.ts       ← Causal chain orchestrator
│       ├── runPredictionImpactChain.ts ← Prediction → causal chain
│       ├── assembleAlertDigest.ts  ← Nightly alert digest
│       ├── exportPortfolioSnapshot.ts ← JSON portfolio export
│       ├── scanMarket.ts           ← Market scan + sector context
│       ├── syncVnstockData.ts      ← vnstock sync (full + light for peers)
│       ├── syncSectorPeers.ts      ← Peer sync orchestrator
│       └── index.ts
├── interface/
│   ├── mcp/
│   │   ├── server.ts               ← McpServer factory, registers tools via registry.ts
│   │   ├── transport.ts            ← SSEServerTransport setup
│   │   └── tools/                  ← 76 registered MCP tools (via registry.ts) + userRequestTools (pending registration)
│   └── scheduler/
│       └── index.ts                ← startScheduler()
└── scheduler/                      ← 22 files: jobs.ts + summaryJobs.ts + 20 job handlers (see docs/CRON_JOBS.md)
```

## Key Data Flow

```
News (5 sources) + SSC PDF → Fetcher (rate limiter) → Parser → AnalysisEntry/FinancialReport
         ↓                         ↓                                    ↓
  sourceHealthTracker        commodityTracker              bctcValidator
  (ok/degraded/down)         (auto-extract prices)                    ↓
         ↓                              ↓              Embedding (multilingual-MiniLM)
         ↓                     macroStatsStore                        ↓
         ↓                     (rolling mean/σ)    LanceDB + SQLite → RAG → cascadeEngine
         ↓                              ↓                             ↓
         └──────────────────────→  volatilityCalculator → adaptive thresholds → signalDetector
                                                                      ↓
                       alertDedup / alertCooldown / alertGrouper → Alert if watchlist
                                                                      ↓
                       tradeRelationships + priceNewsValidator + sectorPeers + priceAlertChecker
                                                                      ↓
                   HIGH/CRITICAL → Telegram (Vietnamese) + sensitive dates
                                                                      ↓
                   Morning briefing: macro dashboard + commodities + P&L

Polymarket (30 min) → predictionStore → signalDetector → cascade → briefing
Kinh Dich: 6 signals → hexagram → reading + Markov transition → prediction
```

## VPS Price Proxy (geo-block workaround)

The MCP server runs in France and is geo-blocked from Vietnamese stock APIs (`bgapidatafeed.vps.com.vn`, CafeF price feed). A Vultr VPS in Singapore bridges this gap.

### Architecture (as of 2026-04-06, commit c84a329)

**Invariant: VPS liveness is owned by systemd on the Vultr host. The MCP server only observes `market_prices.updated_at` freshness and alerts on staleness. Nothing on the MCP side ever SSHes into the VPS at runtime.**

| Component | Location | Role |
|-----------|----------|------|
| `vps-scripts/fetch-prices-loop.sh` | Vultr VPS (`139.180.185.18`) | Forever driver: runs `/root/fetch-prices.sh` every 60s during market hours (Mon-Fri 02:00-08:59 UTC), sleeps 300s off-hours |
| `vps-scripts/vn-price-fetch.service` | Vultr VPS | systemd unit: `Type=simple`, `Restart=always`, `RestartSec=5`, `MemoryMax=128M` — auto-starts on boot, logs to `/var/log/vn-price-fetch.log` |
| `deploy-vps-proxy.sh` | Local (operator-only) | Uploads loop script + unit file, runs daemon-reload/enable/restart. **The single escape hatch for operator intervention.** |
| `src/scheduler/vpsProxyWatchdogJob.ts` | MCP Bun server | Observe-only: reads `MAX(market_prices.updated_at)`. If >5 min stale during VN market hours, sends ONE Telegram Chat alert (30-min cooldown). No SSH, no sshpass, no creds in Bun process. |

### Pipeline endpoints (unchanged)
- `GET /api/watchlist` — VPS pulls stock codes to fetch
- `POST /api/push-prices` — VPS pushes ~60 items/minute during market hours

### Market hours window
Mon-Fri 02:00-08:59 UTC = 09:00-15:59 VN time (HOSE trading session)

### VPS credentials
Stored in `.env` only: `VULTR_IP`, `VULTR_PASSWORD`, `VULTR_USERNAME`. Never in Bun process memory at runtime.

### Dead-end NOT to resurrect
Commit `c151376` (reverted same day) shipped an SSH-self-heal variant that reinstalled VPS crontab from within Bun via `sshpass`. That approach was discarded because it put root-SSH creds inside the Bun process and used cron as the primitive. The crontab-based schedule no longer exists on the VPS — the schedule now lives inside `fetch-prices-loop.sh` controlled by systemd.

## Data Sources & Fallback Chain

| Source | Primary | Fallback(s) |
|--------|---------|-------------|
| VN-Index | VnDirect vnmarket_prices | — |
| HOSE stocks | VnDirect legacy (5s) | VnDirect stock_prices (10s) → CafeF banggia (10s) |
| HNX/UPCOM | HNX API (15s) | VnDirect stock_prices (10s) |
| VN stock prices (geo-blocked) | Vultr VPS Singapore → `POST /api/push-prices` (systemd-managed, 60s interval) | — |
| News | CafeF, VnExpress, VnEconomy, Google News, TE Stream | Browser UA, redirect-follow |
| Commodities | Yahoo Finance | — |
| FX rates | Vietcombank XML | — |
| Macro indicators | Trading Economics scrape | — |
| BCTC | SSC portal (Puppeteer) | — |
| Predictions | Polymarket REST | — |

## Data Model References

- **AnalysisEntry** (RAG): 4-level hierarchy (global/country/domain/action), 384-dim embedding, causal links
- **FinancialReport** (BCTC): full Vietnamese BCTC — see `bctc-schema.ts`
- **WatchlistAction**: stock code, exchange, domain, configurable alert thresholds
- **Alert**: multi-signal trigger, severity, affected stocks with direction + confidence

## mcp.config.json — Central Configuration

`mcp.config.json` (root level) is the single source of truth for all tuneable parameters. Environment variables in `.env` override individual fields at runtime.

| Section | Purpose |
|---------|---------|
| `server` | Port, host, log level |
| `data` | Paths for SQLite, LanceDB, briefings, reports |
| `embedding` | Model name, cache dir, vector dimensions |
| `telegram` | Bot token, chat ID, parse mode, enabled flag |
| `market` | Timezone, open/close times, default watchlist |
| `scheduler` | Cron expressions for all jobs |
| `alerts` | Default thresholds, severity escalation, Telegram trigger levels |
| `alertQuality` | Cooldown minutes, max alerts/day, dedup window, group window |
| `adaptiveThresholds` | Enabled flag, rolling window days, sigma multipliers, min/max clamps |
| `rag` | Temporal decay half-life, max vector distance |
| `fetchers` | Per-source URLs, Puppeteer paths, timeouts, rateLimits |
| `fetchLimits` | News-per-source caps for market-hours / off-hours / manual runs |
| `cycle` | Intelligence cycle warn threshold, off-hours interval, max concurrent |
| `predictionMarkets` | Polymarket API URL, volume threshold, probability shift %, min unique wallets |
