# VN Market Intelligence MCP

A real-time Vietnamese stock market intelligence system powered by AI agents. Built with TypeScript/Bun, MCP protocol, and two autonomous AI teams.

## Architecture

```
YOU (investor in France)
 |
 |-- Reads Chat Channel on Telegram (alerts, analysis, briefings)
 |-- Uses Claude Desktop to ask questions (connects to MCP server)
 |
 |-- ANALYSIS TEAM (8 Claude Cowork agents -- cloud)
 |   Runs on schedule, sends analysis to Chat Channel
 |   Reports bugs to BUG Channel
 |
 +-- DEV TEAM (Claude Code CLI -- local cron, every 1 hour)
     Reads BUG Channel, auto-fixes, pushes to main, posts WORK status
```

Full architecture docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (module boundaries) and [`docs/architecture/global.md`](docs/architecture/global.md) (system SSOT).

### Three Telegram Channels (Sprint 051 hard cutover)

| Channel | Env Var | Purpose |
|---------|---------|---------|
| **MARKET** | `TELEGRAM_INFO_MARKET_GROUP_ID` | User-facing: alerts, briefings, analysis, bot replies |
| **WORK** | `TELEGRAM_INFO_WORK_CHANNEL_ID` | Dev/analysis status, fix-shipped notices, agent refresh asks |
| **BUG** | `TELEGRAM_REPORT_BUG_CHANNEL_ID` | Analysis → dev bug reports (dev team reads, auto-fixes, deletes) |

## Quick Start

### Step 1: Install Dependencies

```bash
# From monorepo root
pnpm install

# From mcp-server only
cd apps/mcp-server && bun install

# Git hooks (one-time)
./scripts/git-hooks/install.sh   # pre-push runs `bun tsc --noEmit`
```

The pre-push hook blocks pushes whose tracked code fails type-checking.

### Step 2: Configure Environment

```bash
cp .env.example .env
# Edit .env with your values:
#   TELEGRAM_BOT_TOKEN=your_bot_token
#   TELEGRAM_INFO_MARKET_GROUP_ID=-100xxxxxxxxxx   # User-facing market alerts/briefings
#   TELEGRAM_INFO_WORK_CHANNEL_ID=-100xxxxxxxxxx   # Dev/analysis status
#   TELEGRAM_REPORT_BUG_CHANNEL_ID=-100xxxxxxxxxx  # Bug reports
#   TELEGRAM_ENABLED=true
#   VINAHOST_IP=125.212.251.27
#   VINAHOST_PASSWORD=your_password
#   VPS_PUSH_API_KEY=your_key
```

### Step 3: Start All 9 Microservices via Docker

**The only allowed restart method is docker-compose.** Full procedure and banned mechanisms: [`docs/policies/restart-policy.md`](docs/policies/restart-policy.md)

**Expected response:**
```json
{
  "status": "ok",
  "tools": "<see docs/data/project-stats.json>",
  "jobs": "<see docs/data/project-stats.json>"
}
```

Hot reload is **FORBIDDEN**. Do NOT use `bun --hot`, `bun --watch`, `nodemon`, `pm2`, or any live-reload mechanism.

For development:
1. Edit code in `apps/mcp-server/src/`
2. Run tests: `cd apps/mcp-server && bun test`
3. Restart all services: see `docs/policies/restart-policy.md`

### Microservices Overview

| Service | Port | Purpose |
|---------|------|---------|
| **mcp-server** | 3000 | Claude MCP gateway (see `docs/data/project-stats.json` → `toolCount`) |
| **api-gateway** | 4000 | Routing + health aggregation |
| **stock-price** | 5010→5000 | Price aggregation (3-tier fallback) |
| **pdf-extractor** | 5001 | BCTC PDF parsing |
| **rag-service** | 5002 | Embeddings + semantic search |
| **technical-analysis** | 5003 | RSI/MACD/MA/BB indicators |
| **macro-indicators** | 5004 | SBV FX + commodity prices |
| **kinh-dich-service** | 5005 | Hexagram readings |
| **alert-engine** | 5006 | Signal evaluation |

Per-service architecture docs: `docs/architecture/microservice/<service>.md`

All services share SQLite database at `data/market.db`.

Check service health:
```bash
docker-compose ps           # All services status
docker-compose logs -f      # Live logs
docker-compose logs mcp-server --tail 50  # MCP logs only
```

### Step 4: Create 7 Analysis Agents in Claude Cowork

MCP connector URL: `https://zenmidi.com/vn-market/sse`

| # | Agent Name | Schedule | File to Copy |
|---|-----------|----------|-------------|
| 1 | **Unified Coordinator** | Daily 22:00 VN (15:00 UTC) + Sunday 20:00 VN | `cowork-workspace-team-claude-desktop/unified-agent.md` |
| 2 | **News Scout** | Every 1 hour | `cowork-workspace-team-claude-desktop/01-news-scout.md` |
| 3 | **BCTC Collector** | Daily 13:00 UTC + 01:00 UTC | `cowork-workspace-team-claude-desktop/02-bctc-collector.md` |
| 4 | **Report Analyzer** | Daily 14:00 UTC + 02:00 UTC | `cowork-workspace-team-claude-desktop/03-report-analyzer.md` |
| 5 | **Market Watcher** | Every 1 hour (market hours 02:00-08:30 UTC) | `cowork-workspace-team-claude-desktop/04-market-watcher.md` |
| 6 | **Alert Commander** | Every 1 hour | `cowork-workspace-team-claude-desktop/05-alert-commander.md` |
| 7 | **Digest Writer** | Daily 15:30 UTC + Sunday 16:00 UTC | `cowork-workspace-team-claude-desktop/06-digest-writer.md` |

**One-time setup** (only if watchlist is empty): create an agent with `00-setup-watchlist.md`, run once, then delete it.

### Step 5: Set Up the Dev Team Cron

The hourly auto-fix loop runs locally via Claude Code CLI:

```bash
# Option A: Manual test first (recommended)
claude --prompt "$(cat cowork-workspace-team-claude-desktop/dev-team-cron.md)"

# Option B: Set up the hourly cron (after testing)
# In Claude Code CLI:
/schedule create --name "dev-team-cron" --interval "0 * * * *" \
  --prompt "$(cat cowork-workspace-team-claude-desktop/dev-team-cron.md)"
```

**Note**: The Dev Team cron requires Sprint 035b code (pending):
- `read_telegram_reports` MCP tool
- `process_telegram_report` MCP tool

Until 035b is done, run the Dev Team loop manually when needed.

## Daily Operation

You don't need to do anything daily. The system runs autonomously:

| Time (VN) | What Happens | Where You See It |
|-----------|-------------|-----------------|
| 08:00 | Morning briefing | Chat Channel |
| 08:55 | "He thong online" | Chat Channel |
| 09:00-15:30 | Market monitoring (every 15 min) | Alerts in Chat Channel if significant |
| 15:30 | Market close scan | Chat Channel |
| 21:00 | Alert digest | Chat Channel |
| 22:00 | Unified Coordinator quality review | Problems -> Report Channel |
| 22:30 | Daily digest | Chat Channel |
| Every 1h | Dev Team checks Report Channel | Fixes pushed silently, summary in Chat Channel |

## When You Need to Intervene

| Situation | What to Do |
|-----------|-----------|
| **Services down** | `docker-compose down && docker-compose up -d && sleep 5` |
| **Service flapping after deploy** | `docker-compose logs mcp-server --tail 50` to see errors, fix, then restart |
| **Database locked (WAL bloat)** | `rm -f data/market.db-wal data/market.db-shm` then restart Docker |
| **Port conflict (e.g., 5000 in use)** | `lsof -i :5000` to find process; docker-compose.yml remaps to 5010 |
| **Agent file updated by Dev Team** | You'll get a WORK Channel message. Copy new `.md` content into Cowork. |
| **Want to ask a question** | Use Claude Desktop (connected to MCP server) |
| **Want to add a stock** | Tell Claude Desktop: "Add HPG to watchlist" |
| **Want to change watchlist** | Edit `mcp.config.json` -> `market.watchlist`, restart Docker |
| **Bad fix by Dev Team** | `git log --oneline -5` then `git revert <commit>` then restart Docker |

## MCP Tools (Phase 3 Complete)

See `docs/data/project-stats.json#toolCount` for current count.

| Category | Count | Examples |
|----------|-------|---------|
| Watchlist | 4 | add_to_watchlist, get_watchlist |
| News | 4 | fetch_and_analyze, run_impact_chain |
| Market | 8 | get_market_snapshot, compare_stocks, get_sentiment_trend |
| Reports | 6 | fetch_ssc_reports, get_financial_summary, get_earnings_calendar |
| Alerts | 14 | get_alerts, set_price_alert, add_custom_alert, mute_stock_alerts |
| Portfolio | 12 | get_positions, get_portfolio_risk, get_rebalancing_signals |
| Prediction | 1 | get_prediction_accuracy |
| Summaries | 2 | get_market_summary, generate_market_summary |
| Telegram | 4 | send_test_telegram, send_telegram_report |
| Feedback | 2 | submit_feedback |
| Operations | 3 | get_data_freshness, get_source_health |
| System | 4 | get_system_health, get_global_log |

Full tool list: see `CLAUDE.md` or `cowork-workspace-team-claude-desktop/README.md`.

## Telegram Bot Commands

Users can interact via the Telegram bot in the Chat Channel:

| Command | Description |
|---------|-------------|
| `/watchlist` | Show current tracked stocks |
| `/price VCB` | Get live price for a stock |
| `/alerts` | Show pending HIGH/CRITICAL alerts |
| `/briefing` | Trigger morning briefing on demand |
| `/health` | Server health + tool count |
| `/pnl` | Show portfolio P&L summary |
| `/help` | List all commands |

## Project Structure

```
src/
  domain/           -- Pure business logic (no I/O)
  infrastructure/   -- Adapters: SQLite, LanceDB, HTTP fetchers, Telegram
  application/      -- Use cases (orchestration)
  interface/        -- MCP tools, scheduler (entry points)
  scheduler/        -- Cron job definitions

cowork-workspace-team-claude-desktop/
  unified-agent.md      -- Coordinator + quality review
  dev-team-cron.md      -- Dev team hourly loop (local CLI)
  01-news-scout.md      -- News monitoring agent
  02-bctc-collector.md  -- BCTC report tracking
  03-report-analyzer.md -- Financial analysis
  04-market-watcher.md  -- Price tracking
  05-alert-commander.md -- Alert + Telegram sender
  06-digest-writer.md   -- Daily/weekly digests
  README.md             -- Full team setup reference

docs/                   -- Requirement specs + technical designs
reports/                -- QA task reports + sprint reports
CLAUDE.md               -- Full architecture context
docs/TASKS.md           -- Kanban board
docs/SPRINT_GOAL.md     -- Current sprint vision
mcp.config.json         -- Central configuration
```

## Tech Stack

| Tool | Purpose |
|------|---------|
| Bun 1.x | Runtime + package manager |
| TypeScript | Language |
| @modelcontextprotocol/sdk | MCP protocol |
| better-sqlite3 | Persistent storage |
| lancedb | Local vector store (RAG) |
| @huggingface/transformers | Local embeddings (multilingual-MiniLM) |
| cheerio + axios | HTML scraping |
| puppeteer-core | SSC portal automation |
| pdf-parse | BCTC PDF extraction |
| node-cron | Scheduled jobs |
| Telegram Bot API | Push notifications |

## Cost Optimization

- **Analysis agents**: run on Cowork schedules (included in your plan)
- **Dev Team cron**: only costs tokens when Report Channel has messages. Empty check = ~1 API call
- **Off-hours**: agents slow down automatically (every 2h instead of every 15min)
- **Weekends**: only News Scout + Alert Commander run (reduced frequency)
- **Server**: runs locally on your Mac, no cloud hosting cost

## License

Private project.
