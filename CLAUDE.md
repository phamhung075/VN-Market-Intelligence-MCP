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
│       └── volatilityCalculator.ts ← Historical volatility → adaptive signal thresholds (task 133)
├── infrastructure/
│   ├── config.ts                   ← Env config (dotenv + mcp.config.json)
│   ├── logger.ts                   ← Structured logger
│   ├── db/
│   │   ├── schema.ts               ← SQLite init (all tables + indexes)
│   │   ├── alertStore.ts           ← Alert read/write helpers
│   │   └── index.ts
│   ├── fetchers/
│   │   ├── rss.ts                  ← RSS base fetcher
│   │   ├── cafef.ts                ← CafeF news (Vietnamese)
│   │   ├── vnexpress.ts            ← VnExpress Finance RSS
│   │   ├── vneconomy.ts            ← VnEconomy stocks + finance RSS feeds (task 035)
│   │   ├── reuters.ts              ← Reuters / AP News RSS
│   │   ├── hose.ts                 ← HOSE prices (VnDirect API + CafeF fallback)
│   │   ├── hnx.ts                  ← HNX + UPCOM prices
│   │   ├── ssc.ts                  ← SSC portal scraper — Puppeteer automation (task 031)
│   │   ├── pdf.ts                  ← PDF downloader + pdf-parse text extractor
│   │   └── index.ts
│   ├── notifiers/
│   │   ├── telegram.ts             ← Telegram Bot API notifier — never throws, uses Bun.fetch (task 034)
│   │   └── index.ts
│   └── rag/
│       ├── embeddings.ts           ← HuggingFace multilingual-MiniLM (local ONNX)
│       ├── vectorstore.ts          ← LanceDB read/write/search
│       ├── retriever.ts            ← Multi-level RAG search with temporal decay (task 135)
│       └── index.ts
├── application/
│   └── usecases/
│       ├── assembleBriefing.ts     ← Morning briefing assembly
│       ├── assembleEveningSummary.ts ← Evening summary assembly
│       ├── checkSscReports.ts      ← SSC nightly BCTC document check
│       ├── fetchParseAndStoreBctc.ts ← SSC fetch → parse → store pipeline
│       ├── generateAiSummary.ts    ← Rule-based plain-language BCTC summary
│       ├── generatePeriodicSummary.ts ← Daily/weekly/monthly/quarterly/yearly summaries (task 130)
│       ├── getPatternSummary.ts    ← Historical pattern detection
│       ├── parseBctcReport.ts      ← BCTC PDF text → FinancialReport
│       ├── pollNews.ts             ← RSS poll → embed → alert
│       ├── runImpactChain.ts       ← Causal chain orchestrator
│       ├── scanMarket.ts           ← Market open/close price scan
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
    ├── morningBriefingJob.ts       ← 08:00 daily briefing
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
News/SSC PDF → Fetcher → Parser → AnalysisEntry/FinancialReport
                                        ↓
                    bctcValidator (accounting identity check)
                                        ↓
                              Embedding (multilingual-MiniLM)
                                        ↓
                    LanceDB (vectors, temporal decay) + SQLite (structured)
                                        ↓
              RAG retrieval → sentimentClassifier → Impact chain analysis
                                        ↓
            volatilityCalculator → adaptive thresholds → signalDetector
                                        ↓
          alertDedup / alertCooldown / alertGrouper → Alert if watchlist impacted
                                        ↓
              HIGH/CRITICAL → Telegram notifier  +  periodic summaries
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

## Development

```bash
bun install           # install dependencies
bun --watch src/index.ts   # dev with hot reload
bun run src/index.ts  # production

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

### In Progress (Sprint 013)
- Circuit breaker pattern for fetchers — prevents cascade failures on source outages (task 136)
- System health MCP tool — `get_system_health` exposing job status, DB size, RAG size (planned: `src/interface/mcp/tools/systemTools.ts`)

### Deferred (Sprint 008+ backlog)
- `src/infrastructure/fetchers/yahooFinance.ts` — Brent crude, gold, USD/VND (task 025)
- `src/infrastructure/fetchers/sbv.ts` — SBV central bank rates + FX (task 028)
- `src/infrastructure/fetchers/tradingEconomics.ts` — CPI, GDP, interest rate (task 024)
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
