# AI Team Setup Guide

## Prerequisites
1. MCP server running: `bun run src/index.ts`
2. Telegram configured in `.env` (bot token + chat ID)
3. Cloudflare tunnel running: `cloudflared tunnel run --token $CLOUDFLARE_TOKEN`
4. Claude Cowork / Claude Schedule account

## Configuration

### mcp.config.json (single source of truth)

All settings are in `mcp.config.json` at project root. Key sections:

| Section | What it controls |
|---------|-----------------|
| `server` | port, host, logLevel |
| `market.watchlist` | **Default stocks** — auto-seeded on server restart if DB is empty |
| `market.openTime/closeTime` | Vietnam market hours (09:00-15:30) |
| `alerts` | drop/rise thresholds, Telegram trigger levels |
| `scheduler` | All cron expressions |
| `fetchers` | RSS URLs, API endpoints, timeouts |
| `fetchLimits` | News per source by time of day |
| `telegram` | Bot token, chat ID (override via .env) |

### Watchlist Management

**Default watchlist** is in `mcp.config.json`:
```json
"market": {
  "watchlist": ["VNM", "FPT", "VCB", "HPG", "VEA"]
}
```

This auto-seeds the database on every server restart (only if watchlist table is empty).

**To change stocks**:
- Edit `mcp.config.json` → `market.watchlist` for permanent changes
- Or use MCP tools at runtime: `add_to_watchlist` / `remove_from_watchlist`
- Runtime changes persist in SQLite — they won't be overwritten by config

**All agents read watchlist dynamically** via `get_watchlist` — no hardcoded stock codes.

### .env (secrets only)
```
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_ENABLED=true
CLOUDFLARE_TOKEN=your_tunnel_token
CLOUDFLARE_TUNNEL=vn-market-mcp
```

## Quick Start

### Step 1: Start MCP Server
```bash
cd /path/to/VN-Market-Intelligence-MCP
bun run src/index.ts
```
Server auto-seeds watchlist from config, starts OCR for unprocessed PDFs, registers 27 tools.

Verify: `curl https://zenmidi.com/health` → `{"status":"ok","toolCount":27}`

### Step 2: Start Cloudflare Tunnel
```bash
source .env
cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TOKEN"
```
Permanent URL: `https://zenmidi.com/mcp`

### Step 3: Create 6 Agents in Claude Cowork

MCP connector URL: `https://zenmidi.com/mcp`

| Order | Agent | Schedule | File | Role |
|-------|-------|----------|------|------|
| 1 | **News Scout** | Every hour | `01-news-scout.md` | Fetch news + submit feedback on gaps |
| 2 | **BCTC Collector** | Daily 20:00 + 08:00 VN | `02-bctc-collector.md` | Track BCTC reports |
| 3 | **Report Analyzer** | Daily 21:00 + 09:00 VN | `03-report-analyzer.md` | Analyze financials + feedback |
| 4 | **Market Watcher** | Hourly market hours | `04-market-watcher.md` | Track prices + feedback on thresholds |
| 5 | **Alert Commander** | Every hour | `05-alert-commander.md` | ONLY Telegram sender + alert quality feedback |
| 6 | **Digest Writer** | Daily 22:30 + Sunday | `06-digest-writer.md` | Compile summaries + weekly review |
| 7 | **System Improver** | Daily 22:00 VN + Sunday | `07-system-improver.md` | Read feedback → FIX NOW or trigger PO→BA→...→QA chain |

### Step 4: Verify
- Telegram: "✅ System online" at 08:55 Vietnam (03:55 France CET)
- Health: `curl https://zenmidi.com/health`

## 30 MCP Tools Available

| Category | Tools |
|----------|-------|
| **Watchlist** | add_to_watchlist, remove_from_watchlist, get_watchlist, update_thresholds |
| **News** | fetch_and_analyze, run_impact_chain, search_similar_context, get_analysis_history |
| **Market** | get_market_snapshot, get_macro_snapshot, get_patterns |
| **Reports** | fetch_ssc_reports, get_financial_summary, compare_financials, list_stored_pdfs, read_bctc_pdf |
| **Alerts** | get_alerts, mark_alert_read, run_daily_briefing |
| **Portfolio** | get_portfolio_conviction |
| **Summaries** | get_market_summary, generate_market_summary |
| **Telegram** | send_test_telegram, **send_telegram_report** |
| **Feedback** | **submit_feedback**, **get_feedback** |
| **System** | get_system_health, get_global_log, get_tool_log, get_error_summary |

## Vn-market-report Channel (Inter-Agent Communication)

All agents communicate via the **Vn-market-report** Telegram channel instead of database-only feedback.

- `send_telegram_report` — send reports, requests, analysis to the team
- `submit_feedback` — submit improvement suggestions (sent to report channel + stored in DB)
- Tag recipients: `@team`, `@po`, `@dev`, `@qa`, `@ba`, `@architect`, `@market-analyst`
- Dev team reads the channel and acts on reports
- Review agent deletes reports when issues are fixed

## Agent Cooperation Flow

```
07:00 VN  News Scout monitors pre-market news + submits feedback
08:55 VN  Alert Commander sends "✅ Hệ thống online"
09:00 VN  Market Watcher starts hourly price tracking + submits feedback
09:00-15:30  All agents at full frequency
15:30 VN  Market closes → Market Watcher slows
15:45 VN  Alert Commander sends end-of-day summary + alert quality feedback
20:00 VN  Server's SSC nightly job downloads new BCTC PDFs
20:00 VN  BCTC Collector checks what's available
21:00 VN  Report Analyzer reads financial data + submits BCTC feedback
22:00 VN  ⭐ System Improver reads ALL feedback → FIX NOW or → PO→BA→Arch→PM→Dev→QA
22:30 VN  Digest Writer sends daily summary + weekly review (Sunday)
```

## Agent Feedback Loop (via Vn-market-report Telegram channel)

```
Analysis team finds gaps → submit_feedback / send_telegram_report
                                          ↓
                          Vn-market-report Telegram channel (@po, @dev, @team)
                                          ↓
                    ┌── @dev reads → FIX NOW (<20 lines): implement + test + push
                    │
                    └── @po reads → SPRINT TASK: PO → BA → Architect → PM → Dev → QA
                                          ↓
                                    Merged to main
                                          ↓
                              Review agent deletes resolved reports
```

Agents submit feedback via `submit_feedback` MCP tool:
- **News Scout**: cascade_rule_gap, trade_map_gap, sentiment_error, new_indicator
- **Market Watcher**: threshold_issue, sector_peer_issue, alert_quality
- **Alert Commander**: alert_quality, performance_issue
- **Report Analyzer**: data_extraction_error, trade_map_gap from BCTC
- **Digest Writer**: compiles weekly review via get_feedback
- **System Improver**: triages feedback → FIX NOW or SPRINT TASK → triggers dev team chain

## Key Architecture Rules

1. **Watchlist is dynamic** — all agents call `get_watchlist`, never hardcode stocks
2. **BCTC Collector does NOT call `fetch_ssc_reports`** — too heavy (Puppeteer). Server handles downloads via nightly cron.
3. **Report Analyzer reads from DB** — uses `get_financial_summary` + `compare_financials`, NOT `read_bctc_pdf` each cycle
4. **Only `read_bctc_pdf` for NEW files** — text is cached in SQLite after background OCR
5. **Only Alert Commander sends Telegram** — max 10 messages/day
6. **OCR runs in background** on server startup — processes unextracted PDFs automatically

## Telegram Output (France time)

```
~03:55 CET  ✅ System online
~04:00-10:30  Price alerts (only significant moves)
~10:45  📊 Market close summary
~15:30  📊 Daily Digest
Sunday ~17:00  📊 Weekly Digest
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server timeout | Kill zombie Chrome: `pkill -9 -f "Google Chrome.*no-sandbox"` then restart |
| Watchlist empty | Auto-seeds on restart from mcp.config.json. Check `market.watchlist` |
| Telegram fails | Check `.env` has TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID |
| SSC timeout | Normal — portal is slow. Nightly job retries automatically |
| OCR not working | Install: `brew install tesseract tesseract-lang poppler` |
| Errors in log | Clear: run `get_system_health` tool, errors auto-resolve |
| Tunnel down | Restart: `cloudflared tunnel run --token $CLOUDFLARE_TOKEN` |
