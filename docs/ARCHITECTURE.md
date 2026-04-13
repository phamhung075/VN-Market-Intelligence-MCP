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
│   │   └── tools/                   ← 83 registered MCP tools (via registry.ts)
│   └── scheduler/index.ts           ← startScheduler()
└── scheduler/                       ← 23 files: jobs.ts + summaryJobs.ts + 21 job handlers
```

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

Deploy: `./deploy-vinahost.sh` (local, operator-only). Health check: `ssh root@$VINAHOST_IP /root/vps-status.sh`. Bot-guarded sources: `vps-scripts/fetch-browser.py` (Playwright/Chromium headless).

### Price Proxy (`vn-price-fetch.service`)

| Component | Location | Role |
|-----------|----------|------|
| `vps-scripts/fetch-prices-loop.sh` | Vinahost VPS ($VINAHOST_IP) | Forever driver: runs fetch every 60s (Mon-Fri 02:00-08:59 UTC) |
| `vps-scripts/vn-price-fetch.service` | Vinahost VPS | systemd: `Type=simple`, `Restart=always`, `RestartSec=5`, `MemoryMax=128M` |
| `deploy-vinahost.sh` | Local (operator-only) | Uploads scripts, daemon-reload/enable/restart. Single operator escape hatch. |
| `src/scheduler/vpsProxyWatchdogJob.ts` | MCP Bun server | Observe-only: reads `MAX(market_prices.updated_at)`. >15 min stale → one WORK alert (30-min cooldown). No SSH. |

Pipeline: `GET /api/watchlist` (VPS pulls codes) | `POST /api/push-prices` (VPS pushes ~60 items/min)
Market hours: Mon-Fri 02:00-08:59 UTC = 09:00-15:59 VN

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
