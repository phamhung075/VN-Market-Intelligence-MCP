# AI Team Setup Guide

## Prerequisites
1. MCP server running: `bun run src/index.ts`
2. Telegram configured in `.env` (bot token + chat ID + report ID)
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
- Edit `mcp.config.json` for permanent changes
- Or use MCP tools at runtime: `add_to_watchlist` / `remove_from_watchlist`
- Runtime changes persist in SQLite — they won't be overwritten by config

**All agents read watchlist dynamically** via `get_watchlist` — no hardcoded stock codes.

### .env (secrets only)
```
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_INFO_MARKET_GROUP_ID=your_chat_id        # User-facing: alerts, briefings, analysis
TELEGRAM_REPORT_BUG_CHANNEL_ID=your_report_id    # Problems/hotfix only: dev team reports
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
Server auto-seeds watchlist from config, starts OCR for unprocessed PDFs, registers 75 tools.

Verify: `curl https://zenmidi.com/health` — `{"status":"ok","toolCount":68}`

### Step 2: Start Cloudflare Tunnel
```bash
source .env
cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TOKEN"
```
Permanent URL: `https://zenmidi.com/mcp`

### Step 3: Create 7 Agents in Claude Cowork

MCP connector URL: `https://zenmidi.com/mcp`

| Order | Agent | Schedule | File | Role |
|-------|-------|----------|------|------|
| 0 | **Unified Coordinator** | On-demand + Daily 22:00 VN + Sunday | `unified-agent.md` | Coordinate team + quality review + report problems |
| 1 | **News Scout** | Every hour | `01-news-scout.md` | Fetch news + legal/crisis detection + submit feedback on gaps |
| 2 | **BCTC Collector** | Daily 20:00 + 08:00 VN | `02-bctc-collector.md` | Track BCTC reports |
| 3 | **Report Analyzer** | Daily 21:00 + 09:00 VN | `03-report-analyzer.md` | Analyze financials + insider signals + feedback |
| 4 | **Market Watcher** | Hourly market hours | `04-market-watcher.md` | Track prices + supply chain + climate/energy + feedback |
| 5 | **Alert Commander** | Every hour | `05-alert-commander.md` | ONLY Telegram sender + alert quality + crisis/legal escalation |
| 6 | **Digest Writer** | Daily 22:30 + Sunday | `06-digest-writer.md` | Compile summaries + all 11 new domain tools for deep review |

### Step 4: Verify
- Telegram: "System online" at 08:55 Vietnam (03:55 France CET)
- Health: `curl https://zenmidi.com/health`

## 74 MCP Tools Available (Sprint 046)

| Category | Tools |
|----------|-------|
| **Watchlist** | add_to_watchlist, remove_from_watchlist, get_watchlist, update_thresholds |
| **News** | fetch_and_analyze, run_impact_chain, search_similar_context |
| **Market** | get_market_context, get_macro_snapshot, get_patterns, get_price_history, get_sector_rotation, compare_stocks, get_sentiment_trend |
| **Reports** | get_bctc_full, get_financial_summary, compare_financials, list_stored_pdfs, read_bctc_pdf, get_earnings_calendar |
| **Alerts** | get_alerts (type: "system"\|"price"\|"all"), mark_alert_read, set_price_alert, delete_price_alert, get_alert_accuracy, list_alert_rules, manage_alert_mute |
| **Portfolio** | get_portfolio_conviction, set_position, get_positions, close_position, get_portfolio_risk, get_rebalancing_signals, get_correlation_matrix, get_performance_attribution, get_target_allocation |
| **Prediction** | get_prediction_markets, get_prediction_accuracy |
| **Summaries** | get_market_summary, generate_market_summary |
| **Telegram** | send_telegram, send_alert_digest, claim_telegram_report, read_telegram_reports, process_telegram_report |
| **Feedback** | submit_feedback (Report channel only) |
| **Operations** | get_rate_limit_status |
| **System** | get_system_status |
| **Dev Team** | log_fix, get_recent_fixes |
| **Agent Bus** | post_agent_signal, get_agent_signals |
| **Observability** | record_signal_outcome, get_signal_effectiveness, get_cascade_metrics |
| **Capital Protection (Sprint 039)** | get_legal_risk_signals, get_policy_signals, get_bond_maturity_calendar |
| **Macro Catalyst (Sprint 040)** | get_public_contracts, get_credit_flow_signal, get_insider_signals |
| **Supply Chain (Sprint 041)** | get_supply_chain_exposure |
| **Climate + Energy (Sprint 042)** | get_climate_risk_signals, get_energy_grid_signals |
| **Crisis Radar (Sprint 043)** | get_crisis_early_warning |
| **Pharma Radar (Sprint 044)** | get_pharma_signals |

### New Tools (Sprint 039-044 vs Sprint 038)

| Sprint | Tool | Description |
|--------|------|-------------|
| 039 | `get_legal_risk_signals` | Detect prosecution, tax penalties, court orders affecting stocks |
| 039 | `get_policy_signals` | Government policy changes (Cong Bao) affecting sectors |
| 039 | `get_bond_maturity_calendar` | Corporate bond (TPDN) maturity calendar — default risk |
| 040 | `get_public_contracts` | Government contracts from muasamcong.mof.gov.vn — CapEx signals |
| 040 | `get_credit_flow_signal` | Banking credit flow to real estate and sectors |
| 040 | `get_insider_signals` | SSC insider trading data (leadership buy/sell) |
| 041 | `get_supply_chain_exposure` | Baltic Dry Index, container rates, HPG/VNM/GMD impact |
| 042 | `get_climate_risk_signals` | NCHMF typhoon/El Nino affecting REE/GEG/IDC/BVH |
| 042 | `get_energy_grid_signals` | Reservoir levels, power shortage affecting energy stocks |
| 043 | `get_crisis_early_warning` | Velocity-based crisis detection (5x mention spike) + reputation |
| 044 | `get_pharma_signals` | DAV drug approvals + outbreak detection affecting DHG/IMP/DBD |

## Two Separate Telegram Channels

### MARKET Channel (TELEGRAM_INFO_MARKET_GROUP_ID) — User-Facing
For communicating with the user and sending analysis:
- HIGH/CRITICAL price alerts (from intelligence cycle)
- Morning briefing, evening summary, daily digest
- BCTC filing notifications
- Webhook bot command responses (/watchlist, /alerts, /briefing, /pnl)
- **NEVER send internal agent feedback or dev reports here**

### BUG Channel (TELEGRAM_REPORT_BUG_CHANNEL_ID) — Problems/Hotfix Only
For dev team and analysis team problem reports:
- `send_telegram(channel="bug", message=...)` — report problems, request hotfix, flag bugs
- `submit_feedback` — submit improvement suggestions (report channel ONLY, never cross-posts to user)
- Tag recipients: `@team`, `@po`, `@dev`, `@qa`, `@ba`, `@architect`, `@market-analyst`
- Dev team reads the channel and acts on reports
- Used for hotfix sprint runs (System Improver -> FIX NOW or SPRINT TASK)
- Review agent deletes reports when issues are fixed
- **NOT for user communication — problems and hotfix only**

### Vietnamese Language Rules (ALL Telegram messages)

**CRITICAL**: All messages sent via `send_telegram(channel="market")` MUST use proper Vietnamese with full diacritics (dấu). The user reads Vietnamese — never send without diacritics.

| Wrong (no diacritics) | Correct (with diacritics) |
|----------------------|--------------------------|
| Canh bao gia | Cảnh báo giá |
| Bien dong manh | Biến động mạnh |
| Tin quan trong | Tin quan trọng |
| Tom tat buoi toi | Tóm tắt buổi tối |
| Co phieu tang/giam | Cổ phiếu tăng/giảm |
| Nganh ngan hang | Ngành ngân hàng |
| Bat dong san | Bất động sản |
| Gia dau tang | Giá dầu tăng |
| Khoi luong giao dich | Khối lượng giao dịch |
| Doanh thu thuan | Doanh thu thuần |

**BUG Channel** (`channel="bug"`): English is OK for dev team reports (technical content).

### 11 Telegram Bot Commands (User -> Chat Channel)
- `/watchlist` — list current tracked stocks
- `/price` — show current prices for watchlist
- `/alerts` — show recent HIGH/CRITICAL alerts
- `/briefing` — trigger morning briefing on demand
- `/health` — system health status
- `/pnl` — show current portfolio P&L
- `/ask <question>` — ask AI a market question — answered within 15 min
- `/why <stock>` — shorthand for "Why did X move today?" — answered within 15 min
- `/report <description>` — report a bug to Dev Team (medium priority)
- `/fix <description>` — report an urgent bug to Dev Team (high priority)
- `/help` — list all available commands

## 20 Cron Jobs

| Time | Job | Description |
|------|-----|-------------|
| */10 min (02:00-08:59 UTC M-F) | vpsProxyWatchdog | Observe market_prices freshness; alert Chat if >5 min stale (30-min cooldown, no SSH) |
| */15 min | intelligenceCycle | Main engine: news + prices + chain + alerts |
| */15 min | userRequestCheck | Answer /ask + /why Telegram commands |
| */30 min | predictionMarketPoll | Polymarket fetch + signal detection |
| */6h | weatherCheck | Typhoon season climate check |
| 06:00 UTC M-F | franceSummary | France wake-up digest (07:00 CET / 13:00 VN) |
| 08:00 VN M-F | morningBriefing | Daily briefing: macro + conviction + P&L |
| 09:00 VN M-F | marketOpen | Market open scan + price alerts |
| 15:30 VN M-F | marketClose | Market close scan |
| 20:00 VN daily | sscCheck | SSC nightly BCTC check |
| 21:00 VN M-F | alertDigest | Nightly alert digest |
| 22:00 VN M-F | eveningSummary | Evening market summary |
| 22:30 VN daily | dailySummary | Daily summary generation |
| 22:30 VN Sunday | patternWatch | Weekly pattern watch |
| 23:00 VN daily | dataAuditDaily | Data integrity audit |
| 23:00 VN Sunday | weeklyPortfolioReport + weeklySummary | Portfolio + weekly summary |
| 01:00 VN Sunday | dataAuditWeekly | Deep weekly audit |
| 07:00 UTC Sunday | devTeamHeartbeat | Dev Team health + observability |
| 08:00 UTC Sunday | predictionOutcome | Prediction signal evaluation |
| 1st monthly 06:00 VN | davPharmacyCheck | DAV drug approval check |

## Agent Signal Bus

Agents can send signals to each other via `post_agent_signal` / `get_agent_signals`. Each agent checks for signals at the START of every cycle.

- Complete signal type table (urgent_news, price_anomaly, cross_validate, suppress, legal_risk, crisis_velocity, and more) → `.claude/knowledge/mcp-tools.md#inter-agent-signal-types`

### Signal Bus Rules
- `ttl_minutes` default is 120 min — signals expire automatically
- `get_agent_signals` marks unread signals as read on retrieval
- `to_agent="all"` broadcasts to every agent (used for suppress signals)
- Maximum payload size: keep `detail` under 500 chars

## Agent Cooperation Flow

```
06:00 UTC  Server: France wake-up summary -> Chat Channel (franceSummaryJob) — 13:00 VN
07:00 UTC  Server: Dev Team heartbeat check -> Sunday only (devTeamHeartbeatJob)
07:00 VN   News Scout monitors pre-market news + legal/crisis signals + feedback
*/15 UTC   Server: user_requests check -> answer /ask + /why within 15 min
08:00 UTC  Server: prediction outcome evaluation -> Sunday only
08:55 VN   Alert Commander sends "He thong online"
09:00 VN   Market Watcher starts hourly price + supply chain + climate tracking
09:00-15:30  All agents at full frequency
15:30 VN   Market closes -> Market Watcher slows
15:45 VN   Alert Commander sends end-of-day summary + alert quality feedback
20:00 VN   Server's SSC nightly job downloads new BCTC PDFs
20:00 VN   BCTC Collector checks what's available
21:00 VN   Report Analyzer reads financial data + insider signals + feedback
22:00 VN   Unified Coordinator daily review -> triage + report to Dev Team
22:30 VN   Digest Writer sends daily summary + weekly review (Sunday)
```

## Agent Feedback Loop (via BUG Channel — Problems/Hotfix Only)

```
Analysis team finds problems -> submit_feedback / send_telegram(channel="bug")
                                          |
                          BUG Channel (TELEGRAM_REPORT_BUG_CHANNEL_ID) — @po, @dev, @team
                                          |
                    +-- @dev reads -> FIX NOW (<20 lines): implement + test + push
                    |
                    +-- @po reads -> SPRINT TASK: PO -> BA -> Architect -> PM -> Dev -> QA
                                          |
                                    Merged to main
                                          |
                              Review agent deletes resolved reports
```

**Important**: Feedback NEVER goes to the Chat Channel (user-facing). Only problems/hotfix reports go to the BUG Channel.

## Known Issues — DO NOT RE-REPORT

Before submitting feedback or a report, check this list. If the issue is listed here, DO NOT report it again. The Dev Team is already aware.

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 270 | SSC pipeline not downloading PDFs for VCB/VEA/FPT | BACKLOG | fetchParseAndStoreBctc needs pdfUrl passthrough — SPRINT needed |
| 271 | incomeStatementExtractor: all income fields = 0 for VNM/FPT | BACKLOG | Regex patterns don't match real BCTC PDF formats — SPRINT needed |
| 272 | balanceSheetExtractor: Total Assets off by 10^7 | BACKLOG | triệu đồng not converted to tỷ — SPRINT needed |
| 273 | SSC Puppeteer crash loop / selector changed | BACKLOG | Needs mutex + updated selectors — SPRINT needed |
| 274 | Price data stale from France server | FIXED | VPS Singapore proxy rebuilt with systemd (`vn-price-fetch.service`, `Restart=always`) — commit c84a329. VPS cron removed; schedule lives inside `fetch-prices-loop.sh`. MCP watchdog (`vpsProxyWatchdogJob`) alerts Chat Channel if `market_prices` is >5 min stale. |
| 275 | Telegram env vars "not set" warning | FIXED | Works via MCP. Old server instance logs still visible to agents. Ignore "TELEGRAM_BOT_TOKEN not set" warnings — they are stale |
| 276 | Polymarket CLOB 403 | MONITOR | Geo-blocked from France. Circuit breaker handles it. Not fixable by code |
| 277 | weatherVn NCHMF 404 | MONITOR | External URL changed/down. Not blocking core analysis |
| 278 | Kinh Dịch identical readings for all stocks | BACKLOG | Missing price data causes same default hào encoding — needs per-stock differentiation |
| 279 | LanceDB unavailable after restart | FIXED | Transient startup issue, resolves within 2-3 min. Ignore if uptime > 5 min |
| 280 | VCB -8% false alert (53,100 VND) | FIXED | Was test data from dev team. Real price 57,700 VND. Alert already overwritten |
| 281 | scanMarket 0 prices pre-market | NOT A BUG | 0 prices before 09:00 VN (02:00 UTC) is expected — market is closed |
| 282 | get_sector_comparison "no such column: date" | FIXED | SQL query fixed (commit af09eb8) |
| 283 | get_portfolio_conviction timeout | BACKLOG | Needs query optimization or caching for large stock lists |

**Rules for agents:**
- **FIXED** → issue is resolved, stop reporting it
- **BACKLOG** → Dev Team knows, waiting for SPRINT. Only report if behavior CHANGED (new symptoms)
- **MONITOR** → external/infra issue, not fixable by code. Never report
- **NOT A BUG** → expected behavior, never report

**How to check before reporting:** Call `get_recent_fixes` to see what the Dev Team has already fixed. If your issue matches a recent fix, do NOT report it.

## Key Architecture Rules

1. **Watchlist is dynamic** — all agents call `get_watchlist`, never hardcode stocks
2. **BCTC Collector does NOT call `fetch_ssc_reports`** — too heavy (Puppeteer). Server handles downloads via nightly cron.
3. **Report Analyzer reads from DB** — uses `get_financial_summary` + `compare_financials`, NOT `read_bctc_pdf` each cycle
4. **Only `read_bctc_pdf` for NEW files** — text is cached in SQLite after background OCR
5. **Only Alert Commander sends Telegram** — max 10 messages/day
6. **OCR runs in background** on server startup — processes unextracted PDFs automatically

## Stock Classification
- Stock classification (VNM/FPT/VCB/HPG/VEA, sectors, trade exposure, sector peers) → `.claude/knowledge/portfolio-schema.md`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server timeout | Kill zombie Chrome: `pkill -9 -f "Google Chrome.*no-sandbox"` then restart |
| Watchlist empty | Auto-seeds on restart from mcp.config.json. Check `market.watchlist` |
| Telegram fails | Check `.env` has TELEGRAM_BOT_TOKEN + TELEGRAM_INFO_MARKET_GROUP_ID + TELEGRAM_REPORT_BUG_CHANNEL_ID |
| SSC timeout | Normal — portal is slow. Nightly job retries automatically |
| OCR not working | Install: `brew install tesseract tesseract-lang poppler` |
| Errors in log | Run `get_system_status` tool — shows DB, SOURCES, FRESHNESS, ERRORS sections |
| Tunnel down | Restart: `cloudflared tunnel run --token $CLOUDFLARE_TOKEN` |
