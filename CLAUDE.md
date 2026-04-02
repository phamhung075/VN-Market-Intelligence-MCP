# VN Market Intelligence MCP — Claude Project Context

## What this project is

A MCP (Model Context Protocol) server built in TypeScript running on Bun. It gives Claude real-time intelligence on the Vietnamese stock market (HOSE / HNX / UPCOM) by:

- Fetching and analyzing Vietnamese + global news via causal chain (global → country → sector → stock)
- Extracting and analyzing financial reports (BCTC) from congbothongtin.ssc.gov.vn
- Maintaining a RAG memory of past analyses using local embeddings (multilingual-MiniLM)
- Managing a user's stock watchlist and generating multi-signal alerts
- Running a daily scheduled briefing at market open/close

## Multi-Agent Team (AI Native SDLC)

This project is built by a **Hierarchical Multi-Agent System (MAS)** inspired by Lê Hoàng Dũng's AI Native SDLC.
The full workflow is documented in `.claude/WORKFLOW.md`.

### Agent Roster

| Agent | File | Role |
|-------|------|------|
| PO (Product Owner) | `.claude/agents/po.md` | Vision, approves specs, final sign-off |
| BA (Business Analyst) | `.claude/agents/ba.md` | Requirements, edge cases, blockers |
| Architect | `.claude/agents/architect.md` | Brownfield analysis, technical design, risk |
| PM (Project Manager) | `.claude/agents/pm.md` | Sprint planning, task breakdown, TASKS.md |
| Developer | `.claude/agents/developer.md` | TDD implementation, DDD compliance |
| QA / CI-CD | `.claude/agents/qa.md` | Test pipeline, merge gate, sprint report |
| Fixer | `.claude/agents/fixer.md` | Minimum fixes on changes-requested tasks |
| Market Analyst | `.claude/agents/market-analyst.md` | Investment analysis via MCP tools |

### Auto-Running Chain
```
Human idea → PO → BA → ⛔(blockers) → Architect → PM → Developer → QA
                                                              ↕
                                                          Fixer (if needed)
                                                              ↓
                                              ⛔(smoke test) → PO → merge main
```
Only 2 Gatekeeper pauses require human input: blocker answers + smoke test approval.

### Start a new feature
```
Use @po agent: "I want to add [feature]. Investment goal: [why]."
```

## Architecture summary

DDD layered architecture (task 001 + task 088 legacy cleanup):

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
│       ├── alertCooldown.ts        ← Suppress duplicate alerts within cooldown window (task 131)
│       ├── alertDedup.ts           ← djb2 fingerprint hash to drop exact-duplicate alerts (task 131)
│       ├── alertGrouper.ts         ← Cluster related alerts within 15-min window (task 131)
│       ├── bctcValidator.ts        ← Validate extracted BCTC data (accounting identity, magnitude) (task 132)
│       ├── sentimentClassifier.ts  ← Rule-based bullish/bearish/neutral classifier, Vi + EN (task 134)
│       ├── volatilityCalculator.ts ← Historical volatility → adaptive signal thresholds (task 133)
│       ├── sectorPeers.ts         ← Sector peer mapping → auto context stocks for sector-wide comparison
│       ├── macroThresholds.ts     ← σ-based macro thresholds (replaces hardcoded $100/bbl, $4000/oz)
│       ├── priceNewsValidator.ts  ← Price-news divergence detection + sensitive dates + historical parallels
│       ├── convictionScorer.ts   ← 5-dimension cross-signal validation (price, volume, sentiment, cascade, sector)
│       ├── tradeRelationships.ts ← Stock-level trade map: export destinations, import sources, JV partners, revenue %
│       ├── stockAliases.ts        ← Company name alias dictionary (task 160)
│       ├── predictionCascadeMapper.ts ← Map Polymarket markets to VN stock sectors/codes (task 165)
│       ├── predictionSignalDetector.ts ← volume_spike + probability_shift detection from prediction markets (task 171)
│       ├── decisionNoteSynthesizer.ts ← action notes: entry/exit/hold rationale (Sprint 023)
│       ├── sparkline.ts            ← ASCII sparkline renderer for price history (Sprint 023)
│       ├── portfolioRiskCalculator.ts ← VaR / max-drawdown calculation (Sprint 024)
│       ├── stockSearch.ts          ← 50-stock catalogue with fuzzy search (Sprint 024)
│       ├── sectorRotationDetector.ts ← sector rotation logic: momentum + relative strength (Sprint 025)
│       ├── earningsCalendar.ts     ← BCTC deadline calendar: Q1-Q4 filing dates (Sprint 025)
│       ├── correlationCalculator.ts ← Pearson correlation matrix across watchlist (Sprint 026)
│       └── performanceAttribution.ts ← signal P&L attribution per alert type (Sprint 026)
├── infrastructure/
│   ├── config.ts                   ← Env config (dotenv + mcp.config.json) + PredictionMarketsConfig
│   ├── logger.ts                   ← Structured logger (log rotation, LanceDB TRACE suppression)
│   ├── db/
│   │   ├── schema.ts               ← SQLite init (all tables + indexes)
│   │   ├── alertStore.ts           ← Alert read/write helpers + notified_telegram flag
│   │   ├── macroStatsStore.ts      ← Rolling mean/σ from commodity_prices_history + sbv_rates_history
│   │   ├── commodityTracker.ts     ← Auto-extract & store commodity prices from news text (tracked_indicators table)
│   │   ├── tradeStore.ts          ← Trade exposure SQLite CRUD + auto-learn from news
│   │   ├── predictionStore.ts     ← prediction_markets + prediction_signals table helpers (task 172)
│   │   ├── positionStore.ts       ← position CRUD helpers: set/get/close positions (Sprint 023)
│   │   ├── checkpoint.ts          ← SQLite WAL checkpoint helper (task 140)
│   │   └── index.ts
│   ├── fetchers/
│   │   ├── rss.ts                  ← RSS base fetcher
│   │   ├── cafef.ts                ← CafeF news (Vietnamese)
│   │   ├── vnexpress.ts            ← VnExpress Finance RSS
│   │   ├── vneconomy.ts            ← VnEconomy stocks + finance RSS feeds (task 035)
│   │   ├── reuters.ts              ← Reuters / AP News RSS (Google News)
│   │   ├── tradingEconomicsStream.ts ← TE global macro news stream (Level 1-2 cascade input)
│   │   ├── tradingEconomics.ts    ← Trading Economics Vietnam indicators scraper (CPI/GDP)
│   │   ├── hose.ts                 ← HOSE prices (3-tier: VnDirect legacy → stock_prices → CafeF) + fetchVnIndex()
│   │   ├── hnx.ts                  ← HNX + UPCOM prices (HNX API → VnDirect stock_prices fallback)
│   │   ├── ssc.ts                  ← SSC portal scraper — Puppeteer automation (task 031)
│   │   ├── pdf.ts                  ← PDF downloader + pdf-parse text extractor
│   │   ├── pdfOcrWorker.ts        ← OCR worker for scanned BCTC PDFs
│   │   ├── polymarket.ts          ← Polymarket REST fetcher (task 164)
│   │   ├── sbv.ts                 ← SBV (State Bank of Vietnam) rates fetcher
│   │   ├── yahooFinance.ts        ← Yahoo Finance commodity + index prices
│   │   └── index.ts
│   ├── notifiers/
│   │   ├── telegram.ts             ← Telegram Bot API notifier — Vietnamese format, plain text, auto-retry (task 034)
│   │   └── index.ts
│   └── rag/
│       ├── embeddings.ts           ← HuggingFace multilingual-MiniLM (local ONNX)
│       ├── vectorstore.ts          ← LanceDB read/write/search
│       ├── retriever.ts            ← Multi-level RAG search with temporal decay (task 135)
│       └── index.ts
├── application/
│   └── usecases/
│       ├── assembleBriefing.ts     ← Morning briefing + macro dashboard + sensitive dates + commodity tracker + prediction signals
│       ├── assembleEveningSummary.ts ← Evening summary assembly
│       ├── checkSscReports.ts      ← SSC nightly BCTC document check (with dedup)
│       ├── fetchParseAndStoreBctc.ts ← SSC fetch → parse → store pipeline
│       ├── generateAiSummary.ts    ← Rule-based plain-language BCTC summary
│       ├── generatePeriodicSummary.ts ← Daily/weekly/monthly/quarterly/yearly summaries (task 130)
│       ├── getPatternSummary.ts    ← Historical pattern detection
│       ├── parseBctcReport.ts      ← BCTC PDF text → FinancialReport
│       ├── pollNews.ts             ← 5-source poll (RSS + TE stream) → embed → alert + alias resolution
│       ├── runImpactChain.ts       ← Causal chain orchestrator
│       ├── runPredictionImpactChain.ts ← Wire prediction signals into buildCausalChain (task 173)
│       ├── assembleAlertDigest.ts  ← Assemble nightly alert digest with grouping (Sprint 025)
│       ├── exportPortfolioSnapshot.ts ← JSON export of portfolio positions + P&L (Sprint 026)
│       ├── scanMarket.ts           ← Market scan + sector context comparison (toàn ngành vs riêng lẻ)
│       └── index.ts
├── interface/
│   ├── mcp/
│   │   ├── server.ts               ← McpServer factory, registers all 46 tools
│   │   ├── transport.ts            ← SSEServerTransport setup
│   │   └── tools/
│   │       ├── watchlist.ts        ← add/remove/get/update watchlist MCP tools
│   │       ├── alerts.ts           ← get_alerts, run_daily_briefing, analysis history, resolve_alert
│   │       ├── analysis.ts         ← fetch_and_analyze, run_impact_chain, search_similar_context
│   │       ├── reports.ts          ← fetch_bctc_report, get_financial_summary, compare_reports, get_bctc_ai_summary, list_bctc_reports
│   │       ├── marketTools.ts      ← get_market_snapshot, get_patterns
│   │       ├── macroTools.ts       ← get_macro_snapshot (commodity + SBV rates)
│   │       ├── telegramTools.ts    ← send_test_telegram + send_market_broadcast (task 034, 162)
│   │       ├── summaryTools.ts     ← get_market_summary, generate_market_summary (task 130)
│   │       ├── systemTools.ts      ← get_system_health (WAL, alert stats, last cycle, db audit, sigma readiness)
│   │       ├── portfolioTools.ts   ← get_portfolio_conviction (task 149)
│   │       ├── feedbackTools.ts    ← submit_feedback, get_feedback (task 150)
│   │       ├── predictionTools.ts  ← get_prediction_markets (task 168)
│   │       ├── alertCheckTools.ts  ← trigger_alert_check (Sprint 022)
│   │       ├── priceHistoryTools.ts ← get_price_history (Sprint 023)
│   │       ├── positionTools.ts    ← set_position, get_positions, close_position (Sprint 023)
│   │       ├── portfolioRiskTool.ts ← get_portfolio_risk (Sprint 024)
│   │       ├── alertAccuracy.ts    ← get_alert_accuracy (Sprint 024)
│   │       ├── searchTools.ts      ← search_stocks (Sprint 024)
│   │       ├── dataFreshnessTools.ts ← get_data_freshness (Sprint 024)
│   │       ├── sectorRotationTools.ts ← get_sector_rotation (Sprint 025)
│   │       ├── earningsCalendarTools.ts ← get_earnings_calendar (Sprint 025)
│   │       ├── alertDigestTools.ts ← send_alert_digest (Sprint 025)
│   │       ├── correlationTools.ts ← get_correlation_matrix (Sprint 026)
│   │       ├── exportTools.ts      ← export_portfolio_snapshot (Sprint 026)
│   │       ├── performanceTools.ts ← get_performance_attribution (Sprint 026)
│   │       └── index.ts
│   └── scheduler/
│       └── index.ts                ← startScheduler() — registers all cron jobs
└── scheduler/
    ├── jobs.ts                     ← Cron job definitions (GMT+7)
    ├── morningBriefingJob.ts       ← 08:00 daily briefing (macro dashboard + conviction + unresolved alerts + prediction signals)
    ├── patternWatchJob.ts         ← Sunday 22:30 weekly pattern watch → Telegram (task 146)
    ├── newsPollerJob.ts            ← Legacy 30-min news poll (superseded by intelligenceCycleJob)
    ├── marketScanJob.ts            ← 09:00 + 15:30 market open/close scan
    ├── sscCheckerJob.ts            ← 20:00 SSC nightly BCTC check
    ├── eveningSummaryJob.ts        ← 22:00 evening summary
    ├── intelligenceCycleJob.ts     ← Every 15 min unified cycle: poll → SSC → prices → chain → Telegram (task 106)
    ├── predictionMarketJob.ts     ← Every 30 min: fetch Polymarket → store → detect signals → Telegram (task 167)
    ├── dataAuditJob.ts            ← Daily/weekly data integrity audit: orphan vectors, stale entries (task 157)
    ├── alertDigestJob.ts          ← 21:00 weekdays: assemble + send nightly alert digest via Telegram (Sprint 025)
    └── summaryJobs.ts              ← Daily/weekly/monthly/quarterly/yearly summary triggers (task 130)

mcp.config.json                     ← Central JSON config: server, data paths, scheduler, alerts, RAG, fetchers, predictionMarkets
bctc-schema.ts                      ← Complete BCTC data model + SQLite DDL (root level)
```

## Key data flow

```
News (5 sources) + SSC PDF → Fetcher → Parser → AnalysisEntry/FinancialReport
         ↓                                              ↓
  commodityTracker                        bctcValidator (accounting identity)
  (auto-extract prices                              ↓
   wheat/oil/gold/coffee              Embedding (multilingual-MiniLM)
   → tracked_indicators)                            ↓
         ↓                     LanceDB (vectors, temporal decay) + SQLite
         ↓                                          ↓
  macroStatsStore              RAG retrieval → sentimentClassifier → cascadeEngine
  (rolling mean/σ                                   ↓
   from history)           cascadeEngine + σ-based macro adjustments (50+ rules)
         ↓                                          ↓
         └──────────→  volatilityCalculator → adaptive thresholds → signalDetector
                                                    ↓
                  alertDedup / alertCooldown / alertGrouper → Alert if watchlist
                                                    ↓
                  tradeRelationships: "Middle East peace" → VNM 8% Iraq export
                  priceNewsValidator: tin bullish + giá giảm → ⚠️ thận trọng
                  sectorPeers: context prices → toàn ngành vs riêng lẻ
                                                    ↓
              HIGH/CRITICAL → Telegram (Vietnamese) + 📅 sensitive dates
                                                    ↓
              Morning briefing: macro dashboard + tracked commodities + warnings
```

## Tech stack

| Tool | Purpose |
|------|---------|
| Bun 1.x | Runtime + package manager (TypeScript native) |
| @modelcontextprotocol/sdk | MCP protocol, SSEServerTransport |
| better-sqlite3 | Persistent structured storage |
| lancedb | Local vector store for RAG |
| @huggingface/transformers | Local embeddings: paraphrase-multilingual-MiniLM-L12-v2 |
| cheerio + axios | HTML scraping (CafeF, SSC portal) |
| puppeteer-core | SSC portal automation for JS-rendered BCTC pages (task 031) |
| pdf-parse | Extract text from BCTC PDF reports |
| node-cron | Scheduled jobs (daily briefing, news polling) |
| zod | Tool input validation |
| Telegram Bot API | Push HIGH/CRITICAL alerts to a Telegram chat (task 034) |

## Scheduled Jobs (all times GMT+7 / Asia/Ho_Chi_Minh)

### Core cron jobs (`src/scheduler/jobs.ts`)

| Time | Job | Cron | What it does |
|------|-----|------|-------------|
| **Every 15 min** | `intelligenceCycle` | `*/15 * * * *` | **Main engine.** Market hours (09:00–15:30 M–F): full 5-step cycle (A→E). Off-hours: news poll only (step A). Concurrency guard with 14-min stale auto-release + 2-min per-step timeout. |
| **Every 30 min** | `predictionMarket` | `*/30 * * * *` | Fetch Polymarket markets → store → detect signals (volume spike, probability shift) → Telegram if HIGH |
| 08:00 M–F | `morningBriefing` | `0 8 * * 1-5` | Morning briefing: VN-Index + top stories + alerts + **macro dashboard (σ)** + **sensitive dates** + **tracked commodities** + **top 3 prediction signals** |
| 09:00 M–F | `marketOpen` | `0 9 * * 1-5` | Scan prices + **sector context** + **price-news divergence** + **volume anomaly detection** |
| 15:30 M–F | `marketClose` | `30 15 * * 1-5` | Same as open scan — close-of-day snapshot |
| 20:00 daily | `sscCheck` | `0 20 * * *` | Check SSC portal for new BCTC filings |
| 21:00 M–F | `alertDigest` | `0 21 * * 1-5` | Assemble nightly alert digest + send via Telegram (Sprint 025) |
| 22:00 M–F | `eveningSummary` | `0 22 * * 1-5` | Generate evening market summary |
| 22:30 Sunday | `patternWatch` | `30 22 * * 0` | Weekly pattern watch → Telegram push |
| 03:00 daily | `dataAuditDaily` | `0 3 * * *` | Data integrity audit: orphan vectors, stale analysis entries, DB row counts |
| 03:30 Sunday | `dataAuditWeekly` | `30 3 * * 0` | Deep weekly audit: LanceDB vs SQLite consistency, signal coverage gaps |

### Intelligence cycle steps (15-min tick)

| Step | What | When | Timeout |
|------|------|------|---------|
| A | `pollNews()` — fetch 5 sources + **auto-extract commodity prices** → `tracked_indicators` | Always | 2 min |
| A2 | `fetchMacro()` — Yahoo Finance (Brent/Gold/USD) + Vietcombank SBV → **σ history accumulation** | Always (24/7) | 2 min |
| B | `listSscDocuments()` — check SSC for each watchlist stock | Market hours only | 2 min |
| C | `fetchHosePrices()` — prices for watchlist + **sector context peers** | Market hours only | 2 min |
| D | `runImpactChain()` — cascade analysis with macro context + σ adjustments | Market hours only | 2 min |
| E | `sendAlerts()` — read unnotified HIGH/CRITICAL from DB → Telegram (Vietnamese) | Market hours only | 2 min |

### Periodic summary jobs (`src/scheduler/summaryJobs.ts`)

| Schedule | Job | Cron |
|----------|-----|------|
| 22:30 daily | Daily summary | `30 22 * * *` |
| 23:00 Sunday | Weekly summary | `0 23 * * 0` |
| 00:30 1st of month | Monthly summary | `30 0 1 * *` |
| 01:00 Jan/Apr/Jul/Oct 1st | Quarterly summary | `0 1 1 1,4,7,10 *` |
| 02:00 Jan 2nd | Yearly summary | `0 2 2 1 *` |

### Data sources & fallback chain

| Source | Primary | Fallback 1 | Fallback 2 | Status |
|--------|---------|-----------|-----------|--------|
| **VN-Index** | `api-finfo.vndirect.com.vn/v4/vnmarket_prices` | — | — | ✅ |
| **HOSE stocks** | VnDirect legacy `/v4/stocks` (5s) | VnDirect `stock_prices` (10s) | CafeF banggia (10s) | ✅ 3-tier |
| **HNX stocks** | HNX API `api.hnx.vn` (15s) | VnDirect `stock_prices` (10s) | — | ✅ 2-tier |
| **UPCOM stocks** | HNX API type=upcom (15s) | VnDirect `stock_prices` (10s) | — | ✅ 2-tier |
| **CafeF news** | `cafef.vn/rss` | — | — | ✅ Browser UA |
| **VnExpress** | `vnexpress.net/rss` | — | — | ✅ Browser UA |
| **VnEconomy** | `vneconomy.vn/rss` (2 feeds) | — | — | ✅ Browser UA |
| **Google News** | `news.google.com/rss` (redirect-follow) | Secondary feed | — | ✅ |
| **Yahoo Finance** | `query1.finance.yahoo.com` | — | — | ✅ Commodities |
| **Vietcombank FX** | `portal.vietcombank.com.vn` XML | — | — | ✅ USD/VND |
| **TE Indicators** | `tradingeconomics.com/vietnam/indicators` scrape | — | — | ✅ CPI/GDP |
| **TE News Stream** | `tradingeconomics.com/ws/stream.ashx` JSON | — | — | ✅ Global macro news (country, category, importance 1-3) |
| **SSC portal** | Puppeteer automation | — | — | ✅ BCTC PDFs |
| **Polymarket** | `gamma-api.polymarket.com` REST | — | — | ✅ Prediction markets (task 164) |

## Development

```bash
bun install           # install dependencies
bun --watch src/index.ts   # dev with hot reload
./start.sh            # production (suppresses LanceDB TRACE, rotates logs)

# Server endpoints
GET  http://localhost:3000/sse               ← Claude connects here
POST http://localhost:3000/messages?sessionId=<id>
GET  http://localhost:3000/health
```

## Claude Desktop config

```json
{
  "mcpServers": {
    "vn-market": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

## mcp.config.json — central configuration

`mcp.config.json` (root level) is the single source of truth for all tuneable parameters.
Environment variables in `.env` override individual fields at runtime.

Key sections:

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
| `fetchers` | Per-source URLs, Puppeteer paths, timeouts |
| `fetchLimits` | News-per-source caps for market-hours / off-hours / manual runs |
| `cycle` | Intelligence cycle warn threshold, off-hours interval, max concurrent |
| `predictionMarkets` | Polymarket API URL, volume threshold, probability shift %, min unique wallets |

## Dev Team & Workflow

See `.claude/WORKFLOW.md` for the complete auto-running engine description.

### Methodology
- **AI Native SDLC**: full agent chain (PO → BA → Architect → PM → Developer → QA → Fixer)
- **Agile/Kanban**: `TASKS.md` is the Kanban board — Backlog → Todo → In Progress → Review → Done
- **WIP limit**: max 2 tasks In Progress simultaneously
- **TDD**: every task starts with a failing test in `src/__tests__/NNN-*.test.ts`
- **DDD**: strict layering — domain never imports infrastructure
- **Reports**: `reports/TASK_REPORT_NNN.md` generated by QA after every review

### Start working on a task (Developer)

```bash
# 1. Confirm task is In Progress in TASKS.md
git checkout task/NNN-branch-name

# 2. Write failing test first (TDD Red)
bun test src/__tests__/NNN-*.test.ts   # must FAIL

# 3. Implement (TDD Green)
bun test src/__tests__/NNN-*.test.ts   # must PASS

# 4. Refactor + full suite
bun test && bun tsc --noEmit

# 5. Commit + notify QA
```

### Git setup (first time)

```bash
bash setup-git.sh   # creates initial commit + all task branches
```

### Output artifacts

```
docs/REQ_NNN.md          ← BA: Requirement Spec
docs/TECH_NNN.md         ← Architect: Technical Design
reports/TASK_REPORT_NNN.md ← QA: per-task review
reports/SPRINT_REPORT_NNN.md ← QA: sprint summary
SPRINT_GOAL.md           ← PO: current sprint vision
```

### DDD folder structure (implemented)

The DDD structure is fully in place. See Architecture summary above for the complete layout.

```
src/
├── domain/           ← Pure business logic (no I/O) — tasks 041-066, 014
├── infrastructure/   ← Adapters: SQLite, LanceDB, HTTP fetchers — tasks 002, 003, 011-013, 021-030
├── application/      ← Use cases (orchestration) — tasks 047, 048, 101-105
└── interface/        ← MCP tools, scheduler (entry points) — tasks 081-088, 101-105
```

---

## Current implementation status

### Done (95+ tasks, Sprint 000-026) ✓

**Foundation (Sprint 000)**
- `src/infrastructure/db/schema.ts` — SQLite schema init (all tables)
- `src/infrastructure/config.ts` — Env config
- `src/infrastructure/logger.ts` — Structured logging
- `src/infrastructure/rag/embeddings.ts` — HuggingFace multilingual-MiniLM (local ONNX)
- `src/infrastructure/rag/vectorstore.ts` — LanceDB vector store
- `src/infrastructure/rag/retriever.ts` — Multi-level RAG search
- `src/domain/services/vnNumberParser.ts` — Vietnamese number parser
- `src/domain/services/balanceSheetExtractor.ts` — BCTC balance sheet
- `src/domain/services/embeddingTextBuilder.ts` — RAG text builder

**BCTC Pipeline (Sprint 001-002)**
- `src/domain/services/incomeStatementExtractor.ts` — income statement
- `src/domain/services/cashFlowExtractor.ts` — cash flow
- `src/domain/services/ratioComputer.ts` — 22 financial ratios
- `src/domain/services/periodDeltaComputer.ts` — QoQ / YoY deltas
- `src/infrastructure/fetchers/ssc.ts` — SSC portal scraper
- `src/infrastructure/fetchers/pdf.ts` — PDF downloader + text extractor
- `src/application/usecases/fetchParseAndStoreBctc.ts` — SSC fetch → parse → store pipeline (task 048)
- `src/interface/mcp/tools/reports.ts` — `fetch_bctc_report`, `get_financial_summary`, `compare_reports` (task 085)

**News + Alerts (Sprint 003-004)**
- `src/infrastructure/fetchers/cafef.ts`, `vnexpress.ts`, `reuters.ts` — 3 RSS news sources
- `src/domain/services/newsNormalizer.ts` — RSS item → AnalysisEntry
- `src/domain/services/cascadeEngine.ts` — causal chain (global → stock)
- `src/domain/services/signalDetector.ts` — price/news/report signals
- `src/domain/services/alertGenerator.ts` — multi-signal alert generator
- `src/interface/mcp/tools/watchlist.ts` — 4 watchlist MCP tools
- `src/interface/mcp/tools/alerts.ts` — 3 alert MCP tools
- `src/interface/mcp/tools/analysis.ts` — 3 analysis MCP tools
- `src/interface/mcp/server.ts` — McpServer factory + SSEServerTransport (16 tools registered)

**Market Data + Scheduler (Sprint 005)**
- `src/infrastructure/fetchers/hose.ts` — HOSE prices (VnDirect + CafeF fallback)
- `src/scheduler/newsPollerJob.ts` — every 30 min news poll with dedup
- `src/scheduler/sscCheckerJob.ts` — 20:00 SSC nightly check with retry
- `src/scheduler/marketScanJob.ts` — 09:00 + 15:30 market open/close scan
- `src/scheduler/morningBriefingJob.ts` — 08:00 daily briefing

**Analytical Depth (Sprint 006)**
- `src/application/usecases/getPatternSummary.ts` — historical pattern matcher (task 065)
- `src/application/usecases/generateAiSummary.ts` — rule-based BCTC plain-language summary (task 066)
- `src/infrastructure/fetchers/hnx.ts` — HNX + UPCOM prices (task 027)
- `src/scheduler/eveningSummaryJob.ts` — 22:00 evening summary (task 105)
- `src/interface/mcp/tools/marketTools.ts` — `get_market_snapshot`, `get_patterns` (task 084)
- 28-test MCP integration harness covering all 16 tools (task 123)

**SSC Automation + Telegram + Intelligence Cycle (Sprint 009)**
- `src/infrastructure/fetchers/ssc.ts` — upgraded to Puppeteer automation for JS-rendered SSC portal (task 031)
- `src/infrastructure/notifiers/telegram.ts` — Telegram Bot API notifier, never-throw, Bun.fetch (task 034)
- `src/interface/mcp/tools/telegramTools.ts` — `send_test_telegram` MCP tool (task 034)
- `src/scheduler/intelligenceCycleJob.ts` — unified 15-min cycle: poll → SSC → prices → chain → Telegram (task 106)
- `mcp.config.json` — central JSON config (server, paths, scheduler, alerts, RAG, adaptive thresholds)

**Security + Alert Quality + BCTC Validation (Sprint 010)**
- SQL injection fix — parameterised queries across all SQLite helpers (security patch)
- `src/domain/services/alertCooldown.ts` — suppress same-stock/signal within cooldown window (task 131)
- `src/domain/services/alertDedup.ts` — djb2 fingerprint deduplication within 60-min window (task 131)
- `src/domain/services/alertGrouper.ts` — cluster overlapping alerts into grouped notifications (task 131)
- `src/domain/services/bctcValidator.ts` — accounting identity, magnitude, and confidence checks (task 132)

**Adaptive Thresholds + Sentiment + RAG Temporal Decay (Sprint 011)**
- `src/domain/services/volatilityCalculator.ts` — per-stock stdDev → adaptive ±sigma thresholds (task 133)
- `src/domain/services/sentimentClassifier.ts` — rule-based bullish/bearish/neutral, Vi + EN, negation-aware (task 134)
- `src/infrastructure/rag/retriever.ts` — RAG temporal decay: recency boost via configurable half-life (task 135)
- `src/infrastructure/fetchers/vneconomy.ts` — VnEconomy stocks + finance RSS feeds (task 035)

**Periodic Summaries (Sprint 012)**
- `src/application/usecases/generatePeriodicSummary.ts` — daily/weekly/monthly/quarterly/yearly rule-based summaries stored in SQLite (task 130)
- `src/scheduler/summaryJobs.ts` — cron triggers: 22:30 daily, Sunday 23:00, monthly, quarterly, yearly (task 130)
- `src/interface/mcp/tools/summaryTools.ts` — `get_market_summary`, `generate_market_summary` MCP tools (task 130)
- `src/interface/mcp/server.ts` — updated to 20 registered tools

**Fetcher Reliability + Sector Context + Telegram Vietnamese (Sprint 013)**
- `src/infrastructure/fetchers/hose.ts` — 3-tier fallback: VnDirect legacy → `api-finfo.vndirect.com.vn/v4/stock_prices` → CafeF banggia. New `fetchVnIndex()` via `vnmarket_prices` endpoint
- `src/infrastructure/fetchers/hnx.ts` — VnDirect `stock_prices` fallback when HNX native API is down (works for HNX+UPCOM)
- `src/infrastructure/fetchers/reuters.ts` — `maxRedirects: 5` to follow Google News 302 redirects
- `src/infrastructure/fetchers/cafef.ts`, `vnexpress.ts`, `vneconomy.ts` — browser User-Agent (avoids 503 blocks)
- `src/scheduler/intelligenceCycleJob.ts` — stale guard auto-release after 14 min + per-step 2-min timeout (prevents permanent hangs)
- `src/interface/mcp/tools/marketTools.ts` — `force: true` on user-initiated MCP calls (data available after market hours)
- `src/domain/services/sectorPeers.ts` — sector peer mapping (DomainType → top stocks), auto context stocks, sector-wide vs stock-specific classification
- `src/application/usecases/scanMarket.ts` — fetches sector context prices, computes sector average, enriches alerts with "toàn ngành" vs "riêng lẻ"
- `src/application/usecases/pollNews.ts` — signal deduplication: merges N× `news_mention` for same stock into single signal with top headlines
- `src/infrastructure/notifiers/telegram.ts` — full Vietnamese format, plain text (no Markdown errors), severity labels (NGHIÊM TRỌNG/QUAN TRỌNG/LƯU Ý), real data in messages
- `src/infrastructure/fetchers/tradingEconomicsStream.ts` — Trading Economics global news stream (`/ws/stream.ashx`), Level 1-2 cascade input with country/category/importance metadata
- `src/application/usecases/pollNews.ts` — now fetches **5 sources** in parallel (added TE stream as 5th source)
- `bctc-schema.ts` — added `automotive` DomainType (VEA/VEAM — Honda/Toyota/Ford JV)
- `src/domain/services/macroThresholds.ts` — σ-based thresholds (z-score classification: normal/elevated/high/extreme) replaces hardcoded $100/bbl etc.
- `src/infrastructure/db/macroStatsStore.ts` — reads commodity_prices_history + sbv_rates_history, computes rolling mean/σ for each indicator
- `src/domain/services/cascadeEngine.ts` — `applyDynamicMacroAdjustments()` uses σ instead of fixed thresholds; expanded to **50+ SECTOR_RULES** (Fed, DXY, US-China, geopolitics, FDI, bonds, EV, pharma, insurance, energy transition)
- `src/domain/services/priceNewsValidator.ts` — cross-validates news sentiment vs price action ("tin bullish + giá giảm → thận trọng"); volume anomaly detection; sensitive date calendar (đáo hạn phái sinh, mùa BCTC, FOMC, Tết, window dressing)
- `src/infrastructure/db/commodityTracker.ts` — auto-extracts commodity prices from news text (regex patterns for 20+ commodities: oil, gold, wheat, coffee, copper, rice, rubber, indices, CPI, GDP, interest rates) → `tracked_indicators` table auto-expands
- `src/application/usecases/pollNews.ts` — wired commodity auto-extraction on every poll cycle
- `src/application/usecases/scanMarket.ts` — wired price-news divergence validator + volume anomaly detection into signal pipeline
- `src/application/usecases/runImpactChain.ts` — wired σ-based macro stats into cascade engine
- `src/application/usecases/assembleBriefing.ts` — enhanced with macro dashboard (σ status), sensitive date warnings, auto-tracked commodities list

**Trade Relationships (Sprint 014)**
- `src/domain/services/tradeRelationships.ts` — stock-level trade map: export destinations, import sources, JV partners, revenue exposure %
- `src/infrastructure/db/tradeStore.ts` — trade exposure SQLite CRUD + auto-learn from news text

**Alert Pipeline Fix + VN-Index Feed + WAL + Circuit Breaker + System Health (Sprint 014)**
- `src/scheduler/intelligenceCycleJob.ts` — Step E now reads DB alerts with `notified_telegram = 0` and marks them after send (task 137)
- `src/application/usecases/runImpactChain.ts` — Step D now calls real `runImpactChain` instead of placeholder (task 138)
- `src/infrastructure/fetchers/hose.ts` — `fetchVnIndex()` via CafeF index endpoint (task 139)
- `src/infrastructure/db/checkpoint.ts` — SQLite WAL checkpoint helper; daily cron + SIGTERM hook (task 140)
- `src/infrastructure/fetchers/hose.ts`, `ssc.ts` — wired circuit breaker pattern to prevent cascade failures on source outages (task 136)
- `src/interface/mcp/tools/systemTools.ts` — `get_system_health` enhanced with WAL size, alert stats, last cycle result (task 141)

**Conviction Scorer (Sprint 015)**
- `src/domain/services/convictionScorer.ts` — 5-dimension cross-signal conviction score (price, volume, sentiment, cascade, sector) (task 142)
- `src/infrastructure/notifiers/telegram.ts` — sector peer context + conviction score wired into alert body (task 143)
- `src/application/usecases/assembleBriefing.ts` — historical parallel context in Telegram alert body (task 144)
- `src/scheduler/morningBriefingJob.ts` — upgraded with conviction scores + unresolved alerts section (task 145)
- `src/scheduler/patternWatchJob.ts` — Sunday 22:30 proactive weekly pattern watch → Telegram push (task 146)

**The Analyst's Dashboard (Sprint 016)**
- `src/scheduler/morningBriefingJob.ts` — Telegram delivery of morning briefing (task 147)
- `src/infrastructure/db/alertStore.ts` — alert resolution lifecycle; `resolve_alert` added to `alerts.ts` (task 148)
- `src/interface/mcp/tools/portfolioTools.ts` — `get_portfolio_conviction` MCP tool (task 149)
- `src/interface/mcp/tools/feedbackTools.ts` — `submit_feedback`, `get_feedback` MCP tools + conviction_history table (task 150)
- `src/interface/mcp/tools/systemTools.ts` — sigma data sufficiency health check section (task 151)
- `src/interface/mcp/server.ts` — updated to 31 registered tools

**Production Hardening (Sprint 017)**
- `src/domain/services/signalDetector.ts` — news-mention alert noise filter (min headline count threshold) (task 152)
- `src/application/usecases/checkSscReports.ts` — SSC scan deduplication: skip already-processed document IDs (task 153)
- `src/infrastructure/logger.ts` — LanceDB TRACE log suppression + size-based log file rotation (tasks 154, 155)
- `src/scheduler/intelligenceCycleJob.ts` — off-hours cycle interval increased to 60 min to reduce noise (task 156)

**Data Integrity First (Sprint 018)**
- `src/scheduler/dataAuditJob.ts` — daily/weekly data audit: orphan vectors, stale analysis entries, DB/RAG row counts (task 157)
- `src/scheduler/jobs.ts` — `CRONS.dataAuditDaily` + `CRONS.dataAuditWeekly` registered (task 158)
- `src/interface/mcp/tools/systemTools.ts` — `get_system_health` db_audit section: `audit_state` reads + live `agent_feedback` counts (task 159)

**Stock Aliases + Market Broadcast (Sprint 019)**
- `src/domain/services/stockAliases.ts` — company name alias dictionary (34 tests) (task 160)
- `src/domain/services/cascadeEngine.ts` + `src/application/usecases/pollNews.ts` — alias wiring: resolve company names to stock codes in Gate 3 (task 161)
- `src/interface/mcp/tools/telegramTools.ts` — `send_market_broadcast` MCP tool: market-wide pattern cascade to all watchlist stocks (task 162)

**Prediction Market Intelligence (Sprint 020)**
- `src/infrastructure/db/schema.ts` — `prediction_markets` + `prediction_signals` SQLite tables (task 163)
- `src/infrastructure/fetchers/polymarket.ts` — Polymarket REST fetcher with circuit breaker (task 164)
- `src/domain/services/predictionCascadeMapper.ts` — map Polymarket markets to VN stock sectors/codes (38 tests) (task 165)
- `src/domain/services/predictionSignalDetector.ts` — type definitions + `PredictionSignalConfig` interface (task 166 stub)
- `src/scheduler/predictionMarketJob.ts` — every 30 min: fetch → store → detect → Telegram if HIGH (task 167)
- `src/interface/mcp/tools/predictionTools.ts` — `get_prediction_markets` MCP tool (task 168)
- `src/infrastructure/config.ts` — `PredictionMarketsConfig` interface + `mcp.config.json` predictionMarkets section (task 169)

**Close the Loop — Prediction Signals Live (Sprint 021)**
- `src/domain/services/predictionSignalDetector.ts` — full `detectPredictionSignals` implementation: volume_spike + probability_shift (20+ tests) (task 171)
- `src/infrastructure/db/predictionStore.ts` — prediction_markets + prediction_signals table helpers (task 172)
- `src/application/usecases/assembleBriefing.ts` — top 3 HIGH/CRITICAL prediction signals section in morning briefing (task 172)
- `src/application/usecases/runPredictionImpactChain.ts` — wire prediction signals into `buildCausalChain` cascade (task 173)

**Alert Check Trigger (Sprint 022)**
- `src/interface/mcp/tools/alertCheckTools.ts` — `trigger_alert_check` MCP tool: on-demand signal re-evaluation for watchlist

**Position Tracking + Price History (Sprint 023)**
- `src/infrastructure/db/positionStore.ts` — position CRUD: set/get/close positions with entry price, size, notes
- `src/domain/services/decisionNoteSynthesizer.ts` — synthesizes entry/exit/hold action notes from signals
- `src/domain/services/sparkline.ts` — ASCII sparkline renderer for price history charts
- `src/interface/mcp/tools/priceHistoryTools.ts` — `get_price_history` MCP tool with sparkline output
- `src/interface/mcp/tools/positionTools.ts` — `set_position`, `get_positions`, `close_position` MCP tools

**Portfolio Risk + Alert Accuracy + Stock Search + Data Freshness (Sprint 024)**
- `src/domain/services/portfolioRiskCalculator.ts` — VaR (95%/99%) + max-drawdown per position and portfolio
- `src/interface/mcp/tools/portfolioRiskTool.ts` — `get_portfolio_risk` MCP tool
- `src/interface/mcp/tools/alertAccuracy.ts` — `get_alert_accuracy`: retrospective signal vs price outcome
- `src/domain/services/stockSearch.ts` — 50-stock catalogue with fuzzy name + code search
- `src/interface/mcp/tools/searchTools.ts` — `search_stocks` MCP tool
- `src/interface/mcp/tools/dataFreshnessTools.ts` — `get_data_freshness`: per-source staleness report

**Sector Rotation + Earnings Calendar + Alert Digest (Sprint 025)**
- `src/domain/services/sectorRotationDetector.ts` — sector rotation: momentum + relative strength vs VN-Index
- `src/interface/mcp/tools/sectorRotationTools.ts` — `get_sector_rotation` MCP tool
- `src/domain/services/earningsCalendar.ts` — BCTC deadline calendar: Q1-Q4 Vietnamese filing deadlines
- `src/interface/mcp/tools/earningsCalendarTools.ts` — `get_earnings_calendar` MCP tool
- `src/application/usecases/assembleAlertDigest.ts` — nightly digest assembly with alert grouping by sector
- `src/scheduler/alertDigestJob.ts` — 21:00 weekdays cron: assemble + send alert digest via Telegram
- `src/interface/mcp/tools/alertDigestTools.ts` — `send_alert_digest` MCP tool for on-demand digest

**Correlation + Export + Performance Attribution (Sprint 026)**
- `src/domain/services/correlationCalculator.ts` — Pearson correlation matrix across watchlist price history
- `src/interface/mcp/tools/correlationTools.ts` — `get_correlation_matrix` MCP tool
- `src/application/usecases/exportPortfolioSnapshot.ts` — JSON export: positions + P&L + signals + risk metrics
- `src/interface/mcp/tools/exportTools.ts` — `export_portfolio_snapshot` MCP tool
- `src/domain/services/performanceAttribution.ts` — signal P&L attribution: which alert types generated gains
- `src/interface/mcp/tools/performanceTools.ts` — `get_performance_attribution` MCP tool
- `src/interface/mcp/server.ts` — updated to 46 registered tools

### In Progress

None.

### Deferred (Sprint 008+ backlog)
- E2E test — daily briefing flow (task 125, after 024)

## Data model references

- **AnalysisEntry** (RAG): 4-level hierarchy (global/country/domain/action), 384-dim embedding, causal links
- **FinancialReport** (BCTC): full Vietnamese BCTC — BalanceSheet + IncomeStatement + CashFlow + 22 computed ratios + QoQ/YoY deltas + chart series → see `bctc-schema.ts`
- **WatchlistAction**: stock code, exchange, domain, configurable alert thresholds
- **Alert**: multi-signal trigger, severity, affected stocks with direction + confidence

## Key Vietnamese financial terms

| Vietnamese | English |
|-----------|---------|
| Báo cáo tài chính (BCTC) | Financial report |
| Bảng cân đối kế toán | Balance sheet |
| Báo cáo KQHĐKD | Income statement |
| Báo cáo lưu chuyển tiền | Cash flow statement |
| Doanh thu thuần | Net revenue |
| Lợi nhuận sau thuế | Net profit after tax |
| Vốn chủ sở hữu | Equity |
| Quý (Q1/Q2/Q3/Q4) | Quarter |
| VN-Index | Vietnamese main stock index (HOSE) |

## dev workflow
full SDLC — Run the agent chain (PO → BA → Architect → PM → Dev → QA) for a proper spec