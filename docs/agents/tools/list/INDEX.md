# MCP Tools Documentation Index

Complete reference for all 183 MCP tools organized by category.

GENERATED from `docs/data/tool-registry.json` — do not hand-edit; registry is the SSOT.
**Registry last updated:** 2026-07-30T22:53:11.373Z
**Per-tool docs:** Each tool has a `.md` file at `docs/agents/tools/list/<tool_name>.md`

---

## Quick Navigation

| Category | Count | Docs |
|----------|-------|------|
| ALERTS | 11 | [See below](#alerts) |
| ANALYSIS | 1 | [See below](#analysis) |
| BACKTESTING | 6 | [See below](#backtesting) |
| BRIEFINGS | 14 | [See below](#briefings) |
| FINANCIAL-REPORTS | 20 | [See below](#financial-reports) |
| KINHDICH | 6 | [See below](#kinhdich) |
| MACRO | 22 | [See below](#macro) |
| MARKET-DATA | 25 | [See below](#market-data) |
| NEWS-ANALYSIS | 14 | [See below](#news-analysis) |
| PORTFOLIO | 9 | [See below](#portfolio) |
| SECTOR | 14 | [See below](#sector) |
| SYSTEM | 41 | [See below](#system) |

---

<a id="alerts"></a>
## ALERTS (11 tools)

- **[`get_alert_accuracy`](get_alert_accuracy.md)**
- **[`get_alerts`](get_alerts.md)**
- **[`get_analysis_history`](get_analysis_history.md)**
- **[`get_cron_health`](get_cron_health.md)**
- **[`get_pipeline_health`](get_pipeline_health.md)**
- **[`list_alert_rules`](list_alert_rules.md)**
- **[`manage_alert_mute`](manage_alert_mute.md)**
- **[`mark_alert_outcome`](mark_alert_outcome.md)**
- **[`mark_alert_read`](mark_alert_read.md)**
- **[`send_alert_digest`](send_alert_digest.md)**
- **[`write_alert_verdict`](write_alert_verdict.md)**

<a id="analysis"></a>
## ANALYSIS (1 tool)

- **[`sequential_market_analysis`](sequential_market_analysis.md)**

<a id="backtesting"></a>
## BACKTESTING (6 tools)

- **[`compare_backtest_runs`](compare_backtest_runs.md)**
- **[`delete_backtest_run`](delete_backtest_run.md)**
- **[`export_backtest_run_csv`](export_backtest_run_csv.md)**
- **[`get_backtest_run`](get_backtest_run.md)**
- **[`get_backtest_runs`](get_backtest_runs.md)**
- **[`run_backtest`](run_backtest.md)**

<a id="briefings"></a>
## BRIEFINGS (14 tools)

- **[`batch_review_market_messages`](batch_review_market_messages.md)**
- **[`claim_telegram_report`](claim_telegram_report.md)**
- **[`expire_monitoring_reports`](expire_monitoring_reports.md)**
- **[`generate_market_summary`](generate_market_summary.md)**
- **[`get_market_message_digest`](get_market_message_digest.md)**
- **[`get_market_summary`](get_market_summary.md)**
- **[`get_recent_fixes`](get_recent_fixes.md)**
- **[`get_unreviewed_market_messages`](get_unreviewed_market_messages.md)**
- **[`list_unresolved_reports`](list_unresolved_reports.md)**
- **[`log_fix`](log_fix.md)**
- **[`process_telegram_report`](process_telegram_report.md)**
- **[`read_telegram_reports`](read_telegram_reports.md)**
- **[`review_market_message`](review_market_message.md)**
- **[`send_telegram`](send_telegram.md)**

<a id="financial-reports"></a>
## FINANCIAL-REPORTS (20 tools)

- **[`bctc_skip_queue_item`](bctc_skip_queue_item.md)**
- **[`compare_financials`](compare_financials.md)**
- **[`finalize_bctc_refine`](finalize_bctc_refine.md)**
- **[`get_agm_plan`](get_agm_plan.md)**
- **[`get_bctc_full`](get_bctc_full.md)**
- **[`get_bctc_ocf`](get_bctc_ocf.md)**
- **[`get_bctc_page_image`](get_bctc_page_image.md)**
- **[`get_bctc_page_text`](get_bctc_page_text.md)**
- **[`get_bctc_pending_refine`](get_bctc_pending_refine.md)**
- **[`get_bctc_refined`](get_bctc_refined.md)**
- **[`get_bctc_report_id`](get_bctc_report_id.md)**
- **[`get_bctc_series`](get_bctc_series.md)**
- **[`get_cash_flow`](get_cash_flow.md)**
- **[`get_earnings_calendar`](get_earnings_calendar.md)**
- **[`get_financial_summary`](get_financial_summary.md)**
- **[`list_flagged_bctc_cells`](list_flagged_bctc_cells.md)**
- **[`list_stored_pdfs`](list_stored_pdfs.md)**
- **[`push_bctc_refined_unit`](push_bctc_refined_unit.md)**
- **[`run_bctc_batch_sweep`](run_bctc_batch_sweep.md)**
- **[`submit_bctc_correction`](submit_bctc_correction.md)**

<a id="kinhdich"></a>
## KINHDICH (6 tools)

- **[`explain_hexagram`](explain_hexagram.md)**
- **[`get_hexagram_history`](get_hexagram_history.md)**
- **[`get_kinhdich_reading`](get_kinhdich_reading.md)**
- **[`get_market_hexagram`](get_market_hexagram.md)**
- **[`get_transition_probabilities`](get_transition_probabilities.md)**
- **[`run_hexagram_backtest`](run_hexagram_backtest.md)**

<a id="macro"></a>
## MACRO (22 tools)

- **[`create_prediction_claim`](create_prediction_claim.md)**
- **[`get_calibration_report`](get_calibration_report.md)**
- **[`get_carry_trade_signal`](get_carry_trade_signal.md)**
- **[`get_cpi_components`](get_cpi_components.md)**
- **[`get_evidence_summary`](get_evidence_summary.md)**
- **[`get_fed_liquidity_spread`](get_fed_liquidity_spread.md)**
- **[`get_imf_signals`](get_imf_signals.md)**
- **[`get_investment_clock_phase`](get_investment_clock_phase.md)**
- **[`get_ism_subcomponents`](get_ism_subcomponents.md)**
- **[`get_label_accuracy_report`](get_label_accuracy_report.md)**
- **[`get_macro_calendar`](get_macro_calendar.md)**
- **[`get_macro_snapshot`](get_macro_snapshot.md)**
- **[`get_policy_signals`](get_policy_signals.md)**
- **[`get_prediction_accuracy`](get_prediction_accuracy.md)**
- **[`get_pyramid_tier`](get_pyramid_tier.md)**
- **[`get_rate_limit_status`](get_rate_limit_status.md)**
- **[`get_vn_bop`](get_vn_bop.md)**
- **[`get_vn_liquidity_state`](get_vn_liquidity_state.md)**
- **[`get_vn_macro_indicators`](get_vn_macro_indicators.md)**
- **[`get_vn_trade_balance`](get_vn_trade_balance.md)**
- **[`get_yield_spread_signal`](get_yield_spread_signal.md)**
- **[`record_evidence_fragment`](record_evidence_fragment.md)**

<a id="market-data"></a>
## MARKET-DATA (25 tools)

- **[`delete_price_alert`](delete_price_alert.md)**
- **[`diagnose_foreign_flow_circuit_breaker`](diagnose_foreign_flow_circuit_breaker.md)**
- **[`get_52w_proximity`](get_52w_proximity.md)**
- **[`get_breadth_thrust`](get_breadth_thrust.md)**
- **[`get_company_profile`](get_company_profile.md)**
- **[`get_foreign_accum_rank`](get_foreign_accum_rank.md)**
- **[`get_foreign_flow`](get_foreign_flow.md)**
- **[`get_foreign_room`](get_foreign_room.md)**
- **[`get_insider_sentiment`](get_insider_sentiment.md)**
- **[`get_insider_transactions`](get_insider_transactions.md)**
- **[`get_market_breadth`](get_market_breadth.md)**
- **[`get_market_cap`](get_market_cap.md)**
- **[`get_market_context`](get_market_context.md)**
- **[`get_market_foreign_flow`](get_market_foreign_flow.md)**
- **[`get_market_snapshot`](get_market_snapshot.md)**
- **[`get_money_radar_composite`](get_money_radar_composite.md)**
- **[`get_patterns`](get_patterns.md)**
- **[`get_price_history`](get_price_history.md)**
- **[`get_relative_strength`](get_relative_strength.md)**
- **[`get_roc_momentum`](get_roc_momentum.md)**
- **[`get_technical_indicators`](get_technical_indicators.md)**
- **[`get_ticker_intelligence`](get_ticker_intelligence.md)**
- **[`get_volatility_indicators`](get_volatility_indicators.md)**
- **[`reset_foreign_flow_circuit_breaker`](reset_foreign_flow_circuit_breaker.md)**
- **[`set_price_alert`](set_price_alert.md)**

<a id="news-analysis"></a>
## NEWS-ANALYSIS (14 tools)

- **[`compare_stocks`](compare_stocks.md)**
- **[`fetch_and_analyze`](fetch_and_analyze.md)**
- **[`get_agent_signals`](get_agent_signals.md)**
- **[`get_cascade_metrics`](get_cascade_metrics.md)**
- **[`get_cascade_outcomes`](get_cascade_outcomes.md)**
- **[`get_market_sentiment_index`](get_market_sentiment_index.md)**
- **[`get_open_chain_findings`](get_open_chain_findings.md)**
- **[`get_recent_signals`](get_recent_signals.md)**
- **[`get_sentiment_trend`](get_sentiment_trend.md)**
- **[`get_signal_effectiveness`](get_signal_effectiveness.md)**
- **[`post_agent_signal`](post_agent_signal.md)**
- **[`record_signal_outcome`](record_signal_outcome.md)**
- **[`run_impact_chain`](run_impact_chain.md)**
- **[`search_similar_context`](search_similar_context.md)**

<a id="portfolio"></a>
## PORTFOLIO (9 tools)

- **[`close_position`](close_position.md)**
- **[`get_performance_attribution`](get_performance_attribution.md)**
- **[`get_portfolio_conviction`](get_portfolio_conviction.md)**
- **[`get_portfolio_risk`](get_portfolio_risk.md)**
- **[`get_positions`](get_positions.md)**
- **[`get_rebalancing_signals`](get_rebalancing_signals.md)**
- **[`get_target_allocation`](get_target_allocation.md)**
- **[`get_user_positions_for_analysis`](get_user_positions_for_analysis.md)**
- **[`set_position`](set_position.md)**

<a id="sector"></a>
## SECTOR (14 tools)

- **[`get_bond_maturity_calendar`](get_bond_maturity_calendar.md)**
- **[`get_broker_credibility`](get_broker_credibility.md)**
- **[`get_climate_risk_signals`](get_climate_risk_signals.md)**
- **[`get_correlation_matrix`](get_correlation_matrix.md)**
- **[`get_credit_flow_signal`](get_credit_flow_signal.md)**
- **[`get_crisis_early_warning`](get_crisis_early_warning.md)**
- **[`get_energy_grid_signals`](get_energy_grid_signals.md)**
- **[`get_insider_signals`](get_insider_signals.md)**
- **[`get_legal_risk_signals`](get_legal_risk_signals.md)**
- **[`get_pharma_signals`](get_pharma_signals.md)**
- **[`get_public_contracts`](get_public_contracts.md)**
- **[`get_sector_comparison`](get_sector_comparison.md)**
- **[`get_sector_rotation`](get_sector_rotation.md)**
- **[`get_supply_chain_exposure`](get_supply_chain_exposure.md)**

<a id="system"></a>
## SYSTEM (41 tools)

- **[`add_to_watchlist`](add_to_watchlist.md)**
- **[`answer_ask_question`](answer_ask_question.md)**
- **[`append_session_record`](append_session_record.md)**
- **[`cancel_scheduled_task`](cancel_scheduled_task.md)**
- **[`claim_due_scheduled_tasks`](claim_due_scheduled_tasks.md)**
- **[`complete_scheduled_task`](complete_scheduled_task.md)**
- **[`emit_pressure_state`](emit_pressure_state.md)**
- **[`expire_scheduled_task`](expire_scheduled_task.md)**
- **[`fail_scheduled_task`](fail_scheduled_task.md)**
- **[`get_agent_work_log`](get_agent_work_log.md)**
- **[`get_cycle_bootstrap`](get_cycle_bootstrap.md)**
- **[`get_memory_files`](get_memory_files.md)**
- **[`get_pending_ask_questions`](get_pending_ask_questions.md)**
- **[`get_signal_rejection_summary`](get_signal_rejection_summary.md)**
- **[`get_sla_status`](get_sla_status.md)**
- **[`get_system_status`](get_system_status.md)**
- **[`get_vps_proxy_health`](get_vps_proxy_health.md)**
- **[`get_vps_service_health`](get_vps_service_health.md)**
- **[`get_watchlist`](get_watchlist.md)**
- **[`get_week_period`](get_week_period.md)**
- **[`list_scheduled_tasks`](list_scheduled_tasks.md)**
- **[`log_agent_work`](log_agent_work.md)**
- **[`remove_from_watchlist`](remove_from_watchlist.md)**
- **[`restart_vps_service`](restart_vps_service.md)**
- **[`run_qa_responder`](run_qa_responder.md)**
- **[`schedule_task`](schedule_task.md)**
- **[`search_memory_by_trigger`](search_memory_by_trigger.md)**
- **[`smart_compact`](smart_compact.md)**
- **[`submit_feedback`](submit_feedback.md)**
- **[`task_claim`](task_claim.md)**
- **[`task_force_release_orphan`](task_force_release_orphan.md)**
- **[`task_heartbeat`](task_heartbeat.md)**
- **[`task_list_held`](task_list_held.md)**
- **[`task_release`](task_release.md)**
- **[`trigger_bctc_vps_fetch`](trigger_bctc_vps_fetch.md)**
- **[`trigger_foreign_flow_vps_fetch`](trigger_foreign_flow_vps_fetch.md)**
- **[`trigger_news_vps_fetch`](trigger_news_vps_fetch.md)**
- **[`trigger_price_vps_fetch`](trigger_price_vps_fetch.md)**
- **[`trigger_sbv_vps_fetch`](trigger_sbv_vps_fetch.md)**
- **[`update_memory_file`](update_memory_file.md)**
- **[`update_thresholds`](update_thresholds.md)**

---

## Usage

Each tool is documented in `docs/agents/tools/list/<tool_name>.md` with:
- **Purpose** — What the tool does (1 line)
- **Parameters** — Input schema with types
- **Returns** — Output format (1 line)
- **Example** — Usage code snippet

## Calling Tools

All tools are invoked via the MCP gateway:

```javascript
call_tool(
  server: "vn-market",
  tool: "<tool_name>",
  arguments: { ... }
)
```

See `docs/standards/mcp-tools.md` for full gateway documentation.

## Agent Tool Packages

Per-agent tool packages are in `docs/agents/tools/package/<agent>.md`
Each package lists the tools that agent is permitted to use.

## Discovery

- **All tools:** this file (INDEX.md)
- **Tool details:** `docs/agents/tools/list/<tool>.md`
- **Per-agent:** `docs/agents/tools/package/<agent>.md`
- **Removed/renamed:** `docs/standards/mcp-tools.md` → "Renamed/Removed Tools" section

---

*Generated by `scripts/gen-tools-index.sh` from `docs/data/tool-registry.json`. Re-run after any registry change — never hand-edit this file.*
