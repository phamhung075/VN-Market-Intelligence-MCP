# VN Market Intelligence MCP — Claude Project Context

## What this project is

A MCP (Model Context Protocol) server built in TypeScript running on Bun. It gives Claude real-time intelligence on the Vietnamese stock market (HOSE / HNX / UPCOM) by:

- Fetching and analyzing Vietnamese + global news via causal chain (global → country → sector → stock)
- Extracting and analyzing financial reports (BCTC) from congbothongtin.ssc.gov.vn
- Maintaining a RAG memory of past analyses using local embeddings (multilingual-MiniLM)
- Managing a user's stock watchlist and generating multi-signal alerts
- Running a daily scheduled briefing at market open/close

## Architecture summary

```
src/
├── index.ts          ← Bun HTTP server + MCP SSE transport (entry point)
├── server.ts         ← McpServer factory, registers all tools
├── tools/
│   ├── watchlist.ts  ← add/remove/get watchlist, update thresholds
│   ├── analysis.ts   ← fetch_and_analyze, run_impact_chain, RAG search
│   ├── reports.ts    ← SSC BCTC scraping + financial summary/compare
│   └── alerts.ts     ← get_alerts, daily briefing, analysis history
├── db/
│   └── schema.ts     ← SQLite init (watchlist, alerts, rag_analyses, financial_reports)
└── scheduler/
    └── jobs.ts       ← node-cron jobs (GMT+7 timezone)

bctc-schema.ts        ← Complete BCTC data model + SQLite DDL (root level)
```

## Key data flow

```
News/SSC PDF → Fetcher → Parser → AnalysisEntry/FinancialReport
                                        ↓
                              Embedding (multilingual-MiniLM)
                                        ↓
                    LanceDB (vectors) + SQLite (structured)
                                        ↓
                        RAG retrieval → Impact chain analysis
                                        ↓
                              Alert if watchlist impacted
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
| pdf-parse | Extract text from BCTC PDF reports |
| node-cron | Scheduled jobs (daily briefing, news polling) |
| zod | Tool input validation |

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

## Dev Team & Workflow

### Roles (in `.claude/agents/`)

| Agent | File | Responsibility |
|-------|------|----------------|
| **Planner** | `planner.md` | Breaks features into tasks, manages Kanban, enforces DDD dependencies |
| **Coder** | `coder.md` | Implements tasks with TDD (Red-Green-Refactor), follows DDD layering |
| **Reviewer** | `reviewer.md` | Reviews branches, runs tests, enforces standards, generates Task Reports |
| **Fixer** | `fixer.md` | Fixes bugs, change requests, type errors, broken scrapers |

### Methodology
- **Agile/Kanban**: `TASKS.md` is the board — Backlog → Todo → In Progress → Review → Done
- **WIP limit**: max 2 tasks In Progress simultaneously
- **TDD**: every task starts with a failing test in `src/__tests__/NNN-*.test.ts`
- **DDD**: strict layering — domain never imports infrastructure
- **Reports**: `reports/TASK_REPORT_NNN.md` generated after every task review

### Start working on a task

```bash
# 1. Pick next task from Todo column in TASKS.md
git checkout task/NNN-branch-name

# 2. Write failing test first (TDD Red)
# 3. Implement (TDD Green)
# 4. Refactor + bun test + bun tsc --noEmit
# 5. Commit + notify Reviewer
```

### Git setup (first time)

```bash
bash setup-git.sh   # creates initial commit + all 47 task branches
```

### DDD folder structure (target)

```
src/
├── domain/           ← Pure business logic (no I/O)
│   ├── models/       ← FinancialReport, Alert, AnalysisEntry
│   ├── services/     ← ImpactChainService, AlertService
│   └── repositories/ ← Interfaces (ports)
├── infrastructure/   ← Adapters: SQLite, LanceDB, HTTP
├── application/      ← Use cases (orchestration)
└── interface/        ← MCP tools, scheduler (entry points)
```

---

## Current status — stubs to implement

The following modules are designed but have stub implementations (need real logic):

- `src/fetchers/news/` — RSS + HTML scrapers for CafeF, VnExpress, Reuters
- `src/fetchers/market/` — HOSE/HNX price fetchers
- `src/fetchers/reports/ssc.ts` — SSC portal scraper + PDF download
- `src/rag/embeddings.ts` — HuggingFace transformers embedding pipeline
- `src/rag/vectorstore.ts` — LanceDB read/write
- `src/rag/retriever.ts` — Multi-level semantic search
- `src/analysis/cascade.ts` — Causal chain: news → sector → stocks
- `src/analysis/signals.ts` — Multi-signal alert combination
- `src/analysis/patterns.ts` — Historical pattern matching

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
