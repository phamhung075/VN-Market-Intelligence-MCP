# VN Market Intelligence MCP

A real-time Vietnamese stock market intelligence system powered by AI agents. Built with TypeScript/Bun, MCP protocol, and two autonomous AI teams.

## Architecture

```
YOU (investor in France)
 |
 |-- Reads Chat Channel on Telegram (alerts, analysis, briefings)
 |-- Uses Claude Desktop to ask questions (connects to MCP server)
 |
 |-- ANALYSIS TEAM (7 Claude Cowork agents -- cloud)
 |   Runs on schedule, sends analysis to Chat Channel
 |   Reports problems to Report Channel
 |
 +-- DEV TEAM (Claude Code CLI -- local cron, every 1 hour)
     Reads Report Channel, auto-fixes, pushes to main
```

### Two Telegram Channels

| Channel | Env Var | Purpose |
|---------|---------|---------|
| **Chat** | `TELEGRAM_CHAT_ID` | User-facing: alerts, briefings, analysis, bot commands |
| **Report** | `TELEGRAM_REPORT_ID` | Problems/hotfix ONLY: dev team reads, auto-fixes, deletes |

## Quick Start

### Step 1: Install Dependencies

```bash
bun install
./scripts/git-hooks/install.sh   # one-time: pre-push runs `bun tsc --noEmit`
```

The pre-push hook blocks pushes whose tracked code fails type-checking — most
often because tracked code imports a file the developer forgot to `git add`
(the bug class that broke main in Loop #20 Slice 1).

### Step 2: Configure Environment

```bash
cp .env.example .env
# Edit .env with your values:
#   TELEGRAM_BOT_TOKEN=your_bot_token
#   TELEGRAM_CHAT_ID=your_chat_channel_id       # User-facing
#   TELEGRAM_REPORT_ID=your_report_channel_id   # Problems/hotfix only
#   TELEGRAM_ENABLED=true
#   CLOUDFLARE_TOKEN=your_tunnel_token
```

### Step 3: Start the MCP Server

```bash
# Development (hot reload, foreground)
bun --watch src/index.ts

# Production one-shot (bun --hot, log rotation, LanceDB TRACE suppressed)
./start.sh
```

Verify:
```bash
curl http://localhost:3000/health
# {"status":"ok","toolCount":76}
```

#### Step 3b: Install the macOS launchd agent (recommended for production)

`start.sh` runs the server under the current shell and will NOT survive a
Mac reboot. For reboot-safe, crash-restarting supervision install the
launchd agent that lives under `launchd/`:

```bash
./launchd/install.sh
```

First-time only — macOS Full Disk Access grant: because the project lives
under `~/Documents/`, the LaunchAgent-spawned bash is blocked by macOS
TCC unless you explicitly allow it. Open
**System Settings → Privacy & Security → Full Disk Access**, click `+`,
press `Cmd+Shift+G`, paste each of the following, and toggle on:

- `/bin/bash`
- `/Users/<you>/.bun/bin/bun`

Then re-run `./launchd/install.sh`.

What the agent provides:

| Event | Behavior |
|---|---|
| Mac reboot / re-login | auto-starts via `RunAtLoad=true` |
| Bun process crash | auto-restarts within `ThrottleInterval=10s` |
| Source edits | `bun --hot` reloads in place (no restart needed) |
| `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` | clean manual restart |

After install, stop using `./start.sh` directly — it would fight the
supervised instance. Use `launchctl kickstart -k` to bounce, or
`launchctl unload -w ~/Library/LaunchAgents/com.vn-market.mcp.plist`
for maintenance downtime.

```bash
# Status
launchctl list | grep com.vn-market.mcp
tail -f /tmp/vn-market-mcp.log

# Restart
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp

# Stop / start
launchctl unload -w ~/Library/LaunchAgents/com.vn-market.mcp.plist
launchctl load   -w ~/Library/LaunchAgents/com.vn-market.mcp.plist
```

### Step 4: Start Cloudflare Tunnel

```bash
source .env
cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TOKEN"
```

Public URL: `https://zenmidi.com/mcp`

### Step 5: Create 7 Analysis Agents in Claude Cowork

MCP connector URL: `https://zenmidi.com/mcp`

| # | Agent Name | Schedule | File to Copy |
|---|-----------|----------|-------------|
| 1 | **Unified Coordinator** | Daily 22:00 VN (15:00 UTC) + Sunday 20:00 VN | `cowork-analysis-vnmarket-team/unified-agent.md` |
| 2 | **News Scout** | Every 1 hour | `cowork-analysis-vnmarket-team/01-news-scout.md` |
| 3 | **BCTC Collector** | Daily 13:00 UTC + 01:00 UTC | `cowork-analysis-vnmarket-team/02-bctc-collector.md` |
| 4 | **Report Analyzer** | Daily 14:00 UTC + 02:00 UTC | `cowork-analysis-vnmarket-team/03-report-analyzer.md` |
| 5 | **Market Watcher** | Every 1 hour (market hours 02:00-08:30 UTC) | `cowork-analysis-vnmarket-team/04-market-watcher.md` |
| 6 | **Alert Commander** | Every 1 hour | `cowork-analysis-vnmarket-team/05-alert-commander.md` |
| 7 | **Digest Writer** | Daily 15:30 UTC + Sunday 16:00 UTC | `cowork-analysis-vnmarket-team/06-digest-writer.md` |

**One-time setup** (only if watchlist is empty): create an agent with `00-setup-watchlist.md`, run once, then delete it.

### Step 6: Set Up the Dev Team Cron

The hourly auto-fix loop runs locally via Claude Code CLI:

```bash
# Option A: Manual test first (recommended)
claude --prompt "$(cat cowork-analysis-vnmarket-team/dev-team-cron.md)"

# Option B: Set up the hourly cron (after testing)
# In Claude Code CLI:
/schedule create --name "dev-team-cron" --interval "0 * * * *" \
  --prompt "$(cat cowork-analysis-vnmarket-team/dev-team-cron.md)"
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
| **Server down (launchd-supervised)** | `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp` |
| **Server down (no launchd)** | `./start.sh` — or install launchd once: `./launchd/install.sh` |
| **Server flapping after deploy** | `tail -50 /tmp/vn-market-mcp.log` to see the crash, fix, then kickstart |
| **Tunnel down** | `cloudflared tunnel run --token ...` |
| **Agent file updated by Dev Team** | You'll get a Chat Channel message. Copy new `.md` content into Cowork. |
| **Want to ask a question** | Use Claude Desktop (connected to MCP server) |
| **Want to add a stock** | Tell Claude Desktop: "Add HPG to watchlist" |
| **Want to change watchlist** | Edit `mcp.config.json` -> `market.watchlist`, restart server |
| **Bad fix by Dev Team** | `git log --oneline -5` then `git revert <commit>` then kickstart the launchd agent |

## 62 MCP Tools (Sprint 034)

| Category | Count | Examples |
|----------|-------|---------|
| Watchlist | 4 | add_to_watchlist, get_watchlist |
| News | 4 | fetch_and_analyze, run_impact_chain |
| Market | 8 | get_market_snapshot, compare_stocks, get_sentiment_trend |
| Reports | 6 | fetch_ssc_reports, get_financial_summary, get_earnings_calendar |
| Alerts | 14 | get_alerts, set_price_alert, add_custom_alert, mute_stock_alerts |
| Portfolio | 12 | get_positions, get_portfolio_risk, get_rebalancing_signals |
| Prediction | 1 | get_prediction_markets |
| Summaries | 2 | get_market_summary, generate_market_summary |
| Telegram | 4 | send_test_telegram, send_telegram_report |
| Feedback | 2 | submit_feedback |
| Operations | 3 | get_data_freshness, get_source_health |
| System | 4 | get_system_health, get_global_log |

Full tool list: see `CLAUDE.md` or `cowork-analysis-vnmarket-team/README.md`.

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

cowork-analysis-vnmarket-team/
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
TASKS.md                -- Kanban board
SPRINT_GOAL.md          -- Current sprint vision
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
