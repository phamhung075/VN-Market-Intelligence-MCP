# Architecture

## DDD Layer Order

`domain` ← `application` ← `interface` ← `scheduler`. Cross-layer: inward only. `domain/` never imports `infrastructure/`.

## Folder Tree

```
src/
├── index.ts                         ← Bun HTTP server entry (bootstrap + startScheduler)
├── domain/
│   ├── models/index.ts              ← FinancialReport, Alert, AnalysisEntry, Signal, WatchlistAction
│   ├── repositories/index.ts        ← Repository interfaces (ports)
│   └── services/
│       ├── vnNumberParser.ts        ← Vietnamese number parser (parentheses, VND suffixes)
│       ├── balanceSheetExtractor.ts / incomeStatementExtractor.ts / cashFlowExtractor.ts
│       ├── ratioComputer.ts         ← 22 financial ratios
│       ├── periodDeltaComputer.ts   ← QoQ / YoY deltas
│       ├── embeddingTextBuilder.ts / newsNormalizer.ts
│       ├── cascadeEngine.ts         ← Global → country → sector → stock causal chain
│       ├── signalDetector.ts        ← Price drop/surge, volume spike, news mention, report
│       ├── alertGenerator.ts        ← Multi-signal → Alert with severity
│       ├── alertCooldown.ts / alertDedup.ts / alertGrouper.ts
│       ├── bctcValidator.ts         ← Accounting identity validation
│       ├── sentimentClassifier.ts   ← Rule-based bullish/bearish/neutral, Vi+EN
│       ├── volatilityCalculator.ts  ← Historical vol → adaptive signal thresholds
│       ├── sectorPeers.ts / macroThresholds.ts / priceNewsValidator.ts
│       ├── convictionScorer.ts      ← 5-dimension cross-signal validation
│       ├── tradeRelationships.ts / stockAliases.ts
│       ├── predictionCascadeMapper.ts / predictionSignalDetector.ts
│       ├── decisionNoteSynthesizer.ts / sparkline.ts / portfolioRiskCalculator.ts
│       ├── stockSearch.ts / sectorRotationDetector.ts / earningsCalendar.ts
│       ├── correlationCalculator.ts / performanceAttribution.ts / rebalancingCalculator.ts
│       ├── portfolioPnlCalculator.ts / priceAlertChecker.ts
│       ├── rateLimiter.ts           ← per-host token-bucket rate limiter
│       ├── sourceHealthTracker.ts / customAlertEvaluator.ts / alertMuteChecker.ts / sentimentTrend.ts
│       └── kinhDich/
│           ├── hexagramLibrary.ts   ← 64 hexagrams static data
│           ├── hexagramResolver.ts / haoEncoder.ts / nuclearComputer.ts / transformedComputer.ts
│           ├── nguHanhClassifier.ts ← Five Elements (Kim/Moc/Thuy/Hoa/Tho)
│           ├── kinhDichReading.ts / kinhDichFormatter.ts / hexagramBacktester.ts
│           └── index.ts
├── infrastructure/
│   ├── config.ts / logger.ts / circuitBreaker.ts / circuitBreakerRegistry.ts
│   ├── db/
│   │   ├── schema.ts                ← SQLite init (all tables + indexes)
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
│   ├── notifiers/
│   │   ├── telegram.ts / telegramCommands.ts / telegramWebhookSetup.ts
│   │   └── index.ts
│   └── rag/
│       ├── embeddings.ts            ← HuggingFace multilingual-MiniLM (local ONNX)
│       ├── vectorstore.ts           ← LanceDB read/write/search
│       ├── retriever.ts             ← Multi-level RAG search with temporal decay
│       └── index.ts
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
│   │   └── tools/                   ← 80 registered MCP tools (via registry.ts)
│   └── scheduler/index.ts           ← startScheduler()
└── scheduler/                       ← 23 files: jobs.ts + summaryJobs.ts + 21 job handlers
```

## Key Data Flow

```
News (5 sources) + SSC PDF
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

## VPS Price Proxy (geo-block workaround)

MCP server in France is geo-blocked from VN stock APIs. Vultr VPS in Singapore bridges the gap.

**Invariant: VPS liveness is owned by systemd on the Vultr host. MCP only observes `market_prices.updated_at`. Nothing on the MCP side ever SSHes into VPS at runtime.**

| Component | Location | Role |
|-----------|----------|------|
| `vps-scripts/fetch-prices-loop.sh` | Vultr VPS (`139.180.185.18`) | Forever driver: runs fetch every 60s (Mon-Fri 02:00-08:59 UTC) |
| `vps-scripts/vn-price-fetch.service` | Vultr VPS | systemd: `Type=simple`, `Restart=always`, `RestartSec=5`, `MemoryMax=128M` |
| `deploy-vps-proxy.sh` | Local (operator-only) | Uploads scripts, daemon-reload/enable/restart. Single operator escape hatch. |
| `src/scheduler/vpsProxyWatchdogJob.ts` | MCP Bun server | Observe-only: reads `MAX(market_prices.updated_at)`. >5 min stale → one MARKET alert (30-min cooldown). No SSH. |

Pipeline: `GET /api/watchlist` (VPS pulls codes) | `POST /api/push-prices` (VPS pushes ~60 items/min)
Market hours: Mon-Fri 02:00-08:59 UTC = 09:00-15:59 VN
VPS creds in `.env` only: `VULTR_IP`, `VULTR_PASSWORD`, `VULTR_USERNAME` — never in Bun process memory.

**Dead-end**: commit `c151376` (reverted) used SSH-self-heal + sshpass inside Bun. Discarded — root creds in Bun process + cron as primitive. VPS crontab replaced by `fetch-prices-loop.sh` + systemd.

## Data Sources & Fallback Chain

| Source | Primary | Fallback(s) |
|--------|---------|-------------|
| VN-Index | VnDirect vnmarket_prices | — |
| HOSE stocks | VnDirect legacy (5s) | VnDirect stock_prices (10s) → CafeF banggia (10s) |
| HNX/UPCOM | HNX API (15s) | VnDirect stock_prices (10s) |
| VN prices (geo-blocked) | Vultr VPS Singapore → `POST /api/push-prices` | — |
| News | CafeF, VnExpress, VnEconomy, Google News, TE Stream | Browser UA, redirect-follow |
| Commodities | Yahoo Finance | — |
| FX rates | Vietcombank XML | — |
| Macro indicators | Trading Economics scrape | — |
| BCTC | SSC portal (Puppeteer) | — |
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
