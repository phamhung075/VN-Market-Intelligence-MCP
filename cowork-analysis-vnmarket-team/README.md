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
TELEGRAM_CHAT_ID=your_chat_id        # User-facing: alerts, briefings, analysis
TELEGRAM_REPORT_ID=your_report_id    # Problems/hotfix only: dev team reports
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
Server auto-seeds watchlist from config, starts OCR for unprocessed PDFs, registers 62 tools.

Verify: `curl https://zenmidi.com/health` → `{"status":"ok","toolCount":62}`

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

## 62 MCP Tools Available (Sprint 034)

| Category | Tools |
|----------|-------|
| **Watchlist** | add_to_watchlist, remove_from_watchlist, get_watchlist, update_thresholds |
| **News** | fetch_and_analyze, run_impact_chain, search_similar_context, get_analysis_history |
| **Market** | get_market_snapshot, get_macro_snapshot, get_patterns, get_price_history, get_sector_rotation, search_stocks, compare_stocks, get_sentiment_trend |
| **Reports** | fetch_ssc_reports, get_financial_summary, compare_financials, list_stored_pdfs, read_bctc_pdf, get_earnings_calendar |
| **Alerts** | get_alerts, mark_alert_read, run_daily_briefing, trigger_alert_check, set_price_alert, get_price_alerts, delete_price_alert, get_alert_accuracy, add_custom_alert, list_custom_alerts, delete_custom_alert, mute_stock_alerts, unmute_stock_alerts, list_muted_alerts |
| **Portfolio** | get_portfolio_conviction, set_position, get_positions, close_position, get_portfolio_risk, get_rebalancing_signals, get_correlation_matrix, get_performance_attribution, export_portfolio_snapshot, set_target_allocation, get_target_allocation, delete_target_allocation |
| **Prediction Markets** | get_prediction_markets |
| **Summaries** | get_market_summary, generate_market_summary |
| **Telegram** | send_test_telegram, send_telegram_report, delete_telegram_report, send_alert_digest |
| **Feedback** | submit_feedback (→ Report channel only), get_feedback (deprecated — read channel directly) |
| **Operations** | get_data_freshness, get_source_health, get_rate_limit_status |
| **System** | get_system_health, get_global_log, get_tool_log, get_error_summary |

## Two Separate Telegram Channels

### Chat Channel (TELEGRAM_CHAT_ID) — User-Facing
For communicating with the user and sending analysis:
- HIGH/CRITICAL price alerts (from intelligence cycle)
- Morning briefing, evening summary, daily digest
- BCTC filing notifications
- Webhook bot command responses (/watchlist, /alerts, /briefing, /pnl)
- **NEVER send internal agent feedback or dev reports here**

### Report Channel (TELEGRAM_REPORT_ID) — Problems/Hotfix Only
For dev team and analysis team problem reports:
- `send_telegram_report` — report problems, request hotfix, flag bugs
- `submit_feedback` — submit improvement suggestions (report channel ONLY, never cross-posts to user)
- Tag recipients: `@team`, `@po`, `@dev`, `@qa`, `@ba`, `@architect`, `@market-analyst`
- Dev team reads the channel and acts on reports
- Used for hotfix sprint runs (System Improver → FIX NOW or SPRINT TASK)
- Review agent deletes reports when issues are fixed
- **NOT for user communication — problems and hotfix only**

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

## Agent Feedback Loop (via Report Channel — Problems/Hotfix Only)

```
Analysis team finds problems → submit_feedback / send_telegram_report
                                          ↓
                          Report Channel (TELEGRAM_REPORT_ID) — @po, @dev, @team
                                          ↓
                    ┌── @dev reads → FIX NOW (<20 lines): implement + test + push
                    │
                    └── @po reads → SPRINT TASK: PO → BA → Architect → PM → Dev → QA
                                          ↓
                                    Merged to main
                                          ↓
                              Review agent deletes resolved reports
```

**Important**: Feedback NEVER goes to the Chat Channel (user-facing). Only problems/hotfix reports go to the Report Channel.

Agents submit feedback via `submit_feedback` MCP tool:
- **News Scout**: cascade_rule_gap, trade_map_gap, sentiment_error, new_indicator
- **Market Watcher**: threshold_issue, sector_peer_issue, alert_quality
- **Alert Commander**: alert_quality, performance_issue
- **Report Analyzer**: data_extraction_error, trade_map_gap from BCTC
- **Digest Writer**: compiles weekly review from Report Channel problem reports
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
| Telegram fails | Check `.env` has TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID + TELEGRAM_REPORT_ID |
| SSC timeout | Normal — portal is slow. Nightly job retries automatically |
| OCR not working | Install: `brew install tesseract tesseract-lang poppler` |
| Errors in log | Clear: run `get_system_health` tool, errors auto-resolve |
| Tunnel down | Restart: `cloudflared tunnel run --token $CLOUDFLARE_TOKEN` |
