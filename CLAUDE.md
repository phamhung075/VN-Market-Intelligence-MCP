# VN Market Intelligence MCP — Claude Project Context

> How to use this file: read the pointer lines below, then open the linked doc ONLY when your current task touches that area. Do not preload all docs.

- Architecture, folder tree, data flow, data sources → `docs/ARCHITECTURE.md`
- Scheduled cron jobs (all times, steps, cycle) → `docs/CRON_JOBS.md`
- Sprint-by-sprint implementation history → `docs/IMPLEMENTATION_STATUS.md`
- Full two-team AI architecture design → `docs/AI_TEAM_DESIGN.md`
- Dev workflow engine description → `.claude/WORKFLOW.md`

---

## What this project is

A MCP (Model Context Protocol) server built in TypeScript running on Bun. It gives Claude real-time intelligence on the Vietnamese stock market (HOSE / HNX / UPCOM) by:

- Fetching and analyzing Vietnamese + global news via causal chain (global → country → sector → stock)
- Extracting and analyzing financial reports (BCTC) from congbothongtin.ssc.gov.vn
- Maintaining a RAG memory of past analyses using local embeddings (multilingual-MiniLM)
- Managing a user's stock watchlist and generating multi-signal alerts
- Running a daily scheduled briefing at market open/close

**Current state (Sprint 046):** 76 MCP tools, 21 scheduler files, 200+ tasks done.

---

## Two-Team Autonomous Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ANALYSIS TEAM (Claude Cowork — 7 agents, cloud)         │
│  Serves user with investment intelligence                 │
│  → Chat Channel (TELEGRAM_CHAT_ID) = user-facing          │
│  → Report Channel (TELEGRAM_REPORT_ID) = problems only    │
└───────────────────────┬──────────────────────────────────┘
                        │ Report Channel (problems)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  DEV TEAM (Claude Code CLI — local cron, every 1 hour)   │
│  Reads problems → auto-fixes → pushes to main            │
│  → Telegram summary of changes to user                    │
│  → Updates agent .md files → notifies user                │
│  → Server auto-reloads via bun --hot                      │
└──────────────────────────────────────────────────────────┘
```

### Two Telegram Channels — CRITICAL INVARIANT

| Channel | Env Var | Purpose |
|---------|---------|---------|
| **Chat** | `TELEGRAM_CHAT_ID` | User-facing: alerts, briefings, analysis, bot commands |
| **Report** | `TELEGRAM_REPORT_ID` | Problems/hotfix ONLY: dev team reads, auto-fixes, deletes |

**Alert Commander (`05-alert-commander.md`) is the ONLY agent that sends to Chat Channel.**
All other agents write to Report Channel or read-only.

### Analysis Team agents (`cowork-analysis-vnmarket-team/`)

| # | Agent | File | Role |
|---|-------|------|------|
| 0 | Setup | `00-setup-watchlist.md` | One-time: seed watchlist |
| 1 | News Scout | `01-news-scout.md` | Fetch news, sentiment, impact chains |
| 2 | BCTC Collector | `02-bctc-collector.md` | Track BCTC report availability |
| 3 | Report Analyzer | `03-report-analyzer.md` | Analyze financials, validate data |
| 4 | Market Watcher | `04-market-watcher.md` | Track prices, detect anomalies |
| 5 | Alert Commander | `05-alert-commander.md` | ONLY agent that sends to Chat Channel |
| 6 | Digest Writer | `06-digest-writer.md` | Daily/weekly summaries |

Coordinator: `unified-agent.md` — analysis coordination + quality review.

### Dev Team agents (`.claude/agents/`) — for SPRINT TASK items

| Agent | File | Role |
|-------|------|------|
| PO | `po.md` | Vision, approves specs, final sign-off |
| BA | `ba.md` | Requirements, edge cases, blockers |
| Architect | `architect.md` | Brownfield analysis, technical design, risk |
| PM | `pm.md` | Sprint planning, task breakdown, TASKS.md |
| Developer | `developer.md` | TDD implementation, DDD compliance |
| QA / CI-CD | `qa.md` | Test pipeline, merge gate, sprint report |
| Fixer | `fixer.md` | Minimum fixes on changes-requested tasks |
| Market Analyst | `market-analyst.md` | Investment analysis via MCP tools |
| Idea Forge | `idea-forge.md` | Brainstorm, refine, expand ideas |
| Cowork Refactory Expert | `cowork-refactory-expert.md` | Rewrite/update Cowork agent .md files |

Dev team hourly loop: `cowork-analysis-vnmarket-team/dev-team-cron.md`

---

## Critical Rules & Invariants

### Architecture
- **DDD layering**: `domain/` never imports `infrastructure/`. Violations break the test suite.
- Layer order: `domain` ← `application` ← `interface` ← `scheduler`. Cross-layer imports only go inward.
- **TDD**: every task starts with a failing test in `src/__tests__/NNN-*.test.ts`.

### Production footguns
- **SQLite WAL checkpoint**: must run daily + on SIGTERM (`src/infrastructure/db/checkpoint.ts`). Skipping causes unbounded WAL growth → disk fill.
- **SQL parameter binding**: all SQLite queries must use parameterized bindings. Never string-interpolate user input into SQL.
- **Circuit breaker**: wrap every external HTTP fetch with the circuit breaker registry (`src/infrastructure/circuitBreakerRegistry.ts`). Direct fetch → no protection against cascade failures.
- **Rate limiter**: every fetcher must call the per-host rate limiter (`src/domain/services/rateLimiter.ts`) before making requests. Missing wiring = thundering-herd on data sources.
- **`--no-verify` is forbidden**: never skip git hooks.
- **Alert Commander exclusivity**: only `05-alert-commander.md` calls `send_telegram` with `channel: "chat"`. Any other agent doing so creates duplicate alerts.
- **WIP limit**: max 2 tasks In Progress simultaneously in TASKS.md.
- **Branch hygiene**: the production Bun process on zenmidi runs from `main` via `--hot`. Every task MUST end with `git checkout main`, merged branch deleted (local + remote), worktrees under `.claude/worktrees/` removed, and stashes from merged branches dropped. Full checklist → `.claude/WORKFLOW.md#branch-hygiene-checklist`.
- **launchd supervision**: the production Bun is supervised by `launchd/com.vn-market.mcp.plist` (label `com.vn-market.mcp`, `KeepAlive` + `RunAtLoad`). Do NOT run `./start.sh` manually — it would fight the supervised instance. To bounce after a deploy: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`. Installer: `./launchd/install.sh` (one-time, requires Full Disk Access for `/bin/bash` + `~/.bun/bin/bun`). Full guide → `README.md#step-3b-install-the-macos-launchd-agent`.
- **VPS price proxy**: VN stock APIs are geo-blocked from France. A Vultr VPS (Singapore, `vn-price-fetch.service`, systemd `Restart=always`) pushes prices via `POST /api/push-prices`. **Never add SSH / sshpass logic to any Bun scheduler** — liveness is systemd's job. `src/scheduler/vpsProxyWatchdogJob.ts` is observe-only: alerts the Chat Channel if `market_prices.updated_at` is >5 min stale. Operator escape hatch: `./deploy-vps-proxy.sh`. Full design → `docs/ARCHITECTURE.md#vps-price-proxy`.

### Methodology
- **Agile/Kanban**: `TASKS.md` is the Kanban board — Backlog → Todo → In Progress → Review → Done
- **Auto-merge**: Dev team auto-merges to main, always commits separately for rollback
- **Hot reload**: `bun --hot` in production, code changes apply without full restart
- **Reports**: `reports/TASK_REPORT_NNN.md` generated by QA after every review

---

## Development

```bash
bun install                    # install dependencies
bun --watch src/index.ts       # dev with hot reload
./start.sh                     # production (bun --hot, suppresses LanceDB TRACE, rotates logs)

# Server endpoints
GET  http://localhost:3000/sse               ← Claude connects here
POST http://localhost:3000/messages?sessionId=<id>
GET  http://localhost:3000/health
```

### Start a new feature
```
Use @po agent: "I want to add [feature]. Investment goal: [why]."
```

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

### Output artifacts

```
docs/REQ_NNN.md              ← BA: Requirement Spec
docs/TECH_NNN.md             ← Architect: Technical Design
reports/TASK_REPORT_NNN.md   ← QA: per-task review
reports/SPRINT_REPORT_NNN.md ← QA: sprint summary
SPRINT_GOAL.md               ← PO: current sprint vision
```

### Claude Desktop config

```json
{
  "mcpServers": {
    "vn-market": {
      "url": "http://localhost:3000/sse"
    }
  }
}
```

---

## mcp.config.json — central configuration

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

---

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
