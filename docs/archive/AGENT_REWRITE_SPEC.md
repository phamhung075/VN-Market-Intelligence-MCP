# Agent File Rewrite Specification

**Date**: 2026-04-03
**Reason**: Agent .md files are stale — missing supply chain tools, weather jobs, and have wrong tool counts/names.
**Goal**: Complete rewrite of all 9 agent files to match the actual running system.

---

## Current System State (ground truth)

### 58 MCP Tools (exact list from server)

#### Watchlist (4)
- `add_to_watchlist` — add stock with exchange, domain, thresholds
- `remove_from_watchlist` — remove stock
- `get_watchlist` — list all with prices
- `update_thresholds` — change alert thresholds

#### Financial Reports (4)
- `get_financial_summary` — show financial metrics for stock
- `compare_financials` — YoY/QoQ comparison
- `list_stored_pdfs` — list downloaded BCTC files
- `read_bctc_pdf` — extract text from PDF

#### Alerts (4)
- `get_alerts` — list alerts (type: system|price|all, default all)
- `mark_alert_read` — mark alert(s) read
- `get_analysis_history` — past analyses
- `get_alert_accuracy` — signal precision retrospective

#### Analysis (3)
- `fetch_and_analyze` — fetch news from 5 sources + analyze
- `run_impact_chain` — causal cascade engine
- `search_similar_context` — RAG semantic search

#### Market (2)
- `get_market_snapshot` — live prices from exchanges
- `get_patterns` — historical precedents

#### Macro (1)
- `get_macro_snapshot` — oil, gold, USD/VND, SBV rates

#### Compound Tools (2)
- `get_market_context` — watchlist+prices+macro+alerts+analysis in ONE call
- `get_bctc_full` — financial summary+comparison+sentiment in ONE call

#### Portfolio (7)
- `get_portfolio_conviction` — cross-signal dashboard
- `set_position` — record position
- `get_positions` — list with P&L
- `close_position` — mark closed
- `get_portfolio_risk` — VaR, max drawdown
- `get_rebalancing_signals` — buy/sell quantities
- `get_target_allocation` — target vs actual weights

#### Price Tools (3)
- `get_price_history` — N-day price history
- `set_price_alert` — stop-loss / take-profit
- `delete_price_alert` — cancel alert

#### Comparison & Sector (4)
- `compare_stocks` — side-by-side comparison
- `get_correlation_matrix` — Pearson correlation
- `get_sector_rotation` — money flow
- `get_sentiment_trend` — OLS slope

#### Prediction Markets (2)
- `get_prediction_markets` — Polymarket data
- `get_prediction_accuracy` — prediction signal precision

#### Earnings & Calendar (1)
- `get_earnings_calendar` — BCTC deadlines

#### Summaries (2)
- `get_market_summary` — read periodic summary
- `generate_market_summary` — write periodic summary

#### Performance (1)
- `get_performance_attribution` — signal P&L attribution

#### Supply Chain (1)
- `get_supply_chain_exposure` — shipping indices + stock impact + disruption events

#### Telegram (2)
- `send_telegram` — send to chat|report channel
- `send_alert_digest` — nightly alert digest

#### System & Operations (3)
- `get_system_status` — DB+sources+freshness+errors in ONE call
- `get_rate_limit_status` — API throttle state
- `submit_feedback` — report problem to Dev Team

#### Agent Communication (4)
- `post_agent_signal` — send signal to another agent
- `get_agent_signals` — read signals addressed to you
- `record_signal_outcome` — write back fired|suppressed|confirmed|false_positive
- `get_signal_effectiveness` — precision per signal type

#### Dev Team Tools (4)
- `claim_telegram_report` — ownership lock
- `read_telegram_reports` — read reports from DB
- `process_telegram_report` — mark processed
- `log_fix` — record fix in changelog

#### Observability (2)
- `get_recent_fixes` — check before re-reporting
- `get_cascade_metrics` — rule hit counts + dead rules

#### Alert Management (2)
- `list_alert_rules` — list custom rules (read-only)
- `manage_alert_mute` — mute/unmute (action param)

### 19 Cron Jobs

| Time | Job | What |
|------|-----|------|
| */15 min | intelligenceCycle | Main engine: poll→SSC→prices→chain→alerts |
| */15 min | userRequestCheck | Process /ask questions |
| */30 min | predictionMarketPoll | Polymarket fetch+store+detect |
| */6h | weatherCheck | NCHMF+ENSO+reservoir+climate signals |
| 06:00 UTC M-F | franceSummary | 07:00 CET wake-up summary for user |
| 08:00 VN M-F | morningBriefing | Full morning briefing |
| 09:00 VN M-F | marketOpen | Market open scan |
| 15:30 VN M-F | marketClose | Market close scan |
| 20:00 VN daily | sscCheck | SSC BCTC check |
| 21:00 VN M-F | alertDigest | Nightly digest |
| 22:00 VN M-F | eveningSummary | Evening summary |
| 22:30 VN daily | dailySummary | Daily summary |
| 22:30 VN Sunday | patternWatch | Weekly pattern watch |
| 23:00 VN daily | dataAuditDaily | Data integrity check |
| 23:00 VN Sunday | weeklyPortfolioReport | Weekly P&L+allocation |
| 23:00 VN Sunday | weeklySummary | Weekly summary |
| 01:00 VN Sunday | dataAuditWeekly | Deep weekly audit |
| 07:00 UTC Sunday | devTeamHeartbeat | Dev Team health status |
| 08:00 UTC Sunday | predictionOutcome | Prediction validation |

### Telegram Bot Commands (user)
- `/watchlist` — list stocks + prices
- `/price VCB` — single stock price
- `/alerts` — last 5 alerts
- `/briefing` — condensed briefing
- `/health` — system status
- `/pnl` — portfolio P&L
- `/ask <question>` — AI answer within 15 min
- `/why <stock>` — why did stock move
- `/report <description>` — report bug to Dev Team
- `/fix <description>` — urgent bug report
- `/help` — list commands

### Tools that DO NOT EXIST (never call these)
get_system_health, get_source_health, get_data_freshness, get_error_summary,
send_test_telegram, send_telegram_report, delete_telegram_report,
mute_stock_alerts, unmute_stock_alerts, get_price_alerts,
trigger_alert_check, export_portfolio_snapshot, search_stocks,
get_feedback, get_global_log, get_tool_log, run_daily_briefing,
fetch_ssc_reports, add_alert_rule, delete_alert_rule, set_target_allocation

---

## Agent Cycle Patterns

### Standard Opening (ALL agents)
```
Step 0: Call get_agent_signals(agent="{agent-name}")
Step 1: Call get_market_context(hours_back=24)
```

### Before Reporting (ALL agents)
```
Before submit_feedback:
1. Call get_recent_fixes(10)
2. If issue appears → SKIP
```

### After Signal Action (Alert Commander)
```
After acting on a signal:
Call record_signal_outcome(signal_id, outcome, detail?)
```
