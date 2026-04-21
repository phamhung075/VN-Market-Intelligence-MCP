# MCP Tools — Logic & Mapping

**Load when:** tool selection, agent rewriting, or system capability review.

## Tool Count & List

Live data → `docs/data/tool-registry.json`
Live check: `curl -s http://127.0.0.1:3000/health | jq .toolCount`

## Renamed/Removed Tools — CRITICAL

| OLD (NEVER use) | NEW |
|-----------------|-----|
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

Full removed list → `docs/data/tool-registry.json` → `removed`

## Tools Per Agent

| Agent | Tools |
|-------|-------|
| News Scout (01) | `get_agent_signals`, `get_market_context`, `fetch_and_analyze`, `run_impact_chain`, `search_similar_context`, `get_prediction_markets`, `get_rate_limit_status`, `post_agent_signal`, `get_recent_fixes`, `submit_feedback`, `get_legal_risk_signals`, `get_crisis_early_warning`, `record_evidence_fragment`, `log_agent_work` |
| Financial Analyst (02) | `get_cycle_bootstrap`, `get_user_positions_for_analysis`, `get_earnings_calendar`, `list_stored_pdfs`, `get_bctc_full`, `read_bctc_pdf`, `get_financial_summary`, `compare_stocks`, `get_sentiment_trend`, `get_sector_comparison`, `get_kinhdich_reading`, `post_agent_signal`, `get_open_chain_findings`, `get_market_summary`, `generate_market_summary`, `get_market_snapshot`, `get_legal_risk_signals`, `get_insider_signals`, `get_insider_transactions`, `record_evidence_fragment`, `send_telegram`, `get_recent_fixes`, `submit_feedback`, `log_agent_work` |
| Market Watcher (04) | `get_agent_signals`, `get_market_context`, `get_market_snapshot`, `get_price_history`, `get_patterns`, `get_sector_rotation`, `get_sector_comparison`, `get_kinhdich_reading`, `get_market_hexagram`, `get_supply_chain_exposure`, `get_alerts(type="price")`, `get_positions`, `get_portfolio_risk`, `compare_stocks`, `get_sentiment_trend`, `get_open_chain_findings`, `post_agent_signal`, `manage_alert_mute`, `get_recent_fixes`, `submit_feedback`, `get_energy_grid_signals`, `get_climate_risk_signals`, `get_crisis_early_warning`, `get_foreign_flow`, `record_evidence_fragment`, `log_agent_work` |
| Alert Commander (05) | `get_agent_signals`, `get_system_status`, `get_market_context`, `get_alerts(type="all")`, `mark_alert_read`, `send_telegram(channel="market")`, `send_alert_digest`, `record_signal_outcome`, `get_alert_accuracy`, `manage_alert_mute`, `list_alert_rules`, `post_agent_signal`, `get_recent_fixes`, `submit_feedback`, `delete_price_alert`, `get_kinhdich_reading`, `get_legal_risk_signals`, `get_crisis_early_warning`, `get_cron_health` |
| Digest & Predict (06) | `get_cycle_bootstrap`, `get_user_positions_for_analysis`, `get_watchlist`, `get_evidence_summary`, `get_calibration_report`, `create_prediction_claim`, `get_market_summary`, `generate_market_summary`, `get_bctc_full`, `compare_financials`, `get_macro_snapshot`, `get_portfolio_conviction`, `get_correlation_matrix`, `get_alert_accuracy`, `get_performance_attribution`, `get_portfolio_risk`, `get_rebalancing_signals`, `get_sector_rotation`, `get_sector_comparison`, `get_earnings_calendar`, `get_signal_effectiveness`, `get_cascade_metrics`, `get_prediction_accuracy`, `get_supply_chain_exposure`, `get_kinhdich_reading`, `get_market_hexagram`, `run_hexagram_backtest`, `get_transition_probabilities`, `explain_hexagram`, `get_hexagram_history`, `get_open_chain_findings`, `get_market_snapshot`, `send_telegram(channel="market")`, `send_telegram(channel="work")`, `read_telegram_reports`, `get_recent_fixes`, `submit_feedback`, `get_legal_risk_signals`, `get_policy_signals`, `get_bond_maturity_calendar`, `get_public_contracts`, `get_credit_flow_signal`, `get_insider_signals`, `get_climate_risk_signals`, `get_energy_grid_signals`, `get_crisis_early_warning`, `get_pharma_signals`, `get_foreign_flow`, `log_agent_work`, `get_agent_work_log` |
| Unified Coordinator | `get_agent_signals`, `get_system_status`, `get_market_context`, `get_macro_snapshot`, `get_alerts`, `get_prediction_markets`, `get_sentiment_trend`, `get_positions`, `get_portfolio_conviction`, `get_portfolio_risk`, `get_correlation_matrix`, `get_rebalancing_signals`, `get_performance_attribution`, `get_alert_accuracy`, `get_signal_effectiveness`, `get_cascade_metrics`, `get_prediction_accuracy`, `get_supply_chain_exposure`, `get_open_chain_findings`, `claim_telegram_report`, `read_telegram_reports`, `process_telegram_report`, `submit_feedback`, `get_recent_fixes`, `send_telegram`, `get_legal_risk_signals`, `get_policy_signals`, `get_bond_maturity_calendar`, `get_public_contracts`, `get_credit_flow_signal`, `get_insider_signals`, `get_climate_risk_signals`, `get_energy_grid_signals`, `get_crisis_early_warning`, `get_pharma_signals`, `get_cron_health`, `get_agent_work_log`, `get_calibration_report`, `get_foreign_flow`, `get_insider_transactions` |
| Dev Team Cron | `read_telegram_reports`, `claim_telegram_report`, `process_telegram_report`, `log_fix`, `get_recent_fixes`, `send_telegram(channel="work")`, `get_system_status`, `get_vps_proxy_health`, `get_cron_health` |
| QA Responder (07) | `get_pending_ask_questions`, `answer_ask_question`, `get_user_requests`, `mark_user_request_answered`, `fetch_and_analyze`, `get_market_context`, `get_positions`, `get_kinhdich_reading`, `get_market_hexagram`, `get_bctc_full`, `get_sentiment_trend`, `get_legal_risk_signals`, `send_telegram(channel="market")`, `get_foreign_flow`, `get_insider_transactions` |

## Shared Tools (Available to All Agents)

| Tool | Purpose | REQ | Added |
|------|---------|-----|-------|
| `validate_signal_price` | Validate signal price vs live market snapshot (±5% tolerance) | 230 | 2026-04-21 |

## Mandatory Agent Patterns

Opening sequence (ALL agents):
```
Step 0: get_cycle_bootstrap(agent_name="{agent-name}")
        replaces: get_agent_signals + get_market_context + get_system_status
```

Before reporting a bug:
```
1. get_recent_fixes(10)
2. If issue already in list → SKIP (already fixed)
```

After signal action (Alert Commander only):
```
record_signal_outcome(signal_id, "fired"|"suppressed"|"confirmed"|"false_positive")
```

## Inter-Agent Signal Types

| Signal | From | To | When |
|--------|------|----|------|
| `urgent_news` | News Scout | Market Watcher | Impact >= 8 |
| `price_anomaly` | Market Watcher | Alert Commander | >2sigma move |
| `cross_validate` | Financial Analyst | Alert Commander | CRITICAL BCTC finding |
| `suppress` | Alert Commander | All | False positive |
| `legal_risk` | News Scout | Alert Commander | Prosecution/tax penalty |
| `crisis_velocity` | News Scout | Alert Commander | 5x mention spike |
| `chain_catalyst` | News Scout | All | Impact >= 7 watchlist catalyst |
| `fundamental_validation` | Financial Analyst | Alert Commander | BCTC confirms/contradicts catalyst |
| `price_confirmation` | Market Watcher | All | Price confirms catalyst |
| `verified_chain` | Server | Alert Commander | 2+ agent confirmations synthesized |
