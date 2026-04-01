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
│       └── tradeRelationships.ts ← Stock-level trade map: export destinations, import sources, JV partners, revenue %
├── infrastructure/
│   ├── config.ts                   ← Env config (dotenv + mcp.config.json)
│   ├── logger.ts                   ← Structured logger
│   ├── db/
│   │   ├── schema.ts               ← SQLite init (all tables + indexes)
│   │   ├── alertStore.ts           ← Alert read/write helpers
│   │   ├── macroStatsStore.ts      ← Rolling mean/σ from commodity_prices_history + sbv_rates_history
│   │   ├── commodityTracker.ts     ← Auto-extract & store commodity prices from news text (tracked_indicators table)
│   │   ├── tradeStore.ts          ← Trade exposure SQLite CRUD + auto-learn from news
│   │   └── index.ts
│   ├── fetchers/
│   │   ├── rss.ts                  ← RSS base fetcher
│   │   ├── cafef.ts                ← CafeF news (Vietnamese)
│   │   ├── vnexpress.ts            ← VnExpress Finance RSS
│   │   ├── vneconomy.ts            ← VnEconomy stocks + finance RSS feeds (task 035)
│   │   ├── reuters.ts              ← Reuters / AP News RSS (Google News)
│   │   ├── tradingEconomicsStream.ts ← TE global macro news stream (Level 1-2 cascade input)
│   │   ├── hose.ts                 ← HOSE prices (3-tier: VnDirect legacy → stock_prices → CafeF) + fetchVnIndex()
│   │   ├── hnx.ts                  ← HNX + UPCOM prices (HNX API → VnDirect stock_prices fallback)
│   │   ├── ssc.ts                  ← SSC portal scraper — Puppeteer automation (task 031)
│   │   ├── pdf.ts                  ← PDF downloader + pdf-parse text extractor
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
│       ├── assembleBriefing.ts     ← Morning briefing + macro dashboard + sensitive dates + commodity tracker
│       ├── assembleEveningSummary.ts ← Evening summary assembly
│       ├── checkSscReports.ts      ← SSC nightly BCTC document check
│       ├── fetchParseAndStoreBctc.ts ← SSC fetch → parse → store pipeline
│       ├── generateAiSummary.ts    ← Rule-based plain-language BCTC summary
│       ├── generatePeriodicSummary.ts ← Daily/weekly/monthly/quarterly/yearly summaries (task 130)
│       ├── getPatternSummary.ts    ← Historical pattern detection
│       ├── parseBctcReport.ts      ← BCTC PDF text → FinancialReport
│       ├── pollNews.ts             ← 5-source poll (RSS + TE stream) → embed → alert
│       ├── runImpactChain.ts       ← Causal chain orchestrator
│       ├── scanMarket.ts           ← Market scan + sector context comparison (toàn ngành vs riêng lẻ)
│       └── index.ts
├── interface/
│   ├── mcp/
│   │   ├── server.ts               ← McpServer factory, registers all 20 tools
│   │   ├── transport.ts            ← SSEServerTransport setup
│   │   └── tools/
│   │       ├── watchlist.ts        ← add/remove/get/update watchlist MCP tools
│   │       ├── alerts.ts           ← get_alerts, run_daily_briefing, analysis history
│   │       ├── analysis.ts         ← fetch_and_analyze, run_impact_chain, search_similar_context
│   │       ├── reports.ts          ← fetch_bctc_report, get_financial_summary, compare_reports
│   │       ├── marketTools.ts      ← get_market_snapshot, get_patterns
│   │       ├── macroTools.ts       ← get_macro_snapshot (commodity + SBV rates)
│   │       ├── telegramTools.ts    ← send_test_telegram connectivity check (task 034)
│   │       ├── summaryTools.ts     ← get_market_summary, generate_market_summary (task 130)
│   │       └── index.ts
│   └── scheduler/
│       └── index.ts                ← startScheduler() — registers all cron jobs
└── scheduler/
    ├── jobs.ts                     ← Cron job definitions (GMT+7)
    ├── morningBriefingJob.ts       ← 08:00 daily briefing (macro dashboard + conviction + unresolved alerts)
    ├── patternWatchJob.ts         ← Sunday 22:30 weekly pattern watch → Telegram
    ├── newsPollerJob.ts            ← Legacy 30-min news poll (superseded by intelligenceCycleJob)
    ├── marketScanJob.ts            ← 09:00 + 15:30 market open/close scan
    ├── sscCheckerJob.ts            ← 20:00 SSC nightly BCTC check
    ├── eveningSummaryJob.ts        ← 22:00 evening summary
    ├── intelligenceCycleJob.ts     ← Every 15 min unified cycle: poll → SSC → prices → chain → Telegram (task 106)
    └── summaryJobs.ts              ← Daily/weekly/monthly/quarterly/yearly summary triggers (task 130)

mcp.config.json                     ← Central JSON config: server, data paths, scheduler, alerts, RAG, fetchers
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
| 08:00 M–F | `morningBriefing` | `0 8 * * 1-5` | Morning briefing: VN-Index + top stories + alerts + **macro dashboard (σ)** + **sensitive dates** + **tracked commodities** |
| 09:00 M–F | `marketOpen` | `0 9 * * 1-5` | Scan prices + **sector context** + **price-news divergence** + **volume anomaly detection** |
| 15:30 M–F | `marketClose` | `30 15 * * 1-5` | Same as open scan — close-of-day snapshot |
| 20:00 daily | `sscCheck` | `0 20 * * *` | Check SSC portal for new BCTC filings |
| 22:00 M–F | `eveningSummary` | `0 22 * * 1-5` | Generate evening market summary |

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

### Done (60+ tasks, Sprint 000-012) ✓

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

### In Progress
- Circuit breaker pattern for fetchers — prevents cascade failures on source outages (task 136)
- System health MCP tool — `get_system_health` exposing job status, DB size, RAG size (planned: `src/interface/mcp/tools/systemTools.ts`)

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
