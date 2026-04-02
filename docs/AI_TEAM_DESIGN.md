# AI Team Design — VN Market Intelligence

## Overview

Two autonomous teams work in parallel to continuously improve the system:

```
┌─────────────────────────────────────────────────────────────┐
│  ANALYSIS TEAM (Claude Cowork — 7 agents, cloud)            │
│  Serves the user with investment intelligence               │
│                                                              │
│  → Chat Channel (TELEGRAM_CHAT_ID) = user-facing            │
│  → Report Channel (TELEGRAM_REPORT_ID) = problems only      │
└────────────────────────────┬────────────────────────────────┘
                             │ Report Channel
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  DEV TEAM (Claude Code CLI — local cron, every 1 hour)      │
│  Reads problems → auto-fixes → pushes to main               │
│                                                              │
│  → Auto-merge to main + Telegram summary of changes          │
│  → Updates agent .md files → notifies user to refresh Cowork │
│  → Updates CLAUDE.md, TASKS.md, SPRINT_GOAL.md               │
└─────────────────────────────────────────────────────────────┘
```

## Two Telegram Channels

| Channel | Env Var | Purpose | Who Writes | Who Reads |
|---------|---------|---------|------------|-----------|
| **Chat** | `TELEGRAM_CHAT_ID` | User-facing: alerts, briefings, analysis | Alert Commander, Digest Writer, Dev Team (fix summaries) | User |
| **Report** | `TELEGRAM_REPORT_ID` | Problems/hotfix only | All analysis agents (via `submit_feedback`) | Dev Team cron (every hour) |

**Rules:**
- Chat Channel: NEVER send internal dev reports or agent feedback
- Report Channel: NEVER send user-facing analysis — problems/hotfix ONLY
- Dev Team deletes reports after processing (keeps channel clean)

## Analysis Team (Claude Cowork)

7 agents running on Claude Cowork cloud. Each connects to MCP server via `https://zenmidi.com/mcp`.

| # | Agent | Schedule | Role | File |
|---|-------|----------|------|------|
| 0 | Setup | Once | Seed watchlist | `00-setup-watchlist.md` |
| 1 | News Scout | Hourly | Fetch news, sentiment, impact chains | `01-news-scout.md` |
| 2 | BCTC Collector | Daily 20:00+08:00 VN | Track BCTC report availability | `02-bctc-collector.md` |
| 3 | Report Analyzer | Daily 21:00+09:00 VN | Analyze financials, validate data | `03-report-analyzer.md` |
| 4 | Market Watcher | Hourly (market hours) | Track prices, detect anomalies | `04-market-watcher.md` |
| 5 | Alert Commander | Hourly | ONLY agent that sends to Chat Channel | `05-alert-commander.md` |
| 6 | Digest Writer | Daily 22:30 + Sunday | Daily/weekly summaries | `06-digest-writer.md` |
| 7 | System Improver | Daily 22:00 VN + Sunday | Quality review, report problems | `07-system-improver.md` |

**Coordinator**: `unified-agent.md` — analysis coordination only, no dev chain.

### Data Flow

```
News Scout  ──→ RAG + SQLite ──→ Alert Commander ──→ Chat Channel (user)
                     ↓                   ↑
Market Watcher ──→ prices + signals ─────┘
                     ↓                   ↑
BCTC Collector ──→ financial_reports ────┘
                     ↓
Report Analyzer ──→ market_summaries ──→ Digest Writer ──→ Chat Channel (user)
                     ↓
System Improver ──→ submit_feedback ──→ Report Channel (dev team)
```

### Problem Reporting Flow

When any analysis agent finds an issue:
1. Call `submit_feedback(category, title, detail, priority, to="@dev")`
2. Message goes to Report Channel (TELEGRAM_REPORT_ID) ONLY
3. Dev Team reads it within 1 hour
4. Dev Team fixes → commits → pushes → deletes the report
5. Server auto-reloads via `bun --hot`

## Dev Team (Claude Code CLI Cron)

Runs locally every 1 hour via Claude Code CLI. See `dev-team-cron.md` for full spec.

### Loop

```
1. Check Report Channel → empty? → exit (low cost)
2. Read unprocessed reports
3. Triage: FIX NOW (<20 lines) or SPRINT TASK
4. FIX NOW: fix → test → commit → push → Telegram summary
5. SPRINT TASK: PO → BA → Architect → PM → Dev → QA chain
6. Update docs: CLAUDE.md, TASKS.md, SPRINT_GOAL.md, agent .md files
7. If agent files changed → notify user to refresh Cowork
8. Server auto-reloads via bun --hot
```

### Git Rules
- Always commit each change separately (user can rollback)
- Always push to main (auto-merge)
- Always send Telegram summary of what changed
- Never amend commits — create new ones

### Cost Optimization
- Exit immediately if no new reports (1 API call)
- FIX NOW before SPRINT TASK (faster, cheaper)
- Max 1 sprint per loop (avoid token explosion)

## MCP Server

- 62 tools (Sprint 034)
- Bun with `--hot` flag for live code reload
- SQLite + LanceDB for data
- Telegram Bot API for notifications
- Cloudflare tunnel for public access

### Scheduled Jobs (server-side)

| Time | Job | What |
|------|-----|------|
| Every 15 min | Intelligence Cycle | News → SSC → Prices → Chain → Alerts |
| Every 30 min | Prediction Markets | Polymarket fetch → signals |
| 08:00 M-F | Morning Briefing | Macro + alerts + P&L |
| 09:00/15:30 M-F | Market Scan | Open/close scan + price alerts |
| 20:00 daily | SSC Check | BCTC filing check |
| 21:00 M-F | Alert Digest | Nightly alert summary |
| 22:00 M-F | Evening Summary | Daily market summary |
| 22:30 Sunday | Pattern Watch | Weekly pattern analysis |
| 23:00 Sunday | Weekly Report | Portfolio P&L + drift |

## 62 MCP Tools (Sprint 034)

| Category | Count | Tools |
|----------|-------|-------|
| Watchlist | 4 | add_to_watchlist, remove_from_watchlist, get_watchlist, update_thresholds |
| News | 4 | fetch_and_analyze, run_impact_chain, search_similar_context, get_analysis_history |
| Market | 8 | get_market_snapshot, get_macro_snapshot, get_patterns, get_price_history, get_sector_rotation, search_stocks, compare_stocks, get_sentiment_trend |
| Reports | 6 | fetch_ssc_reports, get_financial_summary, compare_financials, list_stored_pdfs, read_bctc_pdf, get_earnings_calendar |
| Alerts | 14 | get_alerts, mark_alert_read, run_daily_briefing, trigger_alert_check, set_price_alert, get_price_alerts, delete_price_alert, get_alert_accuracy, add_custom_alert, list_custom_alerts, delete_custom_alert, mute_stock_alerts, unmute_stock_alerts, list_muted_alerts |
| Portfolio | 12 | get_portfolio_conviction, set_position, get_positions, close_position, get_portfolio_risk, get_rebalancing_signals, get_correlation_matrix, get_performance_attribution, export_portfolio_snapshot, set_target_allocation, get_target_allocation, delete_target_allocation |
| Prediction | 1 | get_prediction_markets |
| Summaries | 2 | get_market_summary, generate_market_summary |
| Telegram | 4 | send_test_telegram, send_telegram_report, delete_telegram_report, send_alert_digest |
| Feedback | 2 | submit_feedback, get_feedback (deprecated) |
| Operations | 3 | get_data_freshness, get_source_health, get_rate_limit_status |
| System | 4 | get_system_health, get_global_log, get_tool_log, get_error_summary |

## Sprint 035b — Pending Code Tasks

These MCP tools need to be built for the dev team cron to work:

| Tool | Purpose |
|------|---------|
| `read_telegram_reports` | Read unprocessed reports from SQLite `telegram_reports` table |
| `process_telegram_report` | Mark report as processed + delete from Telegram |

Infrastructure:
- `telegram_reports` SQLite table (store sent reports with message_id, text, status)
- Webhook registration for Report Channel (catch incoming human messages)
