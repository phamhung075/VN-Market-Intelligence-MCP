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
Server auto-seeds watchlist from config, starts OCR for unprocessed PDFs. Tool count → `docs/data/tool-registry.json`.

Verify: `curl https://zenmidi.com/health` — `{"status":"ok","toolCount":N}`

### Step 2: Start Cloudflare Tunnel
```bash
source .env
cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TOKEN"
```
Permanent URL: `https://zenmidi.com/mcp`

### Step 3: Create 8 Agents in Claude Cowork

MCP connector URL: `https://zenmidi.com/mcp`

| Order | Agent | Schedule | File | Role |
|-------|-------|----------|------|------|
| 0 | **Unified Coordinator** | On-demand + Daily 22:00 VN + Sunday | `unified-agent.md` | Coordinate team + quality review + report problems |
| 1 | **News Scout** | Every hour | `01-news-scout.md` | Fetch news + legal/crisis detection + submit feedback on gaps |
| 2 | **BCTC Collector** | Daily 20:00 + 08:00 VN | `02-bctc-collector.md` | Track BCTC reports |
| 3 | **Report Analyzer** | Daily 21:00 + 09:00 VN | `03-report-analyzer.md` | Analyze financials + insider signals + feedback |
| 4 | **Market Watcher** | Hourly market hours | `04-market-watcher.md` | Track prices + supply chain + climate/energy + feedback |
| 5 | **Alert Commander** | Every hour | `05-alert-commander.md` | ONLY Telegram sender + alert quality + crisis/legal escalation |
| 6 | **Digest Writer** | Daily 22:30 + Sunday | `06-digest-writer.md` | Compile summaries + all domain tools for deep review |
| 7 | **QA Responder** | Every 12 min (reactive) | `07-qa-responder.md` | Answer /ask queue FIFO → MARKET channel |

### Step 4: Verify
- Telegram: "System online" at 08:55 Vietnam (03:55 France CET)
- Health: `curl https://zenmidi.com/health`

## MCP Tools

MCP tool count → `docs/data/tool-registry.json`. Full list → `.claude/knowledge/mcp-tools.md` or call `get_system_status` (reports live tool count).

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

### Vietnamese Language Rules

**CRITICAL**: All `send_telegram(channel="market")` messages MUST use proper Vietnamese with full diacritics (dấu). Never send without diacritics. Examples: "Cảnh báo giá", "Biến động mạnh", "Cổ phiếu tăng/giảm", "Ngành ngân hàng".
**BUG Channel** (`channel="bug"`): English OK for dev team reports.

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

## Cron Jobs

Scheduler file count → `docs/data/cron-registry.json`. Full schedule → `.claude/knowledge/cron-jobs.md`.

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
| 270 | SSC pipeline not downloading PDFs for VCB/VEA/FPT | FIXED | VPS BCTC proxy (task 1112): VPS pulls queue via `GET /api/bctc-fetch-queue`, downloads from SSC/HOSE/HNX/UPCOM, pushes via `POST /api/push-bctc-pdf` — commit 0ecca9b |
| 271 | incomeStatementExtractor: all income fields = 0 for VNM/FPT | FIXED | OCR look-ahead + first-large-number extraction + unit detection — commit c81a4d0 |
| 272 | balanceSheetExtractor: Total Assets off by 10^3 | FIXED | Multi-number extraction + look-ahead for OCR text — commit c81a4d0 |
| 273 | SSC Puppeteer crash loop / selector changed | FIXED | `disableSscPolling` flag added (task 1111); VPS proxy bypasses Puppeteer entirely |
| 274 | Price data stale from France server | FIXED | VPS Singapore proxy (systemd `Restart=always`) — commit c84a329 |
| 275 | Telegram env vars "not set" warning | FIXED | Stale logs from old instance — ignore |
| 276 | Polymarket CLOB 403 | MONITOR | Geo-blocked from France, circuit breaker handles it |
| 277 | weatherVn NCHMF 404 | MONITOR | External URL changed/down, not blocking core analysis |
| 278 | Kinh Dịch identical readings for all stocks | FIXED | All 6 haos jittered per-ticker — commit 067cb2f |
| 279 | LanceDB unavailable after restart | FIXED | Transient startup issue, resolves in 2-3 min |
| 280 | VCB -8% false alert (53,100 VND) | FIXED | Was test data, real price 57,700 VND |
| 281 | scanMarket 0 prices pre-market | NOT A BUG | Expected before 09:00 VN — market closed |
| 282 | get_sector_comparison "no such column: date" | FIXED | SQL fixed — commit af09eb8 |
| 283 | get_portfolio_conviction timeout | FIXED | Batch queries replace N+1 — commit 812e8fa |
| 284 | HNX/UPCOM TLS cert errors from VPS fetcher | FIXED | TLS cert bypass applied to VPS fetch-bctc.sh — commit e4c5383 |
| 285 | vn-price-fetch.service stale (price data 15 days old) | FIXED | Service restarted 2026-04-11 — both VPS services now active |

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
