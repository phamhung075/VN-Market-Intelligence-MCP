# MCP Tools — Complete Surface

**When to read this file:** When you need to know which MCP tools are available, which have been renamed/removed, or which tools each analysis agent should use. Load only when your current task involves tool selection, agent rewriting, or system capability review.

---

## Current Tool Count

78 MCP tools as of Sprint 054 (Task 1078). Verify live: `curl -s http://127.0.0.1:3000/health | jq .toolCount`

---

## Complete Tool List

### Watchlist (4)
`add_to_watchlist`, `remove_from_watchlist`, `get_watchlist`, `update_thresholds`

### Financial Reports (4)
`get_financial_summary`, `compare_financials`, `list_stored_pdfs`, `read_bctc_pdf`

### Alerts (4)
`get_alerts` (type: system|price|all), `mark_alert_read`, `get_analysis_history`, `get_alert_accuracy`

### Analysis (3)
`fetch_and_analyze`, `run_impact_chain`, `search_similar_context`

### Market (2)
`get_market_snapshot`, `get_patterns`

### Macro (1)
`get_macro_snapshot`

### Compound (2)
`get_market_context`, `get_bctc_full`

### Portfolio (7)
`get_portfolio_conviction`, `set_position`, `get_positions`, `close_position`, `get_portfolio_risk`, `get_rebalancing_signals`, `get_target_allocation`

### Price (3)
`get_price_history`, `set_price_alert`, `delete_price_alert`

### Comparison & Sector (4)
`compare_stocks`, `get_correlation_matrix`, `get_sector_rotation`, `get_sentiment_trend`

### Sector Context (2)
`get_sector_comparison`, `get_open_chain_findings`

### Kinh Dich (3)
`get_kinhdich_reading`, `get_market_hexagram`, `run_hexagram_backtest`, `get_transition_probabilities`

### Prediction Markets (2)
`get_prediction_markets`, `get_prediction_accuracy`

### Earnings (1)
`get_earnings_calendar`

### Summaries (2)
`get_market_summary`, `generate_market_summary`

### Performance (1)
`get_performance_attribution`

### Telegram (2)
`send_telegram` (channel: market|work|bug), `send_alert_digest`

### System & Ops (3)
`get_system_status`, `get_rate_limit_status`, `submit_feedback`

### Agent Communication (4)
`post_agent_signal`, `get_agent_signals`, `record_signal_outcome`, `get_signal_effectiveness`

### Dev Team (4)
`claim_telegram_report`, `read_telegram_reports`, `process_telegram_report`, `log_fix`

### Observability (2)
`get_recent_fixes`, `get_cascade_metrics`

### Alert Management (2)
`list_alert_rules`, `manage_alert_mute`

### Capital Protection (3)
`get_legal_risk_signals`, `get_policy_signals`, `get_bond_maturity_calendar`

### Macro Catalyst (3)
`get_public_contracts`, `get_credit_flow_signal`, `get_insider_signals`

### Supply Chain (1)
`get_supply_chain_exposure`

### Climate + Energy (2)
`get_climate_risk_signals`, `get_energy_grid_signals`

### Crisis Radar (1)
`get_crisis_early_warning`

### Pharma Radar (1)
`get_pharma_signals`

### User Requests (2)
`get_user_requests`, `mark_user_request_answered`

### Ask Queue (2)
`get_pending_ask_questions`, `answer_ask_question`

---

## Renamed/Removed Tools — CRITICAL

These old names DO NOT EXIST:

| OLD (NEVER use) | NEW (ALWAYS use) |
|-----------------|------------------|
| `get_system_health` | `get_system_status` |
| `get_source_health` | `get_system_status` (merged) |
| `get_data_freshness` | `get_system_status` (merged) |
| `get_error_summary` | `get_system_status` (merged) |
| `send_test_telegram` | `send_telegram(channel="market")` |
| `send_telegram_report` | `send_telegram(channel="bug")` |
| `delete_telegram_report` | absorbed into `process_telegram_report` |
| `mute_stock_alerts` | `manage_alert_mute(action="mute")` |
| `unmute_stock_alerts` | `manage_alert_mute(action="unmute")` |
| `get_price_alerts` | `get_alerts(type="price")` |

Removed entirely:
`get_feedback`, `get_global_log`, `get_tool_log`, `run_daily_briefing`,
`search_stocks`, `fetch_ssc_reports`, `trigger_alert_check`,
`export_portfolio_snapshot`, `add_alert_rule`, `delete_alert_rule`,
`set_target_allocation`

---

## Which Tools Each Agent Should Use

### News Scout (01)
`get_agent_signals`, `get_market_context`, `fetch_and_analyze`, `run_impact_chain`,
`search_similar_context`, `get_prediction_markets`, `get_rate_limit_status`,
`post_agent_signal`, `get_recent_fixes`, `submit_feedback`,
`get_legal_risk_signals`, `get_crisis_early_warning`

### BCTC Collector (02)
`get_agent_signals`, `get_market_context`, `get_earnings_calendar`, `get_bctc_full`,
`list_stored_pdfs`, `send_telegram`, `get_recent_fixes`, `submit_feedback`

### Report Analyzer (03)
`get_agent_signals`, `get_market_context`, `get_bctc_full`, `compare_stocks`,
`get_sentiment_trend`, `get_sector_comparison`, `get_kinhdich_reading`,
`post_agent_signal`, `get_open_chain_findings`, `get_recent_fixes`, `submit_feedback`,
`generate_market_summary`, `get_legal_risk_signals`, `get_insider_signals`

### Market Watcher (04)
`get_agent_signals`, `get_market_context`, `get_price_history`, `get_patterns`,
`get_sector_rotation`, `get_sector_comparison`, `get_kinhdich_reading`,
`get_market_hexagram`, `get_supply_chain_exposure`, `get_alerts(type="price")`,
`get_positions`, `get_portfolio_risk`, `compare_stocks`, `get_sentiment_trend`,
`get_open_chain_findings`, `post_agent_signal`, `manage_alert_mute`,
`get_recent_fixes`, `submit_feedback`,
`get_energy_grid_signals`, `get_climate_risk_signals`, `get_crisis_early_warning`

### Alert Commander (05) — ONLY sender to MARKET channel
`get_agent_signals`, `get_system_status`, `get_market_context`, `get_alerts(type="all")`,
`mark_alert_read`, `send_telegram(channel="market")`, `send_alert_digest`,
`record_signal_outcome`, `get_alert_accuracy`, `manage_alert_mute`, `list_alert_rules`,
`post_agent_signal`, `get_recent_fixes`, `submit_feedback`, `delete_price_alert`,
`get_kinhdich_reading`, `get_legal_risk_signals`, `get_crisis_early_warning`

### Digest Writer (06)
`get_agent_signals`, `get_market_context`, `get_market_summary`, `generate_market_summary`,
`get_bctc_full`, `compare_financials`, `get_macro_snapshot`, `get_portfolio_conviction`,
`get_correlation_matrix`, `get_alert_accuracy`, `get_performance_attribution`,
`get_portfolio_risk`, `get_rebalancing_signals`, `get_sector_rotation`,
`get_sector_comparison`, `get_earnings_calendar`, `get_signal_effectiveness`,
`get_cascade_metrics`, `get_prediction_accuracy`, `get_supply_chain_exposure`,
`get_kinhdich_reading`, `get_market_hexagram`, `run_hexagram_backtest`,
`get_transition_probabilities`, `get_open_chain_findings`,
`send_telegram(channel="market")`, `get_recent_fixes`, `submit_feedback`,
`get_legal_risk_signals`, `get_policy_signals`, `get_bond_maturity_calendar`,
`get_public_contracts`, `get_credit_flow_signal`, `get_insider_signals`,
`get_climate_risk_signals`, `get_energy_grid_signals`,
`get_crisis_early_warning`, `get_pharma_signals`

### Unified Coordinator
`get_agent_signals`, `get_system_status`, `get_market_context`, `get_macro_snapshot`,
`get_alerts`, `get_prediction_markets`, `get_sentiment_trend`, `get_positions`,
`get_portfolio_conviction`, `get_portfolio_risk`, `get_correlation_matrix`,
`get_rebalancing_signals`, `get_performance_attribution`, `get_alert_accuracy`,
`get_signal_effectiveness`, `get_cascade_metrics`, `get_prediction_accuracy`,
`get_supply_chain_exposure`, `get_open_chain_findings`,
`claim_telegram_report`, `read_telegram_reports`, `process_telegram_report`,
`submit_feedback`, `get_recent_fixes`, `send_telegram`,
`get_legal_risk_signals`, `get_policy_signals`, `get_bond_maturity_calendar`,
`get_public_contracts`, `get_credit_flow_signal`, `get_insider_signals`,
`get_climate_risk_signals`, `get_energy_grid_signals`,
`get_crisis_early_warning`, `get_pharma_signals`

### Dev Team Cron
`read_telegram_reports`, `claim_telegram_report`, `process_telegram_report`,
`log_fix`, `get_recent_fixes`, `send_telegram(channel="work")`, `get_system_status`

### QA Responder (07)
`get_pending_ask_questions`, `answer_ask_question`,
`get_user_requests`, `mark_user_request_answered`, `fetch_and_analyze`,
`get_market_context`, `get_positions`, `get_kinhdich_reading`, `get_market_hexagram`,
`get_bctc_full`, `get_sentiment_trend`, `get_legal_risk_signals`,
`send_telegram(channel="market")`

---

## Mandatory Agent Patterns

### Opening sequence (ALL agents)
```
Step 0: get_agent_signals(agent="{agent-name}")
Step 1: get_market_context(hours_back=24)
```

### Before reporting a bug
```
1. get_recent_fixes(10)
2. If issue title appears → SKIP (already fixed)
```

### After signal action (Alert Commander only)
```
record_signal_outcome(signal_id, "fired"|"suppressed"|"confirmed"|"false_positive")
```

---

## Inter-Agent Signal Types
| Signal | From | To | When |
|--------|------|----|------|
| `urgent_news` | News Scout | Market Watcher | Impact >= 8 news |
| `price_anomaly` | Market Watcher | Alert Commander | >2sigma move detected |
| `cross_validate` | Report Analyzer | Alert Commander | CRITICAL BCTC finding |
| `suppress` | Alert Commander | All | False positive detected |
| `legal_risk` | News Scout | Alert Commander | Prosecution/tax penalty detected |
| `crisis_velocity` | News Scout | Alert Commander | 5x mention spike for a stock |
| `chain_catalyst` | News Scout | All | Impact >= 7 watchlist catalyst |
| `fundamental_validation` | Report Analyzer | All | BCTC confirms/contradicts catalyst |
| `price_confirmation` | Market Watcher | All | Price action confirms catalyst |
| `verified_chain` | Server | Alert Commander | 2+ agent confirmations synthesized |
