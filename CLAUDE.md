# VN Market Intelligence MCP — Claude Project Context

> How to use this file: read the pointer lines below, then open the linked doc ONLY when your current task touches that area. Do not preload all docs.

- Architecture, folder tree, data flow, data sources, mcp.config.json → `docs/ARCHITECTURE.md`
- Scheduled cron jobs (all times, steps, cycle) → `docs/CRON_JOBS.md`
- Sprint-by-sprint implementation history → `docs/IMPLEMENTATION_STATUS.md`
- Full two-team AI architecture design → `docs/AI_TEAM_DESIGN.md`
- Dev workflow engine description → `.claude/WORKFLOW.md`
- Vietnamese financial terms glossary → `docs/GLOSSARY_VI.md`

---

## What this project is

A MCP (Model Context Protocol) server built in TypeScript running on Bun. It gives Claude real-time intelligence on the Vietnamese stock market (HOSE / HNX / UPCOM) by:

- Fetching and analyzing Vietnamese + global news via causal chain (global → country → sector → stock)
- Extracting and analyzing financial reports (BCTC) from congbothongtin.ssc.gov.vn
- Maintaining a RAG memory of past analyses using local embeddings (multilingual-MiniLM)
- Managing a user's stock watchlist and generating multi-signal alerts
- Running a daily scheduled briefing at market open/close

**Current state (Sprint 052):** 76 MCP tools, 22 scheduler files, 200+ tasks done.

---

## Two-Team Autonomous Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ANALYSIS TEAM (Claude Cowork — 7 agents, cloud)         │
│  Serves user with investment intelligence                 │
│  → Market Group  (TELEGRAM_INFO_MARKET_GROUP_ID) = user  │
│  → Work Channel  (TELEGRAM_INFO_WORK_CHANNEL_ID) = status │
│  → Bug Channel   (TELEGRAM_REPORT_BUG_CHANNEL_ID) = bugs  │
└──────────┬─────────────────────────┬──────────────────────┘
           │ Work Channel            │ Bug Channel
           │ (work posts mirror      │ (problems only)
           │  into Market Group      │
           │  as thread topics)      │
           ▼                         ▼
┌──────────────────────────────────────────────────────────┐
│  DEV TEAM (Claude Code CLI — local cron, every 1 hour)   │
│  Reads Bug Channel → auto-fixes → pushes to main         │
│  → Work Channel: fix-shipped notices, sprint summaries   │
│  → Agent .md refreshes: "please reload agent X" → Work  │
│  → Server auto-reloads via bun --hot                     │
└──────────────────────────────────────────────────────────┘
```

### Three Telegram Destinations — CRITICAL INVARIANT

| Destination | Env Var | Telegram title | ID | Purpose |
|-------------|---------|----------------|----|---------|
| **MARKET** | `TELEGRAM_INFO_MARKET_GROUP_ID` | Vn-market-user | -1003813192664 | User-facing: price alerts, briefings, hexagram, daily/weekly digest, analysis output to user |
| **WORK** | `TELEGRAM_INFO_WORK_CHANNEL_ID` | Vn-market-work | -1003733983137 | Dev/analysis work status: fix-shipped notices, sprint summaries, "please refresh Cowork agent X" asks, dev-team-cron status, unified-agent coordination notes |
| **BUG** | `TELEGRAM_REPORT_BUG_CHANNEL_ID` | Vn-market-report | -1003853842961 | Bug reports from analysis agents → dev team claim/process/delete loop |

**Linked channel note**: Vn-market-work is the linked discussion channel of Vn-market-user. Posts to WORK auto-mirror into the Market Group as thread topics, so work status is visible to the user without cluttering the main alert feed.

**NO LEGACY ALIASES**: `TELEGRAM_CHAT_ID` and `TELEGRAM_REPORT_ID` are fully deleted. `send_telegram(channel: "chat" | "report")` is replaced by `channel: "market" | "work" | "bug"`. No compat shims.

**Routing rules:**
- **MARKET**: price alerts, briefings, hexagram, daily/weekly digest, analysis output to user. **Alert Commander is the ONLY sender here.**
- **WORK**: dev fix-shipped summaries, sprint completion notices, "please refresh Cowork agent X" asks, dev-team-cron status, unified-agent coordination notes. Dev team and unified-agent only.
- **BUG**: every analysis agent's problem report. Same `claim_telegram_report` / `process_telegram_report` flow. Dev team reads, claims, processes, deletes.

**Invariants:**
- Alert Commander (`05-alert-commander.md`) is the ONLY agent that writes to MARKET.
- Dev team and unified-agent send work summaries to WORK, never MARKET.
- Bug reports always go to BUG.

### Analysis Team agents (`cowork-analysis-vnmarket-team/`)

| # | Agent | File | Role |
|---|-------|------|------|
| 0 | Setup | `00-setup-watchlist.md` | One-time: seed watchlist |
| 1 | News Scout | `01-news-scout.md` | Fetch news, sentiment, impact chains |
| 2 | BCTC Collector | `02-bctc-collector.md` | Track BCTC report availability |
| 3 | Report Analyzer | `03-report-analyzer.md` | Analyze financials, validate data |
| 4 | Market Watcher | `04-market-watcher.md` | Track prices, detect anomalies |
| 5 | Alert Commander | `05-alert-commander.md` | ONLY agent that sends to MARKET channel |
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
| System Auditor | `system-auditor.md` | Health audit: memory, DB, docs sync, anomaly detection |
| Claude Manager Helper | `claude-manager-helper.md` | Context janitor: CLAUDE.md slim, docs sync, memory hygiene |

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
- **Alert Commander exclusivity**: only `05-alert-commander.md` calls `send_telegram` with `channel: "market"`. Any other agent writing to MARKET creates duplicate alerts to the user.
- **WIP limit**: max 2 tasks In Progress simultaneously in TASKS.md.
- **Branch hygiene**: the production Bun process on zenmidi runs from `main` via `--hot`. Every task MUST end with `git checkout main`, merged branch deleted (local + remote), worktrees under `.claude/worktrees/` removed, and stashes from merged branches dropped. Full checklist → `.claude/WORKFLOW.md#branch-hygiene-checklist`.
- **launchd supervision**: the production Bun is supervised by `launchd/com.vn-market.mcp.plist` (label `com.vn-market.mcp`, `KeepAlive` + `RunAtLoad`). Do NOT run `./start.sh` manually — it would fight the supervised instance. To bounce after a deploy: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`. Installer: `./launchd/install.sh` (one-time, requires Full Disk Access for `/bin/bash` + `~/.bun/bin/bun`). Full guide → `README.md#step-3b-install-the-macos-launchd-agent`.
- **VPS price proxy**: VN stock APIs are geo-blocked from France. A Vultr VPS (Singapore, `vn-price-fetch.service`, systemd `Restart=always`) pushes prices via `POST /api/push-prices`. **Never add SSH / sshpass logic to any Bun scheduler** — liveness is systemd's job. `src/scheduler/vpsProxyWatchdogJob.ts` is observe-only: alerts the MARKET channel if `market_prices.updated_at` is >5 min stale. Operator escape hatch: `./deploy-vps-proxy.sh`. Full design → `docs/ARCHITECTURE.md#vps-price-proxy`.

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

- `mcp.config.json` sections (server, telegram, alerts, RAG, fetchers, etc.) → `docs/ARCHITECTURE.md#mcp-configjson--central-configuration`
- Vietnamese financial terms glossary → `docs/GLOSSARY_VI.md`
